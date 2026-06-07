import { z } from "zod";

import { jsonError, requireAppUser } from "@/server/auth";
import { createNotification } from "@/server/notifications";
import {
  rateLimit,
  rateLimitProfiles,
  readJsonBody,
  secureJson,
} from "@/server/security";
import {
  assertTradeStatus,
  getServiceClientOrThrow,
  getTradeForAction,
  insertTradeEvent,
  listTradesForUser,
} from "@/server/trades";

const adminActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("resolve"),
    status: z.enum(["Completed", "Cancelled"]),
    notes: z.string().trim().max(600).optional(),
  }),
  z.object({
    action: z.enum(["request_buyer_followup", "request_seller_followup"]),
    notes: z.string().trim().min(8).max(600),
  }),
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ tradeId: string }> },
) {
  try {
    rateLimit(request, { key: "admin-resolve:post", ...rateLimitProfiles.admin });
    const user = await requireAppUser(request);

    if (!user.isAdmin) {
      throw new Error("Only admins can resolve disputes.");
    }

    const { tradeId } = await context.params;
    const parsed = adminActionSchema.safeParse(await readJsonBody(request));

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid admin action.");
    }

    const trade = await getTradeForAction(tradeId);
    assertTradeStatus(trade, ["Disputed"]);

    const supabase = getServiceClientOrThrow();
    const now = new Date().toISOString();

    if (parsed.data.action !== "resolve") {
      const targetIsBuyer = parsed.data.action === "request_buyer_followup";
      const targetUserId = targetIsBuyer ? trade.buyer_user_id : trade.seller_user_id;
      const targetRole = targetIsBuyer ? "buyer" : "seller";
      const eventType = targetIsBuyer
        ? "Admin requested buyer follow-up"
        : "Admin requested seller follow-up";

      await supabase.from("admin_actions").insert({
        trade_id: tradeId,
        admin_pi_username: user.username,
        action_type: parsed.data.action,
        notes: parsed.data.notes,
        metadata: { targetRole },
      });

      await insertTradeEvent(tradeId, user.id, eventType, parsed.data.notes, {
        targetRole,
      });

      await createNotification({
        userId: targetUserId,
        tradeId,
        type: parsed.data.action,
        title: "Admin needs your update",
        body: parsed.data.notes,
      });

      return secureJson(await listTradesForUser(user));
    }

    const resolutionNotes =
      parsed.data.notes ??
      (parsed.data.status === "Completed"
        ? "Admin approved the seller release path after reviewing buyer receipt and party evidence."
        : "Admin approved the buyer refund path after reviewing the dispute and party evidence.");
    const { error: tradeError } = await supabase
      .from("trades")
      .update({
        status: parsed.data.status,
        completed_at: parsed.data.status === "Completed" ? now : null,
        updated_at: now,
      })
      .eq("id", tradeId);

    if (tradeError) {
      throw new Error(tradeError.message);
    }

    await supabase
      .from("disputes")
      .update({
        status: "Resolved",
        resolution: resolutionNotes,
        resolved_at: now,
      })
      .eq("trade_id", tradeId)
      .eq("status", "Open");

    await supabase.from("admin_actions").insert({
      trade_id: tradeId,
      admin_pi_username: user.username,
      action_type: `resolve_${parsed.data.status.toLowerCase()}`,
      notes: resolutionNotes,
      metadata: {
        releasePath:
          parsed.data.status === "Completed" ? "seller_release" : "buyer_refund",
      },
    });

    await insertTradeEvent(
      tradeId,
      user.id,
      parsed.data.status === "Completed"
        ? "Admin approved seller release"
        : "Admin approved buyer refund",
      resolutionNotes,
      {
        releasePath:
          parsed.data.status === "Completed" ? "seller_release" : "buyer_refund",
      },
    );

    await Promise.all([
      createNotification({
        userId: trade.seller_user_id,
        tradeId,
        type: "admin_resolved",
        title: "Admin resolved dispute",
        body:
          parsed.data.status === "Completed"
            ? "Admin approved the seller release path after review."
            : "Admin approved the buyer refund path after cancellation review.",
      }),
      createNotification({
        userId: trade.buyer_user_id,
        tradeId,
        type: "admin_resolved",
        title: "Admin resolved dispute",
        body:
          parsed.data.status === "Completed"
            ? "Admin approved the seller release path after review."
            : "Admin approved the buyer refund path after cancellation review.",
      }),
    ]);

    return secureJson(await listTradesForUser(user));
  } catch (error) {
    return jsonError(error);
  }
}
