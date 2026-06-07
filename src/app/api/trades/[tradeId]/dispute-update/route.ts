import { disputeFollowUpSchema } from "@/lib/validation";
import { getAdminUsernames, jsonError, requireAppUser } from "@/server/auth";
import { createNotification } from "@/server/notifications";
import {
  rateLimit,
  rateLimitProfiles,
  readJsonObject,
  secureJson,
} from "@/server/security";
import {
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
    rateLimit(request, { key: "dispute-update:post", ...rateLimitProfiles.write });
    const user = await requireAppUser(request);
    const { tradeId } = await context.params;
    const parsed = disputeFollowUpSchema.safeParse({
      ...(await readJsonObject(request)),
      tradeId,
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid dispute update.");
    }

    const trade = await getTradeForAction(tradeId);
    assertTradeStatus(trade, ["Disputed"]);

    const isBuyer = trade.buyer_user_id === user.id;
    const isSeller = trade.seller_user_id === user.id;

    if (!isBuyer && !isSeller) {
      throw new Error("Only the buyer or seller can add a dispute update.");
    }

    const actorRole = isBuyer ? "Buyer" : "Seller";

    await insertTradeEvent(
      tradeId,
      user.id,
      `${actorRole} dispute update`,
      parsed.data.followUpNote,
      { actorRole: actorRole.toLowerCase() },
    );

    const adminUsernames = getAdminUsernames();

    if (adminUsernames.length > 0) {
      const supabase = getServiceClientOrThrow();
      const { data: admins, error } = await supabase
        .from("users")
        .select("id, pi_username")
        .in("pi_username", adminUsernames);

      if (error) {
        throw new Error(error.message);
      }

      await Promise.all(
        (admins ?? []).map((admin) =>
          createNotification({
            userId: admin.id as string,
            tradeId,
            type: "dispute_party_update",
            title: `${actorRole} added dispute update`,
            body: `@${user.username}: ${parsed.data.followUpNote}`,
          }),
        ),
      );
    }

    await createNotification({
      userId: isBuyer ? trade.seller_user_id : trade.buyer_user_id,
      tradeId,
      type: "dispute_party_update",
      title: `${actorRole} added dispute update`,
      body: parsed.data.followUpNote,
    });

    return secureJson(await listTradesForUser(user));
  } catch (error) {
    return jsonError(error);
  }
}
