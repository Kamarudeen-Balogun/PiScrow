import { z } from "zod";

import {
  completePiPayment,
  getPiPayment,
  hasPiNetworkApiKey,
  piTransactionLink,
} from "@/lib/pi-platform";
import { normalizePiUsername, type AppUser, jsonError } from "@/server/auth";
import { createNotification } from "@/server/notifications";
import {
  getCompletedPaymentForTrade,
  validatePiEscrowPayment,
} from "@/server/pi-payments";
import {
  rateLimit,
  rateLimitProfiles,
  readJsonBody,
  secureJson,
} from "@/server/security";
import { addTradeChatSystemMessage, ensureTradeChatRoom } from "@/server/trade-chat";
import {
  getServiceClientOrThrow,
  getTradeForAction,
  insertTradeEvent,
  paymentVerifiedEvent,
} from "@/server/trades";

type UserRow = {
  id: string;
  pi_uid: string;
  pi_username: string;
};

const incompleteSchema = z.object({
  paymentId: z.string().min(1),
});

function metadataTradeId(metadata: Record<string, unknown> | undefined) {
  const tradeId = metadata?.tradeId;

  if (typeof tradeId !== "string" || tradeId.length === 0) {
    throw new Error("Incomplete Pi payment is missing PiScrow trade metadata.");
  }

  return tradeId;
}

async function getAppUserFromPayment(paymentUserUid: string): Promise<AppUser> {
  const supabase = getServiceClientOrThrow();
  const { data, error } = await supabase
    .from("users")
    .select("id, pi_uid, pi_username")
    .eq("pi_uid", paymentUserUid)
    .single();

  if (error || !data) {
    throw new Error(
      error?.message ?? "Incomplete Pi payment user is not registered in PiScrow.",
    );
  }

  const row = data as UserRow;

  return {
    id: row.id,
    uid: row.pi_uid,
    username: normalizePiUsername(row.pi_username),
    isAdmin: false,
  };
}

export async function POST(request: Request) {
  try {
    await rateLimit(request, {
      key: "pi-incomplete:post",
      ...rateLimitProfiles.payment,
    });
    const parsed = incompleteSchema.safeParse(await readJsonBody(request));

    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ?? "Invalid incomplete payment request.",
      );
    }

    if (!hasPiNetworkApiKey()) {
      throw new Error("PI_NETWORK_API_KEY is not configured.");
    }

    const payment = await getPiPayment(parsed.data.paymentId);
    const tradeId = metadataTradeId(payment.metadata);
    const trade = await getTradeForAction(tradeId);
    const user = await getAppUserFromPayment(payment.user_uid);
    const completedPaymentRow = await getCompletedPaymentForTrade(tradeId);

    if (
      completedPaymentRow &&
      completedPaymentRow.pi_payment_id !== parsed.data.paymentId
    ) {
      throw new Error("This trade already has a completed payment.");
    }

    const { buyerTotal, platformFee, sellerAmount } = validatePiEscrowPayment({
      payment,
      trade,
      user,
      allowExpiredSelection: true,
    });

    const txid = payment.transaction?.txid;

    if (payment.status?.developer_completed || completedPaymentRow) {
      return secureJson({
        mode: "already_completed",
        payment,
        tradeId,
      });
    }

    if (!payment.status?.developer_approved) {
      throw new Error(
        "Incomplete Pi payment is not ready for server completion yet.",
      );
    }

    if (!payment.status?.transaction_verified || !txid) {
      throw new Error(
        "Incomplete Pi payment transaction is not verified yet. Finish it in Pi Browser.",
      );
    }

    const completedPayment = await completePiPayment(parsed.data.paymentId, txid);
    const supabase = getServiceClientOrThrow();
    const { error: paymentError } = await supabase.from("payments").upsert(
      {
        trade_id: tradeId,
        pi_payment_id: parsed.data.paymentId,
        amount_test_pi: buyerTotal,
        seller_amount_test_pi: sellerAmount,
        platform_fee_test_pi: platformFee,
        buyer_total_test_pi: buyerTotal,
        status: "Completed",
        buyer_payment_txid: completedPayment.transaction?.txid ?? txid,
        buyer_payment_link:
          completedPayment.transaction?._link ??
          piTransactionLink(completedPayment.transaction?.txid ?? txid),
        escrow_status: "held_in_app",
        release_status: "NotStarted",
        raw_provider_status: completedPayment,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "pi_payment_id" },
    );

    if (paymentError) {
      throw new Error(paymentError.message);
    }

    const { error: tradeError } = await supabase
      .from("trades")
      .update({
        status: "Funded",
        updated_at: new Date().toISOString(),
      })
      .eq("id", tradeId);

    if (tradeError) {
      throw new Error(tradeError.message);
    }

    await ensureTradeChatRoom({ ...trade, status: "Funded" });
    await addTradeChatSystemMessage(
      { ...trade, status: "Funded" },
      `Buyer @${user.username} funded the trade. Seller can now submit delivery proof here.`,
    );

    await insertTradeEvent(
      tradeId,
      user.id,
      "Payment completed",
      paymentVerifiedEvent(sellerAmount),
      { piPaymentId: parsed.data.paymentId, txid, recovered: true },
    );
    await createNotification({
      userId: trade.seller_user_id,
      tradeId,
      type: "payment_completed",
      title: "Trade funded",
      body: `@${user.username} funded the trade. You can now submit package proof.`,
    });

    return secureJson({
      mode: "recovered",
      payment: completedPayment,
      tradeId,
    });
  } catch (error) {
    return jsonError(error, 502);
  }
}
