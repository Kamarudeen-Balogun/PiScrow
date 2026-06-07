import { feedbackSchema } from "@/lib/validation";
import { getBearerToken, jsonError, requireAppUser } from "@/server/auth";
import {
  rateLimit,
  rateLimitProfiles,
  readJsonBody,
  secureJson,
} from "@/server/security";
import { getServiceClientOrThrow } from "@/server/trades";

const webhookTimeoutMs = 4500;

function feedbackWebhookUrl() {
  return process.env.PISCROW_FEEDBACK_WEBHOOK_URL?.trim() || "";
}

async function maybeAppUser(request: Request) {
  if (!getBearerToken(request)) {
    return null;
  }

  return requireAppUser(request).catch(() => null);
}

async function forwardFeedbackToWebhook(payload: Record<string, unknown>) {
  const url = feedbackWebhookUrl();

  if (!url) {
    return { status: "not_configured" as const };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), webhookTimeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Webhook failed with ${response.status}. ${body}`.trim());
    }

    return { status: "sent" as const };
  } catch (error) {
    return {
      status: "failed" as const,
      error:
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Feedback webhook failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  try {
    await rateLimit(request, {
      key: "feedback:post",
      ...rateLimitProfiles.feedback,
    });

    const parsed = feedbackSchema.safeParse(await readJsonBody(request));

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid feedback form.");
    }

    const user = await maybeAppUser(request);
    const submittedAt = new Date().toISOString();
    const payload = {
      app: "PiScrow",
      submittedAt,
      category: parsed.data.category,
      message: parsed.data.message,
      contactEmail: parsed.data.contactEmail || null,
      pageUrl: parsed.data.pageUrl || null,
      piUsername: user?.username ?? null,
      piUid: user?.uid ?? null,
      userId: user?.id ?? null,
      userAgent: request.headers.get("user-agent") ?? null,
    };
    const webhook = await forwardFeedbackToWebhook(payload);
    const supabase = getServiceClientOrThrow();

    const { error } = await supabase.from("feedback_messages").insert({
      user_id: user?.id ?? null,
      pi_uid: user?.uid ?? null,
      pi_username: user?.username ?? null,
      contact_email: parsed.data.contactEmail || null,
      category: parsed.data.category,
      message: parsed.data.message,
      page_url: parsed.data.pageUrl || null,
      user_agent: request.headers.get("user-agent") ?? null,
      webhook_status: webhook.status,
      webhook_error: webhook.status === "failed" ? webhook.error : null,
    });

    if (error) {
      throw new Error(error.message);
    }

    return secureJson({
      ok: true,
      webhookStatus: webhook.status,
    });
  } catch (error) {
    return jsonError(error);
  }
}
