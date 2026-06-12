import { z } from "zod";

import { jsonError } from "@/server/auth";
import { processExpiredDeliveries } from "@/server/delivery-expiry";
import {
  rateLimit,
  rateLimitProfiles,
  readJsonBody,
  secureJson,
} from "@/server/security";

const requestSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  tradeId: z.string().trim().min(1).optional(),
});

function internalCronToken() {
  return process.env.PISCROW_INTERNAL_CRON_TOKEN?.trim() || "";
}

function assertInternalCronRequest(request: Request) {
  const expected = internalCronToken();

  if (!expected) {
    throw new Error("PISCROW_INTERNAL_CRON_TOKEN is not configured.");
  }

  const bearer = request.headers.get("authorization") ?? "";
  const headerToken = request.headers.get("x-piscrow-cron-token") ?? "";
  const provided = bearer.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || headerToken.trim();

  if (!provided || provided !== expected) {
    throw new Error("Internal delivery expiry token is invalid.");
  }
}

async function handle(request: Request, body: Record<string, unknown> = {}) {
  await rateLimit(request, {
    key: "internal:expire-deliveries",
    ...rateLimitProfiles.auth,
  });
  assertInternalCronRequest(request);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid expiry request.");
  }

  const result = await processExpiredDeliveries(parsed.data);

  return secureJson({
    ok: true,
    ...result,
  });
}

export async function GET(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    const status =
      error instanceof Error &&
      (error.message.includes("token") || error.message.includes("configured"))
        ? 401
        : 500;
    return jsonError(error, status);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await readJsonBody(request).catch(() => ({}))) as Record<string, unknown>;
    return await handle(request, body);
  } catch (error) {
    const status =
      error instanceof Error &&
      (error.message.includes("token") || error.message.includes("configured"))
        ? 401
        : 500;
    return jsonError(error, status);
  }
}
