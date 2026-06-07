import { NextResponse } from "next/server";

import { deliveryProofSchema } from "@/lib/validation";
import { jsonError, requireAppUser } from "@/server/auth";
import { createNotification } from "@/server/notifications";
import {
  assertSeller,
  assertTradeStatus,
  getServiceClientOrThrow,
  getTradeForAction,
  insertTradeEvent,
  listTradesForUser,
} from "@/server/trades";

export async function POST(
  request: Request,
  context: { params: Promise<{ tradeId: string }> },
) {
  try {
    const user = await requireAppUser(request);
    const { tradeId } = await context.params;
    const parsed = deliveryProofSchema.safeParse({
      ...(await request.json()),
      tradeId,
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid delivery proof.");
    }

    const trade = await getTradeForAction(tradeId);
    assertSeller(trade, user);
    assertTradeStatus(trade, ["Funded"]);

    const supabase = getServiceClientOrThrow();
    const { error } = await supabase
      .from("trades")
      .update({
        status: "DeliverySubmitted",
        delivery_proof_note: parsed.data.deliveryProofNote,
        delivery_proof_url: parsed.data.deliveryProofUrl || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tradeId);

    if (error) {
      throw new Error(error.message);
    }

    await insertTradeEvent(
      tradeId,
      user.id,
      "Delivery submitted",
      parsed.data.deliveryProofNote,
    );

    await createNotification({
      userId: trade.buyer_user_id,
      tradeId,
      type: "delivery_submitted",
      title: "Package proof submitted",
      body: `@${user.username} submitted seller delivery proof for your review.`,
    });

    return NextResponse.json(await listTradesForUser(user));
  } catch (error) {
    return jsonError(error);
  }
}
