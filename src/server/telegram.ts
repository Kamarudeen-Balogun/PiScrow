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
const telegramLinkTokenSignatureLength = 16;
const telegramWebhookRetryLimit = 2;

type TelegramApiResponse = {
  ok?: boolean;
  description?: string;
  parameters?: {
    retry_after?: number;
  };
};

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

function normalizeUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function appUrl() {
  return normalizeUrl(
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
      process.env.VERCEL_BRANCH_URL?.trim() ||
      process.env.VERCEL_URL?.trim() ||
      "",
  );
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

function compactUuid(value: string) {
  const normalized = value.trim().replace(/-/g, "").toLowerCase();

  if (!/^[0-9a-f]{32}$/.test(normalized)) {
    throw new Error("Telegram link token user is invalid.");
  }

  return normalized;
}

function expandCompactUuid(value: string) {
  if (!/^[0-9a-f]{32}$/.test(value)) {
    throw new Error("Telegram link token payload is invalid.");
  }

  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20),
  ].join("-");
}

function signTelegramTokenBody(body: string) {
  const secret = telegramLinkSecret();

  if (!secret) {
    throw new Error("Telegram link signing secret is not configured.");
  }

  return createHmac("sha256", secret).update(body).digest("base64url");
}

function shortenTelegramTokenSignature(signature: string) {
  return signature.slice(0, telegramLinkTokenSignatureLength);
}

function createTelegramLinkToken(user: Pick<AppUser, "id" | "uid" | "username">) {
  const compactUserId = compactUuid(user.id);
  const expiresAtSeconds = Math.floor((Date.now() + telegramLinkLifetimeMs) / 1000);
  const expiresAtToken = expiresAtSeconds.toString(36);
  const body = `p_${compactUserId}_${expiresAtToken}`;
  const signature = shortenTelegramTokenSignature(signTelegramTokenBody(body));

  if (!/^[A-Za-z0-9_-]{1,64}$/.test(`${body}_${signature}`)) {
    throw new Error("Telegram link token could not be encoded safely.");
  }

  return `${body}_${signature}`;
}

function verifyTelegramLinkToken(token: string) {
  const trimmed = token.trim();

  if (trimmed.length <= telegramLinkTokenSignatureLength + 1) {
    throw new Error("Telegram link token is malformed.");
  }

  const separatorIndex = trimmed.length - telegramLinkTokenSignatureLength - 1;
  const separator = trimmed.charAt(separatorIndex);
  const body = trimmed.slice(0, separatorIndex);
  const signature = trimmed.slice(separatorIndex + 1);
  const [prefix, compactUserId, expiresAtToken] = body.split("_");

  if (
    separator !== "_" ||
    prefix !== "p" ||
    !compactUserId ||
    !expiresAtToken ||
    !signature ||
    !/^[0-9a-f]{32}$/.test(compactUserId) ||
    !/^[a-z0-9]+$/i.test(expiresAtToken) ||
    !/^[A-Za-z0-9_-]+$/.test(signature)
  ) {
    throw new Error("Telegram link token is malformed.");
  }

  const expected = signTelegramTokenBody(body);
  const expectedBuffer = Buffer.from(shortenTelegramTokenSignature(expected));
  const signatureBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    throw new Error("Telegram link token is invalid.");
  }

  const expiresAtSeconds = Number.parseInt(expiresAtToken, 36);
  const parsed: TelegramLinkTokenPayload = {
    userId: expandCompactUuid(compactUserId),
    exp: expiresAtSeconds,
  };

  if (!parsed || typeof parsed.userId !== "string" || !Number.isFinite(parsed.exp)) {
    throw new Error("Telegram link token payload is invalid.");
  }

  if (parsed.exp <= Math.floor(Date.now() / 1000)) {
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

async function getTelegramUserIdentityRowById(userId: string) {
  const supabase = getServiceClientOrThrow();
  const { data, error } = await supabase
    .from("users")
    .select("id, pi_uid, pi_username")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as { id: string; pi_uid: string; pi_username: string } | null) ?? null;
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
  return formatTelegramNotificationLines(notification).join("\n").trim();
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function getTradeTitleForNotification(tradeId?: string) {
  if (!tradeId) {
    return "";
  }

  const supabase = getServiceClientOrThrow();
  const { data, error } = await supabase
    .from("trades")
    .select("title")
    .eq("id", tradeId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return typeof data?.title === "string" ? data.title.trim() : "";
}

function notificationTradeTitleFromMetadata(notification: AppNotification) {
  const tradeTitle = notification.metadata?.tradeTitle;
  return typeof tradeTitle === "string" ? tradeTitle.trim() : "";
}

function formatTelegramNotificationLines(notification: AppNotification) {
  const lines = [
    "PiScrow update",
    "",
    notification.title,
    notification.body,
  ];

  if (notification.tradeId) {
    const tradeTitle = notificationTradeTitleFromMetadata(notification);

    if (tradeTitle) {
      lines.push("", `Trade: ${tradeTitle}`, `Ref: ${notification.tradeId.slice(0, 8)}`);
    } else {
      lines.push("", `Trade: ${notification.tradeId.slice(0, 8)}`);
    }
  }

  const url = appUrl();

  if (url) {
    lines.push("", `Open PiScrow: ${url}`);
  }

  return lines;
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

async function ensureTelegramWebhook() {
  const token = telegramBotToken();

  if (!token) {
    throw new Error("Telegram bot token is not configured.");
  }

  const url = appUrl();

  if (!url) {
    throw new Error("PiScrow app URL is not configured for Telegram linking.");
  }

  const webhookSecret = telegramWebhookSecret();

  for (let attempt = 0; attempt < telegramWebhookRetryLimit; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), telegramSendTimeoutMs);

    try {
      const response = await fetch(`${telegramApiBase}/bot${token}/setWebhook`, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: `${url}/api/telegram/webhook`,
          secret_token: webhookSecret || undefined,
          allowed_updates: ["message", "edited_message"],
          drop_pending_updates: false,
        }),
      });

      const responseText = await response.text().catch(() => "");
      const payload = responseText
        ? (JSON.parse(responseText) as TelegramApiResponse)
        : ({} as TelegramApiResponse);

      if (response.ok && payload.ok !== false) {
        return;
      }

      const retryAfterSeconds = Number(payload.parameters?.retry_after ?? 0);
      const shouldRetry =
        response.status === 429 &&
        attempt + 1 < telegramWebhookRetryLimit &&
        Number.isFinite(retryAfterSeconds) &&
        retryAfterSeconds > 0 &&
        retryAfterSeconds <= 5;

      if (shouldRetry) {
        await wait(retryAfterSeconds * 1000);
        continue;
      }

      if (response.status === 429) {
        throw new Error(
          "Telegram is temporarily rate limiting bot setup. Wait a moment, then try Link Telegram again.",
        );
      }

      if (!response.ok) {
        throw new Error(
          "Telegram bot setup failed for this deployment. Check the bot token, bot username, and app URL, then try again.",
        );
      }

      throw new Error(
        payload.description || "Telegram webhook setup failed for this deployment.",
      );
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          "Telegram bot setup returned an unreadable response. Try Link Telegram again.",
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
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

  await ensureTelegramWebhook();
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
  const userRow = await getTelegramUserIdentityRowById(payload.userId);

  if (!userRow) {
    throw new Error("PiScrow account for this Telegram link was not found.");
  }

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
        pi_uid: userRow.pi_uid,
        pi_username: normalizePiUsername(userRow.pi_username),
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
    return;
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

  const tradeTitle =
    notificationTradeTitleFromMetadata(notification) ||
    (await getTradeTitleForNotification(notification.tradeId).catch(() => ""));
  const message = formatTelegramNotificationMessage({
    ...notification,
    metadata: {
      ...notification.metadata,
      tradeTitle,
    },
  });

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
