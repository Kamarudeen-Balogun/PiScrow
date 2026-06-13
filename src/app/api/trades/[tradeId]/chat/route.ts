import { tradeChatMessageSchema } from "@/lib/validation";
import { jsonError, requireAppUser } from "@/server/auth";
import { createNotification } from "@/server/notifications";
import { uploadTradeProofImage } from "@/server/proof-storage";
import {
  rateLimit,
  rateLimitProfiles,
  readFormDataBody,
  readJsonObject,
  sanitizeFormFields,
  secureJson,
} from "@/server/security";
import {
  getTradeChatRoomForUser,
  getTradeChatEvidence,
  insertTradeChatMessage,
  listTradeChatMessages,
  loadTradeChatForUser,
  tradeChatSenderRole,
} from "@/server/trade-chat";
import {
  getServiceClientOrThrow,
  getTradeForAction,
  insertTradeEvent,
  listTradesForUser,
} from "@/server/trades";

export async function GET(
  request: Request,
  context: { params: Promise<{ tradeId: string }> },
) {
  try {
    await rateLimit(request, { key: "trade-chat:get", ...rateLimitProfiles.read });
    const user = await requireAppUser(request);
    const { tradeId } = await context.params;
    const trade = await getTradeForAction(tradeId);

    return secureJson(await loadTradeChatForUser(trade, user));
  } catch (error) {
    return jsonError(error, 401);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ tradeId: string }> },
) {
  try {
    await rateLimit(request, { key: "trade-chat:post", ...rateLimitProfiles.upload });
    const user = await requireAppUser(request);
    const { tradeId } = await context.params;
    const contentType = request.headers.get("content-type") ?? "";
    const body =
      contentType.includes("multipart/form-data")
        ? await readFormDataBody(request)
        : await readJsonObject(request);
    const parsed = tradeChatMessageSchema.safeParse({
      ...(body instanceof FormData ? sanitizeFormFields(body) : body),
      tradeId,
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid chat message.");
    }

    const trade = await getTradeForAction(tradeId);
    const room = await getTradeChatRoomForUser(trade, user);
    const senderRole = tradeChatSenderRole(trade, user);

    if (["Completed", "Cancelled"].includes(trade.status)) {
      throw new Error("This trade chat is read-only because the trade is closed.");
    }

    if (senderRole === "admin" && room.claimed_admin_user_id !== user.id) {
      throw new Error("Join this review room before sending admin messages.");
    }

    const attachmentUrl =
      body instanceof FormData
        ? await uploadTradeProofImage({
            tradeId,
            userId: user.id,
            purpose: "chat-proof",
            file: body.get("attachment") as File | null,
          })
        : "";

    await insertTradeChatMessage({
      attachmentUrl: attachmentUrl || undefined,
      body: parsed.data.body ?? "",
      messageType: "text",
      room,
      trade,
      user,
    });

    if (attachmentUrl && ["seller", "buyer"].includes(senderRole)) {
      const evidence = await getTradeChatEvidence(tradeId);
      const supabase = getServiceClientOrThrow();
      const now = new Date().toISOString();

      if (senderRole === "seller" && trade.status === "Funded" && evidence.hasSellerProof) {
        const { error: updateError } = await supabase
          .from("trades")
          .update({
            status: "DeliverySubmitted",
            delivery_proof_note:
              trade.delivery_proof_note ?? evidence.sellerProofText ?? "Seller proof uploaded in trade chat.",
            delivery_proof_url: trade.delivery_proof_url ?? evidence.sellerProofUrl ?? null,
            updated_at: now,
          })
          .eq("id", tradeId);

        if (updateError) {
          throw new Error(updateError.message);
        }
        await insertTradeEvent(
          tradeId,
          user.id,
          "Delivery submitted",
          evidence.sellerProofText ?? "Seller proof uploaded in trade chat.",
          { source: "trade_chat" },
        );
      }

      if (senderRole === "buyer" && trade.status === "DeliverySubmitted" && evidence.hasBuyerProof) {
        const { error: updateError } = await supabase
          .from("trades")
          .update({
            status: "AwaitingRelease",
            buyer_receipt_note:
              trade.buyer_receipt_note ?? evidence.buyerProofText ?? "Buyer receipt proof uploaded in trade chat.",
            buyer_receipt_proof_url:
              trade.buyer_receipt_proof_url ?? evidence.buyerProofUrl ?? null,
            updated_at: now,
          })
          .eq("id", tradeId);

        if (updateError) {
          throw new Error(updateError.message);
        }
        await insertTradeEvent(
          tradeId,
          user.id,
          "Receipt confirmed",
          `${
            evidence.buyerProofText ?? "Buyer receipt proof uploaded in trade chat."
          } Seller payout is waiting for admin release.`,
          { source: "trade_chat" },
        );
      }
    }

    const title =
      senderRole === "admin"
        ? trade.status === "AwaitingRelease"
          ? "Admin added review update"
          : "Admin added dispute update"
        : "New trade chat message";
    const preview =
      (parsed.data.body ?? "").trim() ||
      (attachmentUrl ? "Proof image uploaded in the trade chat." : "New chat message.");

    await Promise.all([
      senderRole !== "seller"
        ? createNotification({
            userId: trade.seller_user_id,
            tradeId,
            type: "trade_chat_message",
            title,
            body: preview,
          })
        : Promise.resolve(),
      senderRole !== "buyer"
        ? createNotification({
            userId: trade.buyer_user_id,
            tradeId,
            type: "trade_chat_message",
            title,
            body: preview,
          })
        : Promise.resolve(),
    ]);

    const tradePayload = await listTradesForUser(user);

    return secureJson({
      ...tradePayload,
      room: {
        id: room.id,
        tradeId: room.trade_id,
        status: room.status,
        claimedAdminUserId: room.claimed_admin_user_id ?? undefined,
        claimedAdminPiUsername: room.claimed_admin_pi_username ?? undefined,
        claimedAt: room.claimed_at ?? undefined,
        createdAt: room.created_at,
        updatedAt: room.updated_at,
      },
      messages: await listTradeChatMessages(room.id),
    });
  } catch (error) {
    return jsonError(error);
  }
}
