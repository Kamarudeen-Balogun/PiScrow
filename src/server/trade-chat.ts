import { normalizePiUsername, type AppUser } from "@/server/auth";
import { signProofUrl } from "@/server/proof-storage";
import {
  getServiceClientOrThrow,
  getUserReputations,
  type TradeRow,
} from "@/server/trades";
import type { UserReputation } from "@/types/profile";
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

const TRADE_CHAT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type TradeChatEvidence = {
  hasSellerProof: boolean;
  hasBuyerProof: boolean;
  sellerProofText?: string;
  buyerProofText?: string;
  sellerProofUrl?: string;
  buyerProofUrl?: string;
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

async function mapChatMessage(
  row: TradeChatMessageRow,
  reputations = new Map<string, UserReputation>(),
): Promise<TradeChatMessage> {
  return {
    id: row.id,
    roomId: row.room_id,
    tradeId: row.trade_id,
    senderUserId: row.sender_user_id ?? undefined,
    senderPiUsername: row.sender_pi_username,
    senderProfile: row.sender_user_id
      ? reputations.get(row.sender_user_id)
      : undefined,
    senderRole: row.sender_role,
    messageType: row.message_type,
    body: row.body,
    attachmentUrl: await signProofUrl(row.attachment_url ?? undefined),
    createdAt: row.created_at,
  };
}

function tradeChatRoomStatus(
  trade: TradeRow,
): "active" | "closed" | "disputed" {
  if (trade.status === "Disputed") {
    return "disputed";
  }

  if (["Completed", "Cancelled"].includes(trade.status)) {
    return "closed";
  }

  return "active";
}

function tradeChatClosedAt(trade: TradeRow) {
  if (trade.status === "Completed") {
    return trade.completed_at;
  }

  if (trade.status === "Cancelled") {
    return trade.cancelled_at;
  }

  return null;
}

async function purgeExpiredTradeChat(trade: TradeRow) {
  const closedAt = tradeChatClosedAt(trade);

  if (!closedAt) {
    return false;
  }

  if (Date.now() - new Date(closedAt).getTime() < TRADE_CHAT_RETENTION_MS) {
    return false;
  }

  const supabase = getServiceClientOrThrow();
  const { error } = await supabase
    .from("trade_chat_rooms")
    .delete()
    .eq("trade_id", trade.id);

  if (error) {
    throw new Error(error.message);
  }

  return true;
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

  if (user.isAdmin && ["Disputed", "AwaitingRelease"].includes(trade.status)) {
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

  if (user.isAdmin && ["Disputed", "AwaitingRelease"].includes(trade.status)) {
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

  if (!["disputed", "active"].includes(room.status)) {
    throw new Error("This trade chat is not available for admin messaging.");
  }

  if (!["Disputed", "AwaitingRelease"].includes(trade.status)) {
    throw new Error("Admins can only message disputed or release-review trade chats.");
  }

  if (room.claimed_admin_user_id !== user.id) {
    throw new Error("Join this review room before sending admin messages.");
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
  nextStatus: "active" | "closed" | "disputed" = tradeChatRoomStatus(trade),
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

    if (nextStatus !== row.status) {
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
  const room = await ensureTradeChatRoom(trade, "closed");
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
    throw new Error("Only admins can join review rooms.");
  }

  if (!["Disputed", "AwaitingRelease"].includes(trade.status)) {
    throw new Error("Admins can only join disputed or release-review trade rooms.");
  }

  const room = await ensureTradeChatRoom(
    trade,
    trade.status === "Disputed" ? "disputed" : "active",
  );

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
      status: trade.status === "Disputed" ? "disputed" : "active",
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
    trade.status === "AwaitingRelease"
      ? `Admin @${normalizePiUsername(user.username)} joined this release review room.`
      : `Admin @${normalizePiUsername(user.username)} joined this dispute room.`,
  );

  return claimedRoom;
}

export async function getTradeChatEvidence(tradeId: string) {
  const supabase = getServiceClientOrThrow();
  const { data, error } = await supabase
    .from("trade_chat_messages")
    .select("sender_role, message_type, body, attachment_url, created_at")
    .eq("trade_id", tradeId)
    .eq("message_type", "proof")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ??
    []) as Array<Pick<TradeChatMessageRow, "sender_role" | "message_type" | "body" | "attachment_url" | "created_at">>;
  const latestSeller = rows.find((row) => row.sender_role === "seller");
  const latestBuyer = rows.find((row) => row.sender_role === "buyer");

  return {
    hasSellerProof: Boolean(
      latestSeller &&
        ((latestSeller.body?.trim().length ?? 0) >= 8 || latestSeller.attachment_url),
    ),
    hasBuyerProof: Boolean(
      latestBuyer &&
        ((latestBuyer.body?.trim().length ?? 0) >= 8 || latestBuyer.attachment_url),
    ),
    sellerProofText: latestSeller?.body?.trim() || undefined,
    buyerProofText: latestBuyer?.body?.trim() || undefined,
    sellerProofUrl: latestSeller?.attachment_url || undefined,
    buyerProofUrl: latestBuyer?.attachment_url || undefined,
  } satisfies TradeChatEvidence;
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

  const rows = (data ?? []) as TradeChatMessageRow[];
  const senderIds = rows
    .map((row) => row.sender_user_id)
    .filter((userId): userId is string => Boolean(userId));
  const reputations = await getUserReputations(senderIds);

  return Promise.all(rows.map((row) => mapChatMessage(row, reputations)));
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

  if (await purgeExpiredTradeChat(trade)) {
    throw new Error("This trade chat expired 7 days after the trade closed.");
  }

  return ensureTradeChatRoom(trade, tradeChatRoomStatus(trade));
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
