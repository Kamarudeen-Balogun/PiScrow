import { z } from "zod";

import { buildDeliveryDueAt } from "@/lib/trade-deadlines";
import {
  completePiPayment,
  getPiPayment,
  hasPiNetworkApiKey,
  piTransactionLink,
} from "@/lib/pi-platform";
import { jsonError, requireAppUser } from "@/server/auth";
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
  listTradesForUser,
  paymentVerifiedEvent,
} from "@/server/trades";

const completeSchema = z.object({
  paymentId: z.string().min(1),
  tradeId: z.string().min(1),
  txid: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    await rateLimit(request, { key: "pi-complete:post", ...rateLimitProfiles.payment });
    const parsed = completeSchema.safeParse(await readJsonBody(request));

    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ?? "Invalid completion request.",
      );
    }

    if (!hasPiNetworkApiKey()) {
      throw new Error("PI_NETWORK_API_KEY is not configured.");
    }

    const user = await requireAppUser(request);
    const trade = await getTradeForAction(parsed.data.tradeId);
    const supabase = getServiceClientOrThrow();
    const completedPayment = await getCompletedPaymentForTrade(parsed.data.tradeId);

    if (
      completedPayment &&
      completedPayment.pi_payment_id !== parsed.data.paymentId
    ) {
      throw new Error("This trade already has a completed payment.");
    }

    const paymentBeforeCompletion = await getPiPayment(parsed.data.paymentId);
    const amounts = validatePiEscrowPayment({
      payment: paymentBeforeCompletion,
      trade,
      user,
      allowExpiredSelection: true,
    });

    if (completedPayment) {
      const payload = await listTradesForUser(user);

      return secureJson({
        mode: "already_completed",
        payment: paymentBeforeCompletion,
        tradeId: parsed.data.tradeId,
        ...payload,
      });
    }

    const payment = await completePiPayment(
      parsed.data.paymentId,
      parsed.data.txid,
    );
    validatePiEscrowPayment({
      payment,
      trade,
      user,
      allowExpiredSelection: true,
    });

    const { error: paymentError } = await supabase.from("payments").upsert(
      {
        trade_id: parsed.data.tradeId,
        pi_payment_id: parsed.data.paymentId,
        amount_test_pi: amounts.buyerTotal,
        seller_amount_test_pi: amounts.sellerAmount,
        platform_fee_test_pi: amounts.platformFee,
        buyer_total_test_pi: amounts.buyerTotal,
        status: "Completed",
        buyer_payment_txid:
          payment.transaction?.txid ?? parsed.data.txid,
        buyer_payment_link:
          payment.transaction?._link ??
          piTransactionLink(payment.transaction?.txid ?? parsed.data.txid),
        escrow_status: "held_in_app",
        release_status: "NotStarted",
        raw_provider_status: payment,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "pi_payment_id" },
    );

    if (paymentError) {
      throw new Error(paymentError.message);
    }

    const now = Date.now();
    const deliveryDueAt = buildDeliveryDueAt(now);
    const { error: tradeError } = await supabase
      .from("trades")
      .update({
        status: "Funded",
        delivery_due_at: deliveryDueAt,
        delivery_expired_at: null,
        updated_at: new Date(now).toISOString(),
      })
      .eq("id", parsed.data.tradeId);

    if (tradeError) {
      throw new Error(tradeError.message);
    }

    await ensureTradeChatRoom({ ...trade, status: "Funded" });
    await addTradeChatSystemMessage(
      { ...trade, status: "Funded" },
      `Buyer @${user.username} funded the trade. Seller can now submit delivery proof here.`,
    );

    await insertTradeEvent(
      parsed.data.tradeId,
      user.id,
      "Payment completed",
      paymentVerifiedEvent(amounts.sellerAmount),
      { piPaymentId: parsed.data.paymentId, txid: parsed.data.txid },
    );
    await createNotification({
      userId: trade.seller_user_id,
      tradeId: parsed.data.tradeId,
      type: "payment_completed",
      title: "Trade funded",
      body: `@${user.username} funded the trade. Submit seller delivery proof within 7 days or PiScrow refunds the buyer automatically.`,
    });

    const payload = await listTradesForUser(user);

    return secureJson({
      mode: "platform",
      payment,
      tradeId: parsed.data.tradeId,
      ...payload,
    });
  } catch (error) {
    return jsonError(error, 502);
  }
}
