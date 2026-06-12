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

function telegramCommandLines() {
  return [
    "Commands:",
    "/start - Wake up PiScrow in this chat",
    "/link - Learn how to securely link this Telegram chat",
    "/status - Check whether this chat is linked to PiScrow",
    "/unlink - Disconnect this Telegram chat from PiScrow",
    "/help - See what this bot can do",
  ];
}

function telegramOpenAppLine() {
  const url = appUrl();

  return url ? `Open PiScrow: ${url}` : "Open PiScrow and go to Profile.";
}

function telegramProjectIntroText() {
  const bot = telegramBotUsername() || "PiScrow_bot";
  return [
    `PiScrow assistant is ready in @${bot}.`,
    "",
    "This bot sends PiScrow updates when buyers, sellers, or admins move your trade forward.",
    "Expect alerts for funding, proof, disputes, payout requests, and admin decisions.",
    "",
    "Link your Telegram chat from PiScrow Profile to activate notifications.",
    telegramOpenAppLine(),
    "",
    ...telegramCommandLines(),
  ].join("\n");
}

function telegramHelpText() {
  const bot = telegramBotUsername() || "PiScrow_bot";
  return [
    `PiScrow help for @${bot}`,
    "",
    "Use this bot to receive trade activity updates without leaving Telegram.",
    "The secure link starts inside your PiScrow profile, then Telegram confirms the connection here.",
    "",
    ...telegramCommandLines(),
    "",
    telegramOpenAppLine(),
  ].join("\n");
}

function telegramLinkInstructionsText(linkedRow?: TelegramLinkRow | null) {
  if (linkedRow) {
    return [
      "This Telegram chat is already linked to PiScrow.",
      `Linked PiScrow account: @${linkedRow.pi_username}`,
      "",
      "If you want to reconnect or switch accounts, open PiScrow Profile and tap Link Telegram again.",
      telegramOpenAppLine(),
    ].join("\n");
  }

  return [
    "PiScrow linking starts inside the app so we can protect your account.",
    "Open PiScrow, go to Profile, tap Link Telegram, then press Start on the secure bot link.",
    "",
    "Sending /link here will not finish the connection without that secure app link.",
    telegramOpenAppLine(),
  ].join("\n");
}

function telegramLinkedConfirmationText(params: {
  piUsername?: string | null;
  telegramUsername?: string;
}) {
  const accountLine = params.piUsername
    ? `Linked PiScrow account: @${params.piUsername}`
    : "This Telegram chat is now linked to PiScrow.";
  const telegramLine = params.telegramUsername
    ? `Telegram username: @${params.telegramUsername.replace(/^@+/, "")}`
    : "Telegram username saved for this chat.";

  return [
    "PiScrow Telegram link confirmed.",
    accountLine,
    telegramLine,
    "",
    "You will now receive updates for trade funding, proof, disputes, releases, and admin decisions here.",
    "Return to PiScrow Profile and tap Check status if the app has not refreshed yet.",
  ].join("\n");
}

function telegramLinkErrorText(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("expired")) {
      return [
        "This PiScrow Telegram link has expired.",
        "Open PiScrow Profile, tap Link Telegram again, and use the fresh secure bot link.",
        telegramOpenAppLine(),
      ].join("\n");
    }

    if (message.includes("malformed") || message.includes("invalid")) {
      return [
        "PiScrow could not verify this Telegram link.",
        "Open PiScrow Profile and generate a fresh secure bot link before trying again.",
        telegramOpenAppLine(),
      ].join("\n");
    }

    if (message.includes("not configured")) {
      return "PiScrow Telegram linking is not configured for this deployment yet.";
    }
  }

  return [
    "PiScrow could not complete this Telegram link.",
    "Open PiScrow Profile, create a fresh secure bot link, then press Start again.",
    telegramOpenAppLine(),
  ].join("\n");
}

function telegramUnlinkedText(linkedRow?: TelegramLinkRow | null) {
  if (!linkedRow) {
    return [
      "No active PiScrow link was found for this Telegram chat.",
      "This chat is already disconnected.",
      telegramOpenAppLine(),
    ].join("\n");
  }

  return [
    "PiScrow Telegram link removed.",
    `This chat will no longer receive trade updates for @${linkedRow.pi_username}.`,
    "",
    "You can reconnect any time from PiScrow Profile.",
    telegramOpenAppLine(),
  ].join("\n");
}

function telegramStatusText(linkedRow?: TelegramLinkRow | null) {
  if (!linkedRow) {
    return [
      "PiScrow status: not linked",
      "This Telegram chat is not connected to any PiScrow profile yet.",
      "",
      "To start receiving trade updates, open PiScrow Profile and tap Link Telegram.",
      telegramOpenAppLine(),
    ].join("\n");
  }

  const lines = [
    "PiScrow status: linked",
    `PiScrow account: @${linkedRow.pi_username}`,
    linkedRow.telegram_username
      ? `Telegram username: @${linkedRow.telegram_username}`
      : "Telegram username: not shared by Telegram for this chat",
    "Notifications: active for trade funding, proof, disputes, releases, and admin decisions.",
  ];

  if (linkedRow.linked_at) {
    lines.push(`Linked at: ${linkedRow.linked_at}`);
  }

  lines.push("", telegramOpenAppLine());

  return lines.join("\n");
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
          const linkedRow = await getTelegramLinkRowByChatId(chatId);
          await sendTelegramText(
            chatId,
            telegramLinkedConfirmationText({
              piUsername: linkedRow?.pi_username,
              telegramUsername,
            }),
          );
        } catch (error) {
          await sendTelegramText(chatId, telegramLinkErrorText(error));
        }
        return { ok: true };
      }

      const linkedRow = await getTelegramLinkRowByChatId(chatId);
      await sendTelegramText(
        chatId,
        linkedRow
          ? [telegramProjectIntroText(), "", telegramStatusText(linkedRow)].join("\n")
          : telegramProjectIntroText(),
      );
      return { ok: true };

    case "/help":
      await sendTelegramText(chatId, telegramHelpText());
      return { ok: true };

    case "/link": {
      const linkedRow = await getTelegramLinkRowByChatId(chatId);
      await sendTelegramText(
        chatId,
        telegramLinkInstructionsText(linkedRow),
      );
      return { ok: true };
    }

    case "/unlink": {
      const unlinked = await unlinkTelegramForChat(chatId);
      await sendTelegramText(chatId, telegramUnlinkedText(unlinked));
      return { ok: true };
    }

    case "/status": {
      const row = await getTelegramLinkRowByChatId(chatId);
      await sendTelegramText(chatId, telegramStatusText(row));
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
