import { createTradeInterestSchema } from "@/lib/validation";
import { jsonError, requireAppUser } from "@/server/auth";
import { createNotification } from "@/server/notifications";
import {
  rateLimit,
  rateLimitProfiles,
  readJsonObject,
  secureJson,
} from "@/server/security";
import {
  assertUserPayoutReady,
  assertBuyerIsEligibleForListing,
  assertTradeIsOpenForInterest,
  getServiceClientOrThrow,
  getTradeForAction,
  interestSubmittedEvent,
  insertTradeEvent,
  listTradesForUser,
} from "@/server/trades";

export async function POST(
  request: Request,
  context: { params: Promise<{ tradeId: string }> },
) {
  try {
    await rateLimit(request, { key: "trade-interest:post", ...rateLimitProfiles.write });
    const user = await requireAppUser(request);
    const { tradeId } = await context.params;
    const parsed = createTradeInterestSchema.safeParse({
      ...(await readJsonObject(request)),
      tradeId,
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid interest form.");
    }

    const trade = await getTradeForAction(tradeId);
    assertTradeIsOpenForInterest(trade);
    assertBuyerIsEligibleForListing(trade, user);
    await assertUserPayoutReady(user.id, "buy");

    const supabase = getServiceClientOrThrow();
    const { data: existingInterest } = await supabase
      .from("trade_interests")
      .select("id")
      .eq("trade_id", tradeId)
      .eq("buyer_user_id", user.id)
      .maybeSingle();

    if (existingInterest) {
      throw new Error("You already submitted interest for this listing.");
    }

    const responseNote = parsed.data.responseNote ?? "";
    const { error } = await supabase.from("trade_interests").insert({
      trade_id: tradeId,
      buyer_user_id: user.id,
      buyer_pi_username: user.username,
      response_note: responseNote,
      status: "Open",
    });

    if (error) {
      throw new Error(error.message);
    }

    await insertTradeEvent(
      tradeId,
      user.id,
      "Interest submitted",
      interestSubmittedEvent(user.username),
      responseNote ? { responseNote } : {},
    );

    await createNotification({
      userId: trade.seller_user_id,
      tradeId,
      type: "interest_submitted",
      title: "New buyer interest",
      body: `@${user.username} responded to your seller offer.`,
    });

    return secureJson(await listTradesForUser(user));
  } catch (error) {
    return jsonError(error);
  }
}
