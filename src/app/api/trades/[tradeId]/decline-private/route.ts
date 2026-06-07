import { NextResponse } from "next/server";

import { jsonError, normalizePiUsername, requireAppUser } from "@/server/auth";
import {
  assertTradeIsOpenForInterest,
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
    const trade = await getTradeForAction(tradeId);
    const normalizedUsername = normalizePiUsername(user.username);
    const targetUsernames = trade.target_buyer_pi_usernames ?? [];

    assertTradeIsOpenForInterest(trade);

    if (trade.visibility !== "private") {
      throw new Error("Only private offers can be declined this way.");
    }

    if (!targetUsernames.includes(normalizedUsername)) {
      throw new Error("This private offer is not assigned to your Pi username.");
    }

    if (trade.seller_user_id === user.id) {
      throw new Error("The seller cannot decline their own private offer.");
    }

    const supabase = getServiceClientOrThrow();
    const now = new Date().toISOString();
    const { data: existingInterest, error: existingError } = await supabase
      .from("trade_interests")
      .select("id")
      .eq("trade_id", tradeId)
      .eq("buyer_user_id", user.id)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (existingInterest) {
      const { error } = await supabase
        .from("trade_interests")
        .update({
          status: "Withdrawn",
          updated_at: now,
        })
        .eq("id", existingInterest.id);

      if (error) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabase.from("trade_interests").insert({
        trade_id: tradeId,
        buyer_user_id: user.id,
        buyer_pi_username: normalizedUsername,
        response_note: "Private request declined.",
        status: "Withdrawn",
      });

      if (error) {
        throw new Error(error.message);
      }
    }

    const { error: tradeError } = await supabase
      .from("trades")
      .update({
        target_buyer_pi_usernames: targetUsernames.filter(
          (username) => username !== normalizedUsername,
        ),
        updated_at: now,
      })
      .eq("id", tradeId);

    if (tradeError) {
      throw new Error(tradeError.message);
    }

    await insertTradeEvent(
      tradeId,
      user.id,
      "Private offer declined",
      `@${normalizedUsername} declined the private offer.`,
    );

    return NextResponse.json(await listTradesForUser(user));
  } catch (error) {
    return jsonError(error);
  }
}
