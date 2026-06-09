import { normalizePiUsername, type AppUser } from "@/server/auth";
import { signProofUrl } from "@/server/proof-storage";
import { getServiceClientOrThrow, type TradeRow } from "@/server/trades";
import type { TradeChatMessage, TradeChatRoom } from "@/types/trade";

type TradeChatRoomRow = {
  id: string;
  trade_id: string;
  status: "active" | "disputed" | "closed";
  claimed_admin_user_id: string | null;
  claimed_admin_pi_username: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

type TradeChatMessageRow = {
  id: string;
  room_id: string;
  trade_id: string;
  sender_user_id: string | null;
  sender_pi_username: string;
  sender_role: "buyer" | "seller" | "admin" | "system";
  message_type: "text" | "proof" | "system";
  body: string;
  attachment_url: string | null;
  created_at: string;
};

function mapChatRoom(row: TradeChatRoomRow): TradeChatRoom {
  return {
    id: row.id,
    tradeId: row.trade_id,
    status: row.status,
    claimedAdminUserId: row.claimed_admin_user_id ?? undefined,
    claimedAdminPiUsername: row.claimed_admin_pi_username ?? undefined,
    claimedAt: row.claimed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function mapChatMessage(row: TradeChatMessageRow): Promise<TradeChatMessage> {
  return {
    id: row.id,
    roomId: row.room_id,
    tradeId: row.trade_id,
    senderUserId: row.sender_user_id ?? undefined,
    senderPiUsername: row.sender_pi_username,
    senderRole: row.sender_role,
    messageType: row.message_type,
    body: row.body,
    attachmentUrl: await signProofUrl(row.attachment_url ?? undefined),
    createdAt: row.created_at,
  };
}

export function userIsTradeSeller(trade: TradeRow, user: AppUser) {
  return (
    trade.seller_user_id === user.id ||
    normalizePiUsername(trade.seller_pi_username) === normalizePiUsername(user.username)
  );
}

export function userIsTradeBuyer(trade: TradeRow, user: AppUser) {
  return trade.buyer_user_id === user.id;
}

function assertCanViewTradeChat(trade: TradeRow, user: AppUser) {
  if (userIsTradeSeller(trade, user) || userIsTradeBuyer(trade, user)) {
    return;
  }

  if (user.isAdmin && trade.status === "Disputed") {
    return;
  }

  throw new Error("You do not have access to this trade chat.");
}

export function tradeChatSenderRole(
  trade: TradeRow,
  user: AppUser,
): "buyer" | "seller" | "admin" {
  if (userIsTradeBuyer(trade, user)) {
    return "buyer";
  }

  if (userIsTradeSeller(trade, user)) {
    return "seller";
  }

  if (user.isAdmin && trade.status === "Disputed") {
    return "admin";
  }

  throw new Error("You cannot send messages in this trade chat.");
}

function assertCanSendTradeChat(
  trade: TradeRow,
  room: TradeChatRoomRow,
  user: AppUser,
) {
  if (["Completed", "Cancelled"].includes(trade.status)) {
    throw new Error("This trade chat is read-only because the trade is closed.");
  }

  const role = tradeChatSenderRole(trade, user);

  if (role !== "admin") {
    if (
      !["Funded", "DeliverySubmitted", "AwaitingRelease", "Disputed"].includes(
        trade.status,
      )
    ) {
      throw new Error("Trade chat opens after buyer funding is verified.");
    }

    return role;
  }

  if (room.status !== "disputed" || trade.status !== "Disputed") {
    throw new Error("Admins can only message disputed trade chats.");
  }

  if (room.claimed_admin_user_id !== user.id) {
    throw new Error("Join this dispute room before sending admin messages.");
  }

  return role;
}

async function insertSystemMessage(
  room: TradeChatRoomRow,
  body: string,
  metadata: { tradeId?: string } = {},
) {
  const supabase = getServiceClientOrThrow();
  const { error } = await supabase.from("trade_chat_messages").insert({
    room_id: room.id,
    trade_id: metadata.tradeId ?? room.trade_id,
    sender_user_id: null,
    sender_pi_username: "system",
    sender_role: "system",
    message_type: "system",
    body,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function ensureTradeChatRoom(
  trade: TradeRow,
  nextStatus: "active" | "disputed" = trade.status === "Disputed" ? "disputed" : "active",
) {
  const supabase = getServiceClientOrThrow();
  const { data: existing, error: lookupError } = await supabase
    .from("trade_chat_rooms")
    .select("*")
    .eq("trade_id", trade.id)
    .maybeSingle();

  if (lookupError) {
    throw new Error(lookupError.message);
  }

  if (existing) {
    const row = existing as TradeChatRoomRow;

    if (nextStatus !== row.status && row.status !== "closed") {
      const { data: updated, error: updateError } = await supabase
        .from("trade_chat_rooms")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .select("*")
        .single();

      if (updateError || !updated) {
        throw new Error(updateError?.message ?? "Could not update trade chat room.");
      }

      return updated as TradeChatRoomRow;
    }

    return row;
  }

  const { data, error } = await supabase
    .from("trade_chat_rooms")
    .insert({
      trade_id: trade.id,
      status: nextStatus,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not create trade chat room.");
  }

  const room = data as TradeChatRoomRow;
  await insertSystemMessage(
    room,
    "Secure trade room opened. Use this chat for delivery updates, proof, and dispute evidence.",
  );

  return room;
}

export async function markTradeChatRoomDisputed(
  trade: TradeRow,
  actor: AppUser,
  reason: string,
) {
  const room = await ensureTradeChatRoom(trade, "disputed");
  await insertSystemMessage(
    room,
    `Dispute opened by @${normalizePiUsername(actor.username)}: ${reason}`,
  );
  return room;
}

export async function closeTradeChatRoom(trade: TradeRow, notes: string) {
  const supabase = getServiceClientOrThrow();
  const room = await ensureTradeChatRoom(trade, "active");
  const { data, error } = await supabase
    .from("trade_chat_rooms")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("id", room.id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not close trade chat room.");
  }

  await insertSystemMessage(data as TradeChatRoomRow, notes);
  return data as TradeChatRoomRow;
}

export async function claimTradeChatRoom(trade: TradeRow, user: AppUser) {
  if (!user.isAdmin) {
    throw new Error("Only admins can join dispute rooms.");
  }

  if (trade.status !== "Disputed") {
    throw new Error("Admins can only join disputed trade rooms.");
  }

  const room = await ensureTradeChatRoom(trade, "disputed");

  if (room.claimed_admin_user_id === user.id) {
    return room;
  }

  if (room.claimed_admin_user_id) {
    throw new Error("This dispute room is already claimed by another admin.");
  }

  const supabase = getServiceClientOrThrow();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("trade_chat_rooms")
    .update({
      claimed_admin_user_id: user.id,
      claimed_admin_pi_username: normalizePiUsername(user.username),
      claimed_at: now,
      status: "disputed",
      updated_at: now,
    })
    .eq("id", room.id)
    .is("claimed_admin_user_id", null)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("This dispute room is already claimed by another admin.");
  }

  const claimedRoom = data as TradeChatRoomRow;
  await insertSystemMessage(
    claimedRoom,
    `Admin @${normalizePiUsername(user.username)} joined this dispute room.`,
  );

  return claimedRoom;
}

export async function listTradeChatMessages(roomId: string) {
  const supabase = getServiceClientOrThrow();
  const { data, error } = await supabase
    .from("trade_chat_messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(80);

  if (error) {
    throw new Error(error.message);
  }

  return Promise.all(((data ?? []) as TradeChatMessageRow[]).map(mapChatMessage));
}

export async function loadTradeChatForUser(trade: TradeRow, user: AppUser) {
  assertCanViewTradeChat(trade, user);

  if (
    ![
      "Funded",
      "DeliverySubmitted",
      "AwaitingRelease",
      "Disputed",
      "Completed",
      "Cancelled",
    ].includes(trade.status)
  ) {
    throw new Error("Trade chat opens after buyer funding is verified.");
  }

  const room = await getTradeChatRoomForUser(trade, user);
  const messages = await listTradeChatMessages(room.id);

  return {
    room: mapChatRoom(room),
    messages,
  };
}

export async function getTradeChatRoomForUser(trade: TradeRow, user: AppUser) {
  assertCanViewTradeChat(trade, user);

  if (
    ![
      "Funded",
      "DeliverySubmitted",
      "AwaitingRelease",
      "Disputed",
      "Completed",
      "Cancelled",
    ].includes(trade.status)
  ) {
    throw new Error("Trade chat opens after buyer funding is verified.");
  }

  return ensureTradeChatRoom(
    trade,
    trade.status === "Disputed" ? "disputed" : "active",
  );
}

export async function insertTradeChatMessage({
  attachmentUrl,
  body,
  messageType,
  room,
  trade,
  user,
}: {
  attachmentUrl?: string;
  body: string;
  messageType: "text" | "proof";
  room: TradeChatRoomRow;
  trade: TradeRow;
  user: AppUser;
}) {
  const role = assertCanSendTradeChat(trade, room, user);
  const trimmedBody = body.trim();

  if (!trimmedBody && !attachmentUrl) {
    throw new Error("Add a message or proof image before sending.");
  }

  const supabase = getServiceClientOrThrow();
  const { error } = await supabase.from("trade_chat_messages").insert({
    room_id: room.id,
    trade_id: trade.id,
    sender_user_id: user.id,
    sender_pi_username: normalizePiUsername(user.username),
    sender_role: role,
    message_type: attachmentUrl ? "proof" : messageType,
    body: trimmedBody,
    attachment_url: attachmentUrl ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function addTradeChatSystemMessage(trade: TradeRow, body: string) {
  const room = await ensureTradeChatRoom(
    trade,
    trade.status === "Disputed" ? "disputed" : "active",
  );
  await insertSystemMessage(room, body);
}
