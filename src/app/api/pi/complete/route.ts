import { z } from "zod";

import { calculateBuyerTotal, calculatePlatformFee } from "@/lib/fees";
import { completePiPayment } from "@/lib/pi-platform";
import { jsonError, requireAppUser } from "@/server/auth";
import { createNotification } from "@/server/notifications";
import {
  rateLimit,
  rateLimitProfiles,
  readJsonBody,
  secureJson,
} from "@/server/security";
import {
  assertBuyer,
  assertTradeStatus,
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
    rateLimit(request, { key: "pi-complete:post", ...rateLimitProfiles.payment });
    const parsed = completeSchema.safeParse(await readJsonBody(request));

    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ?? "Invalid completion request.",
      );
    }

    if (!process.env.PI_API_KEY) {
      return secureJson({
        mode: "demo",
        message:
          "PI_API_KEY is not configured. Completion was simulated for local testnet UI.",
        paymentId: parsed.data.paymentId,
        tradeId: parsed.data.tradeId,
        txid: parsed.data.txid,
      });
    }

    const user = await requireAppUser(request);
    const trade = await getTradeForAction(parsed.data.tradeId);
    assertBuyer(trade, user);
    assertTradeStatus(trade, ["PendingFunding"]);

    const payment = await completePiPayment(
      parsed.data.paymentId,
      parsed.data.txid,
    );
    const amount = Number(payment.amount);
    const sellerAmount = Number(trade.amount_test_pi);
    const platformFee = calculatePlatformFee(sellerAmount);
    const expectedAmount = calculateBuyerTotal(sellerAmount);

    if (amount !== expectedAmount) {
      throw new Error("Pi payment amount does not match the trade total.");
    }

    const supabase = getServiceClientOrThrow();
    const { error: paymentError } = await supabase.from("payments").upsert(
      {
        trade_id: parsed.data.tradeId,
        pi_payment_id: parsed.data.paymentId,
        amount_test_pi: amount,
        seller_amount_test_pi: sellerAmount,
        platform_fee_test_pi: platformFee,
        buyer_total_test_pi: expectedAmount,
        status: "Completed",
        raw_provider_status: payment,
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
      .eq("id", parsed.data.tradeId);

    if (tradeError) {
      throw new Error(tradeError.message);
    }

    await insertTradeEvent(
      parsed.data.tradeId,
      user.id,
      "Payment completed",
      paymentVerifiedEvent(sellerAmount),
      { piPaymentId: parsed.data.paymentId, txid: parsed.data.txid },
    );
    await createNotification({
      userId: trade.seller_user_id,
      tradeId: parsed.data.tradeId,
      type: "payment_completed",
      title: "Trade funded",
      body: `@${user.username} funded the trade. You can now submit package proof.`,
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
