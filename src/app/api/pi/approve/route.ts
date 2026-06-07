import { z } from "zod";

import { calculateBuyerTotal, calculatePlatformFee } from "@/lib/fees";
import { approvePiPayment } from "@/lib/pi-platform";
import { jsonError, requireAppUser } from "@/server/auth";
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
} from "@/server/trades";

const approveSchema = z.object({
  paymentId: z.string().min(1),
  tradeId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    rateLimit(request, { key: "pi-approve:post", ...rateLimitProfiles.payment });
    const parsed = approveSchema.safeParse(await readJsonBody(request));

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid approval request.");
    }

    if (!process.env.PI_API_KEY) {
      return secureJson({
        mode: "demo",
        message:
          "PI_API_KEY is not configured. Approval was simulated for local testnet UI.",
        paymentId: parsed.data.paymentId,
        tradeId: parsed.data.tradeId,
      });
    }

    const user = await requireAppUser(request);
    const trade = await getTradeForAction(parsed.data.tradeId);
    assertBuyer(trade, user);
    assertTradeStatus(trade, ["PendingFunding"]);

    const payment = await approvePiPayment(parsed.data.paymentId);
    const supabase = getServiceClientOrThrow();
    const amount = Number(payment.amount);
    const sellerAmount = Number(trade.amount_test_pi);
    const platformFee = calculatePlatformFee(sellerAmount);
    const expectedAmount = calculateBuyerTotal(sellerAmount);

    if (amount !== expectedAmount) {
      throw new Error("Pi payment amount does not match the trade total.");
    }

    const { error } = await supabase.from("payments").upsert(
      {
        trade_id: parsed.data.tradeId,
        pi_payment_id: parsed.data.paymentId,
        amount_test_pi: amount,
        seller_amount_test_pi: sellerAmount,
        platform_fee_test_pi: platformFee,
        buyer_total_test_pi: expectedAmount,
        status: "Approved",
        raw_provider_status: payment,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "pi_payment_id" },
    );

    if (error) {
      throw new Error(error.message);
    }

    return secureJson({
      mode: "platform",
      payment,
      tradeId: parsed.data.tradeId,
    });
  } catch (error) {
    return jsonError(error, 502);
  }
}
