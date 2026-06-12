import { jsonError, normalizePiUsername, requireAppUser } from "@/server/auth";
import { rateLimit, rateLimitProfiles, secureJson } from "@/server/security";
import {
  assertTradeListingOwner,
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
    await rateLimit(request, { key: "delete-offer:post", ...rateLimitProfiles.write });
    const user = await requireAppUser(request);
    const { tradeId } = await context.params;
    const trade = await getTradeForAction(tradeId);
    const supabase = getServiceClientOrThrow();
    const now = new Date().toISOString();
    const sellerMatchesUser =
      trade.seller_user_id === user.id ||
      normalizePiUsername(trade.seller_pi_username) === normalizePiUsername(user.username);
    const buyerMatchesUser = trade.buyer_user_id === user.id;

    if (trade.status === "Draft") {
      assertTradeListingOwner(trade, user);

      const { error } = await supabase
        .from("trades")
        .update({
          status: "Cancelled",
          cancelled_at: now,
          updated_at: now,
        })
        .eq("id", tradeId);

      if (error) {
        throw new Error(error.message);
      }

      await insertTradeEvent(
        tradeId,
        user.id,
        "Offer deleted",
        "Seller removed the open offer before selecting a buyer.",
      );

      return secureJson(await listTradesForUser(user));
    }

    if (!["Completed", "Cancelled"].includes(trade.status)) {
      throw new Error("Only closed trades can be deleted from your workspace.");
    }

    if (!sellerMatchesUser && !buyerMatchesUser) {
      throw new Error("Only the buyer or seller can delete this trade.");
    }

    const deleteColumn = sellerMatchesUser ? "seller_deleted_at" : "buyer_deleted_at";
    const { error } = await supabase
      .from("trades")
      .update({
        [deleteColumn]: now,
        updated_at: now,
      })
      .eq("id", tradeId);

    if (error) {
      throw new Error(error.message);
    }

    return secureJson(await listTradesForUser(user));
  } catch (error) {
    return jsonError(error);
  }
}
