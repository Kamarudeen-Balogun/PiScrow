import { getServiceClientOrThrow } from "@/server/trades";

export type NotificationRow = {
  id: string;
  user_id: string;
  trade_id: string | null;
  type: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export type AppNotification = {
  id: string;
  userId: string;
  tradeId?: string;
  type: string;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
};

export function mapNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    tradeId: row.trade_id ?? undefined,
    type: row.type,
    title: row.title,
    body: row.body,
    readAt: row.read_at ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listNotificationsForUser(userId: string) {
  const supabase = getServiceClientOrThrow();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, user_id, trade_id, type, title, body, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as NotificationRow[]).map(mapNotification);
}

export async function createNotification({
  userId,
  tradeId,
  type,
  title,
  body,
  metadata = {},
}: {
  userId?: string | null;
  tradeId?: string | null;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}) {
  if (!userId) {
    return;
  }

  const supabase = getServiceClientOrThrow();
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    trade_id: tradeId ?? null,
    type,
    title,
    body,
    metadata,
  });

  if (error) {
    console.error("PiScrow notification insert failed:", error.message);
  }
}
