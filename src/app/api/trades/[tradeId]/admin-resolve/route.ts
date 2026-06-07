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

const adminResolveSchema = z.object({
  status: z.enum(["Completed", "Cancelled"]),
  notes: z.string().trim().max(600).optional(),
});

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
    const parsed = adminResolveSchema.safeParse(await readJsonBody(request));

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid admin action.");
    }

    const trade = await getTradeForAction(tradeId);
    assertTradeStatus(trade, ["Disputed"]);

    const supabase = getServiceClientOrThrow();
    const now = new Date().toISOString();
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
        resolution: parsed.data.notes ?? `Admin resolved as ${parsed.data.status}.`,
        resolved_at: now,
      })
      .eq("trade_id", tradeId)
      .eq("status", "Open");

    await supabase.from("admin_actions").insert({
      trade_id: tradeId,
      admin_pi_username: user.username,
      action_type: `resolve_${parsed.data.status.toLowerCase()}`,
      notes: parsed.data.notes ?? "Admin recorded a simulated testnet resolution.",
    });

    await insertTradeEvent(
      tradeId,
      user.id,
      `Admin resolved as ${parsed.data.status.toLowerCase()}`,
      parsed.data.notes ?? "Admin recorded a simulated testnet resolution.",
    );

    await Promise.all([
      createNotification({
        userId: trade.seller_user_id,
        tradeId,
        type: "admin_resolved",
        title: "Admin resolved dispute",
        body:
          parsed.data.status === "Completed"
            ? "Admin marked the trade complete after review."
            : "Admin cancelled the trade after review.",
      }),
      createNotification({
        userId: trade.buyer_user_id,
        tradeId,
        type: "admin_resolved",
        title: "Admin resolved dispute",
        body:
          parsed.data.status === "Completed"
            ? "Admin marked the trade complete after review."
            : "Admin cancelled the trade after review.",
      }),
    ]);

    return secureJson(await listTradesForUser(user));
  } catch (error) {
    return jsonError(error);
  }
}
