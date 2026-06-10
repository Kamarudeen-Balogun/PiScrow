import { jsonError } from "@/server/auth";
import {
  assertTelegramWebhookSecret,
  handleTelegramWebhook,
} from "@/server/telegram";
import { rateLimit, rateLimitProfiles, secureJson } from "@/server/security";

export async function POST(request: Request) {
  try {
    await rateLimit(request, { key: "telegram:webhook", ...rateLimitProfiles.auth });
    assertTelegramWebhookSecret(request);
    const update = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    await handleTelegramWebhook(update);

    return secureJson({ ok: true });
  } catch (error) {
    return jsonError(error, 401);
  }
}
