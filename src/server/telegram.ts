import { createHmac, timingSafeEqual } from "node:crypto";

import { normalizePiUsername, type AppUser } from "@/server/auth";
import { getServiceClientOrThrow } from "@/server/trades";
import type { TelegramLinkStatus } from "@/types/profile";

import type { AppNotification } from "@/server/notifications";

type TelegramLinkRow = {
  id: string;
  user_id: string;
  pi_uid: string;
  pi_username: string;
  telegram_chat_id: string | null;
  telegram_username: string | null;
  status: "linked" | "unlinked";
  notifications_enabled: boolean;
  linked_at: string | null;
  unlinked_at: string | null;
  last_delivery_at: string | null;
  last_delivery_error: string | null;
  created_at: string;
  updated_at: string;
};

type TelegramLinkTokenPayload = {
  userId: string;
  piUid: string;
  piUsername: string;
  exp: number;
};

type TelegramUpdate = {
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

type TelegramMessage = {
  chat?: {
    id?: number | string;
    type?: string;
    username?: string;
  };
  from?: {
    username?: string;
  };
  text?: string;
};

const telegramApiBase = "https://api.telegram.org";
const telegramSendTimeoutMs = 4_500;
const telegramLinkLifetimeMs = 30 * 60 * 1000;

function telegramBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
}

export function telegramBotUsername() {
  return (process.env.TELEGRAM_BOT_USERNAME?.trim() || "").replace(/^@+/, "");
}

function telegramWebhookSecret() {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "";
}

function telegramLinkSecret() {
  return process.env.PISCROW_TELEGRAM_LINK_SECRET?.trim() || "";
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
}

export function telegramIsConfigured() {
  return Boolean(telegramBotToken() && telegramBotUsername());
}

function defaultTelegramStatus(): TelegramLinkStatus {
  return {
    configured: telegramIsConfigured(),
    linked: false,
    botUsername: telegramBotUsername(),
    notificationsEnabled: false,
  };
}

function maskChatId(chatId?: string | null) {
  if (!chatId) {
    return undefined;
  }

  const trimmed = chatId.trim();

  if (trimmed.length <= 4) {
    return trimmed;
  }

  return `••••${trimmed.slice(-4)}`;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signTelegramTokenBody(body: string) {
  const secret = telegramLinkSecret();

  if (!secret) {
    throw new Error("Telegram link signing secret is not configured.");
  }

  return createHmac("sha256", secret).update(body).digest("base64url");
}

function createTelegramLinkToken(user: Pick<AppUser, "id" | "uid" | "username">) {
  const payload: TelegramLinkTokenPayload = {
    userId: user.id,
    piUid: user.uid,
    piUsername: normalizePiUsername(user.username),
    exp: Date.now() + telegramLinkLifetimeMs,
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = signTelegramTokenBody(body);
  return `${body}.${signature}`;
}

function verifyTelegramLinkToken(token: string) {
  const [body, signature] = token.trim().split(".");

  if (!body || !signature) {
    throw new Error("Telegram link token is malformed.");
  }

  const expected = signTelegramTokenBody(body);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    throw new Error("Telegram link token is invalid.");
  }

  const parsed = JSON.parse(base64UrlDecode(body)) as TelegramLinkTokenPayload;

  if (
    !parsed ||
    typeof parsed.userId !== "string" ||
    typeof parsed.piUid !== "string" ||
    typeof parsed.piUsername !== "string" ||
    typeof parsed.exp !== "number"
  ) {
    throw new Error("Telegram link token payload is invalid.");
  }

  if (parsed.exp <= Date.now()) {
    throw new Error("Telegram link token has expired.");
  }

  return parsed;
}

function mapTelegramStatus(row?: TelegramLinkRow | null): TelegramLinkStatus {
  if (!row || row.status !== "linked" || !row.notifications_enabled) {
    return defaultTelegramStatus();
  }

  return {
    configured: telegramIsConfigured(),
    linked: true,
    botUsername: telegramBotUsername(),
    notificationsEnabled: row.notifications_enabled,
    telegramUsername: row.telegram_username ?? undefined,
    maskedChatId: maskChatId(row.telegram_chat_id),
    linkedAt: row.linked_at ?? undefined,
    lastDeliveryAt: row.last_delivery_at ?? undefined,
    lastDeliveryError: row.last_delivery_error ?? undefined,
  };
}

async function getTelegramLinkRowByUserId(userId: string) {
  const supabase = getServiceClientOrThrow();
  const { data, error } = await supabase
    .from("telegram_links")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as TelegramLinkRow | null) ?? null;
}

async function getTelegramLinkRowByChatId(chatId: string) {
  const supabase = getServiceClientOrThrow();
  const { data, error } = await supabase
    .from("telegram_links")
    .select("*")
    .eq("telegram_chat_id", chatId)
    .eq("status", "linked")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as TelegramLinkRow | null) ?? null;
}

async function recordNotificationDelivery(params: {
  notificationId: string;
  userId: string;
  status: "sent" | "failed" | "skipped";
  responseCode?: number;
  error?: string;
  payloadSnapshot?: Record<string, unknown>;
}) {
  const supabase = getServiceClientOrThrow();
  const { error } = await supabase.from("notification_deliveries").insert({
    notification_id: params.notificationId,
    user_id: params.userId,
    channel: "telegram",
    status: params.status,
    response_code: params.responseCode ?? null,
    error_message: params.error ?? null,
    payload_snapshot: params.payloadSnapshot ?? {},
    sent_at: params.status === "sent" ? new Date().toISOString() : null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function updateTelegramDeliveryStatus(
  userId: string,
  values: { last_delivery_at?: string | null; last_delivery_error?: string | null },
) {
  const supabase = getServiceClientOrThrow();
  const { error } = await supabase
    .from("telegram_links")
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }
}

function formatTelegramNotificationMessage(notification: AppNotification) {
  const lines = [
    "PiScrow update",
    "",
    notification.title,
    notification.body,
  ];

  if (notification.tradeId) {
    lines.push("", `Trade: ${notification.tradeId.slice(0, 8)}`);
  }

  const url = appUrl();

  if (url) {
    lines.push("", `Open PiScrow: ${url}`);
  }

  return lines.join("\n").trim();
}

export async function sendTelegramText(
  chatId: string,
  text: string,
) {
  const token = telegramBotToken();

  if (!token) {
    throw new Error("Telegram bot token is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), telegramSendTimeoutMs);

  try {
    const response = await fetch(
      `${telegramApiBase}/bot${token}/sendMessage`,
      {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Telegram send failed with ${response.status}. ${errorText}`.trim(),
      );
    }

    return response.status;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getTelegramStatusForUser(userId: string) {
  const row = await getTelegramLinkRowByUserId(userId);
  return mapTelegramStatus(row);
}

export async function createTelegramLinkForUser(
  user: Pick<AppUser, "id" | "uid" | "username">,
) {
  if (!telegramIsConfigured()) {
    throw new Error("Telegram bot is not configured for this deployment.");
  }

  const token = createTelegramLinkToken(user);
  return {
    deepLink: `https://t.me/${telegramBotUsername()}?start=${encodeURIComponent(token)}`,
    telegram: await getTelegramStatusForUser(user.id),
  };
}

export async function unlinkTelegramForUser(userId: string) {
  const supabase = getServiceClientOrThrow();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("telegram_links")
    .update({
      status: "unlinked",
      notifications_enabled: false,
      unlinked_at: now,
      updated_at: now,
    })
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return getTelegramStatusForUser(userId);
}

async function unlinkTelegramForChat(chatId: string) {
  const existing = await getTelegramLinkRowByChatId(chatId);

  if (!existing) {
    return null;
  }

  await unlinkTelegramForUser(existing.user_id);
  return existing;
}

export async function linkTelegramChatFromToken(params: {
  token: string;
  chatId: string;
  telegramUsername?: string;
}) {
  const payload = verifyTelegramLinkToken(params.token);
  const supabase = getServiceClientOrThrow();
  const now = new Date().toISOString();

  await supabase
    .from("telegram_links")
    .update({
      status: "unlinked",
      notifications_enabled: false,
      unlinked_at: now,
      updated_at: now,
    })
    .eq("telegram_chat_id", params.chatId)
    .neq("user_id", payload.userId);

  const { error } = await supabase
    .from("telegram_links")
    .upsert(
      {
        user_id: payload.userId,
        pi_uid: payload.piUid,
        pi_username: payload.piUsername,
        telegram_chat_id: params.chatId,
        telegram_username: params.telegramUsername?.replace(/^@+/, "") || null,
        status: "linked",
        notifications_enabled: true,
        linked_at: now,
        unlinked_at: null,
        last_delivery_error: null,
        updated_at: now,
      },
      { onConflict: "user_id" },
    );

  if (error) {
    throw new Error(error.message);
  }

  return getTelegramStatusForUser(payload.userId);
}

function telegramHelpText() {
  const bot = telegramBotUsername() || "PiScrow_bot";
  return [
    `Welcome to @${bot}.`,
    "",
    "Commands:",
    "/start - Start PiScrow notifications",
    "/help - See help and support info",
    "/link - Connect Telegram from the PiScrow profile",
    "/unlink - Remove Telegram connection",
    "/status - View your PiScrow Telegram link status",
  ].join("\n");
}

export async function handleTelegramWebhook(update: TelegramUpdate) {
  const message = update.message ?? update.edited_message;
  const text = message?.text?.trim() || "";
  const chatId =
    message?.chat?.id == null ? "" : String(message.chat.id).trim();
  const telegramUsername =
    message?.from?.username ?? message?.chat?.username ?? undefined;

  if (!chatId || !text.startsWith("/")) {
    return { ok: true };
  }

  const [rawCommand, ...rest] = text.split(/\s+/);
  const command = rawCommand.split("@")[0]?.toLowerCase() || "";
  const payload = rest.join(" ").trim();

  switch (command) {
    case "/start":
      if (payload) {
        try {
          await linkTelegramChatFromToken({
            token: payload,
            chatId,
            telegramUsername,
          });
          await sendTelegramText(
            chatId,
            "PiScrow Telegram alerts are now linked. You will receive trade, dispute, payout, and chat updates here.",
          );
        } catch (error) {
          await sendTelegramText(
            chatId,
            error instanceof Error
              ? error.message
              : "PiScrow could not complete this Telegram link.",
          );
        }
        return { ok: true };
      }

      await sendTelegramText(chatId, telegramHelpText());
      return { ok: true };

    case "/help":
      await sendTelegramText(chatId, telegramHelpText());
      return { ok: true };

    case "/link":
      await sendTelegramText(
        chatId,
        "Open PiScrow, go to Profile, and tap Link Telegram to generate your secure bot link.",
      );
      return { ok: true };

    case "/unlink": {
      const unlinked = await unlinkTelegramForChat(chatId);
      await sendTelegramText(
        chatId,
        unlinked
          ? "PiScrow Telegram alerts have been disconnected for this chat."
          : "No active PiScrow Telegram link was found for this chat.",
      );
      return { ok: true };
    }

    case "/status": {
      const row = await getTelegramLinkRowByChatId(chatId);
      await sendTelegramText(
        chatId,
        row
          ? `Linked to @${row.pi_username}. PiScrow alerts are active for this Telegram chat.`
          : "This Telegram chat is not linked yet. Open PiScrow and use Profile -> Link Telegram.",
      );
      return { ok: true };
    }

    default:
      await sendTelegramText(chatId, telegramHelpText());
      return { ok: true };
  }
}

export function assertTelegramWebhookSecret(request: Request) {
  const expected = telegramWebhookSecret();

  if (!expected) {
    throw new Error("Telegram webhook secret is not configured.");
  }

  const received =
    request.headers.get("x-telegram-bot-api-secret-token")?.trim() || "";

  if (!received || received !== expected) {
    throw new Error("Telegram webhook secret is invalid.");
  }
}

export async function deliverTelegramNotification(
  notification: AppNotification,
) {
  if (!telegramIsConfigured()) {
    return;
  }

  const link = await getTelegramLinkRowByUserId(notification.userId);

  if (!link || link.status !== "linked" || !link.notifications_enabled || !link.telegram_chat_id) {
    await recordNotificationDelivery({
      notificationId: notification.id,
      userId: notification.userId,
      status: "skipped",
      payloadSnapshot: {
        reason: "telegram_not_linked",
      },
    }).catch(() => {});
    return;
  }

  const message = formatTelegramNotificationMessage(notification);

  try {
    const responseCode = await sendTelegramText(link.telegram_chat_id, message);
    const now = new Date().toISOString();

    await Promise.allSettled([
      recordNotificationDelivery({
        notificationId: notification.id,
        userId: notification.userId,
        status: "sent",
        responseCode,
        payloadSnapshot: {
          tradeId: notification.tradeId ?? null,
          title: notification.title,
        },
      }),
      updateTelegramDeliveryStatus(notification.userId, {
        last_delivery_at: now,
        last_delivery_error: null,
      }),
    ]);
  } catch (error) {
    const messageText =
      error instanceof Error
        ? error.message.slice(0, 500)
        : "Telegram delivery failed.";

    await Promise.allSettled([
      recordNotificationDelivery({
        notificationId: notification.id,
        userId: notification.userId,
        status: "failed",
        error: messageText,
        payloadSnapshot: {
          tradeId: notification.tradeId ?? null,
          title: notification.title,
        },
      }),
      updateTelegramDeliveryStatus(notification.userId, {
        last_delivery_error: messageText,
      }),
    ]);
  }
}
