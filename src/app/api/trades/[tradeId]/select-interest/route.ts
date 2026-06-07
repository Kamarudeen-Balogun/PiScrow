import { selectTradeInterestSchema } from "@/lib/validation";
import { jsonError, requireAppUser } from "@/server/auth";
import { createNotification } from "@/server/notifications";
import {
  rateLimit,
  rateLimitProfiles,
  readJsonObject,
  secureJson,
} from "@/server/security";
import {
  assertTradeIsOpenForInterest,
  assertTradeListingOwner,
  getServiceClientOrThrow,
  getTradeForAction,
  getTradeInterestForAction,
  insertTradeEvent,
  listTradesForUser,
  sellerSelectedBuyerEvent,
} from "@/server/trades";

export async function POST(
  request: Request,
  context: { params: Promise<{ tradeId: string }> },
) {
  try {
    rateLimit(request, { key: "select-interest:post", ...rateLimitProfiles.write });
    const user = await requireAppUser(request);
    const { tradeId } = await context.params;
    const parsed = selectTradeInterestSchema.safeParse({
      ...(await readJsonObject(request)),
      tradeId,
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid selection.");
    }

    const trade = await getTradeForAction(tradeId);
    assertTradeListingOwner(trade, user);
    assertTradeIsOpenForInterest(trade);

    const interest = await getTradeInterestForAction(parsed.data.interestId);

    if (interest.trade_id !== tradeId) {
      throw new Error("That interest does not belong to this listing.");
    }

    const supabase = getServiceClientOrThrow();
    const now = new Date().toISOString();

    const { error: tradeError } = await supabase
      .from("trades")
      .update({
        buyer_user_id: interest.buyer_user_id,
        selected_interest_id: interest.id,
        status: "PendingFunding",
        updated_at: now,
      })
      .eq("id", tradeId);

    if (tradeError) {
      throw new Error(tradeError.message);
    }

    await supabase
      .from("trade_interests")
      .update({ status: "Selected", updated_at: now })
      .eq("id", interest.id);

    await supabase
      .from("trade_interests")
      .update({ status: "Declined", updated_at: now })
      .eq("trade_id", tradeId)
      .neq("id", interest.id)
      .eq("status", "Open");

    await insertTradeEvent(
      tradeId,
      user.id,
      "Buyer selected",
      sellerSelectedBuyerEvent(interest.buyer_pi_username),
      { interestId: interest.id },
    );

    await createNotification({
      userId: interest.buyer_user_id,
      tradeId,
      type: "buyer_selected",
      title: "Seller selected you",
      body: `@${user.username} selected your response. You can now fund the trade.`,
    });

    return secureJson(await listTradesForUser(user));
  } catch (error) {
    return jsonError(error);
  }
}
