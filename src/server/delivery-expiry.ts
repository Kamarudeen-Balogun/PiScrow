import { executeEscrowRelease, markEscrowReleaseFailed } from "@/server/escrow-release";
import { createNotification } from "@/server/notifications";
import { closeTradeChatRoom } from "@/server/trade-chat";
import {
  getServiceClientOrThrow,
  insertTradeEvent,
  type TradeRow,
} from "@/server/trades";

const deliveryExpirySystemUsername = "piscrow_system";
const deliveryExpiryResolution =
  "Seller did not submit delivery proof within 7 days of buyer funding. PiScrow automatically refunded the buyer in full.";

type DeliveryExpiryOutcome = {
  failed: Array<{ tradeId: string; error: string }>;
  processed: string[];
  skipped: string[];
};

function refundFailureMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 600);
  }

  return "Automatic buyer refund failed during delivery expiry processing.";
}

function tradeIsExpiredFundedTrade(trade: TradeRow) {
  return Boolean(
    trade.status === "Funded" &&
      trade.delivery_due_at &&
      new Date(trade.delivery_due_at).getTime() <= Date.now(),
  );
}

async function getExpiredFundedTrades(limit: number, tradeId?: string) {
  const supabase = getServiceClientOrThrow();

  if (tradeId) {
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .eq("id", tradeId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data ? [data as TradeRow] : [];
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("status", "Funded")
    .not("delivery_due_at", "is", null)
    .lte("delivery_due_at", now)
    .order("delivery_due_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as TradeRow[];
}

async function markTradeExpiredAndRefunded(trade: TradeRow) {
  const supabase = getServiceClientOrThrow();
  const now = new Date().toISOString();

  const releaseResult = await executeEscrowRelease({
    actor: {
      id: null,
      username: deliveryExpirySystemUsername,
    },
    notes: deliveryExpiryResolution,
    releaseType: "buyer_refund",
    trade,
  });

  const { error: tradeError } = await supabase
    .from("trades")
    .update({
      status: "Cancelled",
      cancelled_at: now,
      delivery_expired_at: now,
      updated_at: now,
    })
    .eq("id", trade.id)
    .eq("status", "Funded");

  if (tradeError) {
    throw new Error(tradeError.message);
  }

  await insertTradeEvent(
    trade.id,
    null,
    "Delivery window expired",
    deliveryExpiryResolution,
    {
      deliveryDueAt: trade.delivery_due_at,
      releasePiPaymentId:
        "releasePiPaymentId" in releaseResult
          ? releaseResult.releasePiPaymentId
          : releaseResult.payment.release_pi_payment_id,
      releaseTxid: releaseResult.releaseTxid,
    },
  );

  await closeTradeChatRoom(
    {
      ...trade,
      cancelled_at: now,
      delivery_expired_at: now,
      status: "Cancelled",
      updated_at: now,
    },
    "Delivery window expired. Buyer refund completed and chat is now read-only for record keeping.",
  );

  await Promise.all([
    createNotification({
      userId: trade.buyer_user_id,
      tradeId: trade.id,
      type: "delivery_expired_refund",
      title: "Buyer refund completed",
      body: "The seller did not submit delivery proof within 7 days. PiScrow refunded your funded Test Pi in full.",
    }),
    createNotification({
      userId: trade.seller_user_id,
      tradeId: trade.id,
      type: "delivery_expired_refund",
      title: "Trade expired and refunded",
      body: "This funded trade expired after 7 days without seller delivery proof. PiScrow refunded the buyer in full.",
    }),
  ]);
}

export async function processExpiredDeliveries(params?: {
  limit?: number;
  tradeId?: string;
}): Promise<DeliveryExpiryOutcome> {
  const limit = Math.max(1, Math.min(params?.limit ?? 25, 100));
  const rows = await getExpiredFundedTrades(limit, params?.tradeId);
  const outcome: DeliveryExpiryOutcome = {
    failed: [],
    processed: [],
    skipped: [],
  };

  for (const trade of rows) {
    if (!tradeIsExpiredFundedTrade(trade)) {
      outcome.skipped.push(trade.id);
      continue;
    }

    try {
      await markTradeExpiredAndRefunded(trade);
      outcome.processed.push(trade.id);
    } catch (error) {
      const failure = refundFailureMessage(error);

      await Promise.allSettled([
        markEscrowReleaseFailed({
          failure,
          releaseType: "buyer_refund",
          tradeId: trade.id,
        }),
        insertTradeEvent(
          trade.id,
          null,
          "Delivery auto-refund failed",
          failure,
          { deliveryDueAt: trade.delivery_due_at },
        ),
        createNotification({
          userId: trade.buyer_user_id,
          tradeId: trade.id,
          type: "delivery_expired_refund_failed",
          title: "Buyer refund needs review",
          body: "PiScrow detected an expired delivery window, but the automatic buyer refund needs another review.",
        }),
        createNotification({
          userId: trade.seller_user_id,
          tradeId: trade.id,
          type: "delivery_expired_refund_failed",
          title: "Expired trade needs review",
          body: "PiScrow detected an expired delivery window, but the automatic buyer refund needs another review.",
        }),
      ]);

      outcome.failed.push({ tradeId: trade.id, error: failure });
    }
  }

  return outcome;
}
