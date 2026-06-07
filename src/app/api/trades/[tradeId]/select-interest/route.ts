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
    await rateLimit(request, { key: "select-interest:post", ...rateLimitProfiles.write });
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

    const interest = await getTradeInterestForAction(parsed.data.interestId);

    if (interest.trade_id !== tradeId) {
      throw new Error("That interest does not belong to this listing.");
    }

    if (interest.buyer_user_id === user.id) {
      throw new Error("You cannot select yourself as buyer for your own listing.");
    }

    if (interest.status === "Withdrawn") {
      throw new Error("This buyer response has been withdrawn.");
    }

    const supabase = getServiceClientOrThrow();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();

    if (trade.status === "Funded" || trade.status === "DeliverySubmitted") {
      throw new Error("This trade is already funded and cannot be reassigned.");
    }

    if (trade.status === "Completed" || trade.status === "Cancelled") {
      throw new Error("This trade is already closed.");
    }

    if (trade.status === "Disputed") {
      throw new Error("This trade is disputed and cannot be reassigned.");
    }

    if (trade.status === "PendingFunding") {
      const { data: startedPayment, error: paymentError } = await supabase
        .from("payments")
        .select("id")
        .eq("trade_id", tradeId)
        .in("status", ["Approved", "Completed"])
        .maybeSingle();

      if (paymentError) {
        throw new Error(paymentError.message);
      }

      if (startedPayment) {
        throw new Error("Buyer funding has already started, so this trade cannot be reassigned.");
      }
    } else if (trade.status !== "Draft") {
      throw new Error("This listing is not open for buyer selection.");
    }

    const { error: tradeError } = await supabase
      .from("trades")
      .update({
        buyer_user_id: interest.buyer_user_id,
        selected_interest_id: interest.id,
        selected_at: now,
        selection_expires_at: expiresAt,
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
      .in("status", ["Open", "Selected"]);

    await insertTradeEvent(
      tradeId,
      user.id,
      "Buyer selected",
      sellerSelectedBuyerEvent(interest.buyer_pi_username),
      { interestId: interest.id, selectionExpiresAt: expiresAt },
    );

    await createNotification({
      userId: interest.buyer_user_id,
      tradeId,
      type: "buyer_selected",
      title: "Seller selected you",
      body: `@${user.username} selected your response. Start funding within 20 minutes to keep this offer.`,
    });

    return secureJson(await listTradesForUser(user));
  } catch (error) {
    return jsonError(error);
  }
}
