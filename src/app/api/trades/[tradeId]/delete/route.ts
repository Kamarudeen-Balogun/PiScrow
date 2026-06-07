import { jsonError, requireAppUser } from "@/server/auth";
import { rateLimit, rateLimitProfiles, secureJson } from "@/server/security";
import {
  assertTradeListingOwner,
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
    await rateLimit(request, { key: "delete-offer:post", ...rateLimitProfiles.write });
    const user = await requireAppUser(request);
    const { tradeId } = await context.params;
    const trade = await getTradeForAction(tradeId);

    assertTradeListingOwner(trade, user);
    assertTradeStatus(trade, ["Draft"]);

    const supabase = getServiceClientOrThrow();
    const now = new Date().toISOString();
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
  } catch (error) {
    return jsonError(error);
  }
}
