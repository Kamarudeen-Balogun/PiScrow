import { z } from "zod";

import {
  approvePiPayment,
  getPiPayment,
  hasPiNetworkApiKey,
} from "@/lib/pi-platform";
import { jsonError, requireAppUser } from "@/server/auth";
import {
  assertNoCompletedPayment,
  validatePiEscrowPayment,
} from "@/server/pi-payments";
import {
  rateLimit,
  rateLimitProfiles,
  readJsonBody,
  secureJson,
} from "@/server/security";
import {
  getServiceClientOrThrow,
  getTradeForAction,
} from "@/server/trades";

const approveSchema = z.object({
  paymentId: z.string().min(1),
  tradeId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    await rateLimit(request, { key: "pi-approve:post", ...rateLimitProfiles.payment });
    const parsed = approveSchema.safeParse(await readJsonBody(request));

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid approval request.");
    }

    if (!hasPiNetworkApiKey()) {
      throw new Error("PI_NETWORK_API_KEY is not configured.");
    }

    const user = await requireAppUser(request);
    const trade = await getTradeForAction(parsed.data.tradeId);
    await assertNoCompletedPayment(parsed.data.tradeId);

    const paymentBeforeApproval = await getPiPayment(parsed.data.paymentId);
    const supabase = getServiceClientOrThrow();
    const { buyerTotal, platformFee, sellerAmount } = validatePiEscrowPayment({
      payment: paymentBeforeApproval,
      trade,
      user,
    });
    const payment = await approvePiPayment(parsed.data.paymentId);

    const { error } = await supabase.from("payments").upsert(
      {
        trade_id: parsed.data.tradeId,
        pi_payment_id: parsed.data.paymentId,
        amount_test_pi: buyerTotal,
        seller_amount_test_pi: sellerAmount,
        platform_fee_test_pi: platformFee,
        buyer_total_test_pi: buyerTotal,
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
