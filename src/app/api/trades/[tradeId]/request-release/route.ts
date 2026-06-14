import { requestReleaseSchema } from "@/lib/validation";
import { getAdminUsernames, jsonError, requireAppUser } from "@/server/auth";
import { createNotification } from "@/server/notifications";
import { addTradeChatSystemMessage } from "@/server/trade-chat";
import {
  rateLimit,
  rateLimitProfiles,
  readJsonObject,
  secureJson,
} from "@/server/security";
import {
  assertSeller,
  assertTradeStatus,
  getServiceClientOrThrow,
  getTradeForAction,
  insertTradeEvent,
  listTradesForUser,
} from "@/server/trades";
import { invalidateTradeHandoffCode } from "@/server/trade-handoff";

export async function POST(
  request: Request,
  context: { params: Promise<{ tradeId: string }> },
) {
  try {
    await rateLimit(request, {
      key: "request-release:post",
      ...rateLimitProfiles.write,
    });
    const user = await requireAppUser(request);
    const { tradeId } = await context.params;
    const parsed = requestReleaseSchema.safeParse({
      ...(await readJsonObject(request)),
      tradeId,
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid release request.");
    }

    const trade = await getTradeForAction(tradeId);
    assertSeller(trade, user);
    assertTradeStatus(trade, ["DeliverySubmitted"]);

    const supabase = getServiceClientOrThrow();
    const now = new Date().toISOString();

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, status, escrow_status, release_status, release_type")
      .eq("trade_id", tradeId)
      .eq("status", "Completed")
      .maybeSingle();

    if (paymentError) {
      throw new Error(paymentError.message);
    }

    if (!payment) {
      throw new Error("Buyer funding is not complete yet for this trade.");
    }

    const { error: tradeError } = await supabase
      .from("trades")
      .update({
        status: "AwaitingRelease",
        updated_at: now,
      })
      .eq("id", tradeId);

    if (tradeError) {
      throw new Error(tradeError.message);
    }

    const { error: releaseError } = await supabase
      .from("payments")
      .update({
        escrow_status: "held_in_app",
        release_type: "seller_release",
        release_status: "NotStarted",
        release_pi_payment_id: null,
        release_txid: null,
        release_transaction_link: null,
        release_completed_at: null,
        release_requested_at: now,
        release_failure: null,
        updated_at: now,
      })
      .eq("id", payment.id);

    if (releaseError) {
      throw new Error(releaseError.message);
    }

    await invalidateTradeHandoffCode(
      tradeId,
      "seller moved trade into admin release review",
      user.id,
    ).catch(() => undefined);

    await insertTradeEvent(
      tradeId,
      user.id,
      "Seller requested release",
      `${parsed.data.sellerReleaseNote} Admin review is now required before seller payout.`,
      {
        requestedBy: "seller",
      },
    );
    await addTradeChatSystemMessage(
      { ...trade, status: "AwaitingRelease" },
      `Seller @${user.username} requested payout release: ${parsed.data.sellerReleaseNote}. Admin can now review the trade and release the held Test Pi.`,
    );

    const adminUsernames = getAdminUsernames();
    let adminIds: string[] = [];

    if (adminUsernames.length > 0) {
      const { data: admins, error } = await supabase
        .from("users")
        .select("id")
        .in("pi_username", adminUsernames);

      if (error) {
        throw new Error(error.message);
      }

      adminIds = (admins ?? [])
        .map((admin) => admin.id as string)
        .filter(Boolean);
    }

    await Promise.all([
      createNotification({
        userId: trade.buyer_user_id,
        tradeId,
        type: "seller_requested_release",
        title: "Seller requested payout release",
        body: `@${user.username} requested admin release after submitting delivery proof.`,
      }),
      ...adminIds.map((adminId) =>
        createNotification({
          userId: adminId,
          tradeId,
          type: "seller_requested_release",
          title: "Trade is ready for release review",
          body: `Seller @${user.username} requested payout release for admin review.`,
        }),
      ),
    ]);

    return secureJson(await listTradesForUser(user));
  } catch (error) {
    return jsonError(error);
  }
}
