import { NextResponse } from "next/server";

import { disputeSchema } from "@/lib/validation";
import { jsonError, normalizePiUsername, requireAppUser } from "@/server/auth";
import { createNotification } from "@/server/notifications";
import {
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
    const parsed = disputeSchema.safeParse({ ...(await request.json()), tradeId });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid dispute form.");
    }

    const trade = await getTradeForAction(tradeId);
    const isBuyer = trade.buyer_user_id === user.id;
    const isSeller =
      normalizePiUsername(trade.seller_pi_username) === normalizePiUsername(user.username);

    if (!isBuyer && !isSeller) {
      throw new Error("Only the buyer or seller can dispute this trade.");
    }

    if (["Completed", "Cancelled", "Disputed"].includes(trade.status)) {
      throw new Error(`Cannot dispute a ${trade.status} trade.`);
    }

    const supabase = getServiceClientOrThrow();
    const { error: disputeError } = await supabase.from("disputes").insert({
      trade_id: tradeId,
      opened_by_user_id: user.id,
      reason: parsed.data.reason,
      evidence_note: parsed.data.evidenceNote ?? null,
      status: "Open",
    });

    if (disputeError) {
      throw new Error(disputeError.message);
    }

    const { error: tradeError } = await supabase
      .from("trades")
      .update({
        status: "Disputed",
        disputed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", tradeId);

    if (tradeError) {
      throw new Error(tradeError.message);
    }

    await insertTradeEvent(tradeId, user.id, "Dispute opened", parsed.data.reason);

    await createNotification({
      userId: isBuyer ? trade.seller_user_id : trade.buyer_user_id,
      tradeId,
      type: "dispute_opened",
      title: "Dispute opened",
      body: `@${user.username} opened a dispute on this trade.`,
    });

    return NextResponse.json(await listTradesForUser(user));
  } catch (error) {
    return jsonError(error);
  }
}
