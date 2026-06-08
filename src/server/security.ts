import { NextResponse } from "next/server";

import { sanitizeFormFields, sanitizeInput } from "@/lib/sanitize";

const DEFAULT_JSON_LIMIT_BYTES = 24 * 1024;
const DEFAULT_FORM_LIMIT_BYTES = 6 * 1024 * 1024;

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateBucket = {
  count: number;
  resetAt: number;
};

const rateBuckets = new Map<string, RateBucket>();

function memoryRateLimit(bucketKey: string, options: RateLimitOptions) {
  const now = Date.now();
  const bucket = rateBuckets.get(bucketKey);

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(bucketKey, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return;
  }

  if (bucket.count >= options.limit) {
    throwRateLimitResponse(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
  }

  bucket.count += 1;
}

export function clientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

export async function rateLimit(request: Request, options: RateLimitOptions) {
  const bucketKey = `${options.key}:${clientIp(request)}`;

  if (await upstashRateLimit(bucketKey, options)) {
    return;
  }

  memoryRateLimit(bucketKey, options);
}

async function upstashRateLimit(
  bucketKey: string,
  options: RateLimitOptions,
) {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return false;
  }

  try {
    const encodedKey = encodeURIComponent(bucketKey);
    const increment = await fetch(`${url}/incr/${encodedKey}`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!increment.ok) {
      throw new Error(`Upstash increment failed with ${increment.status}.`);
    }

    const body = (await increment.json()) as { result?: number | string };
    const count = Number(body.result ?? 0);

    if (!Number.isFinite(count) || count < 1) {
      throw new Error("Upstash returned an invalid counter.");
    }

    if (count === 1) {
      await fetch(
        `${url}/expire/${encodedKey}/${Math.max(1, Math.ceil(options.windowMs / 1000))}`,
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
    }

    if (count > options.limit) {
      throwRateLimitResponse(Math.max(1, Math.ceil(options.windowMs / 1000)));
    }

    return true;
  } catch (error) {
    if (error instanceof NextResponse) {
      throw error;
    }

    return false;
  }
}

function throwRateLimitResponse(retryAfter: number): never {
  const response = secureJson(
    { error: "Too many requests. Please wait before trying again." },
    { status: 429 },
  );
  response.headers.set("Retry-After", String(retryAfter));
  throw response;
}

export function applySecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");

  return response;
}

export function secureJson(data: unknown, init?: ResponseInit) {
  return applySecurityHeaders(NextResponse.json(data, init));
}

export function bodyTooLarge(request: Request, limitBytes: number) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");

  return Number.isFinite(contentLength) && contentLength > limitBytes;
}

export async function readJsonBody(
  request: Request,
  limitBytes = DEFAULT_JSON_LIMIT_BYTES,
) {
  if (bodyTooLarge(request, limitBytes)) {
    throw new Error("Request body is too large.");
  }

  const body = await request.json().catch(() => ({}));
  return sanitizeInput(body);
}

export async function readJsonObject(
  request: Request,
  limitBytes = DEFAULT_JSON_LIMIT_BYTES,
) {
  const body = await readJsonBody(request, limitBytes);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  return body as Record<string, unknown>;
}

export async function readFormDataBody(
  request: Request,
  limitBytes = DEFAULT_FORM_LIMIT_BYTES,
) {
  if (bodyTooLarge(request, limitBytes)) {
    throw new Error("Uploaded proof is too large.");
  }

  return request.formData();
}

export { sanitizeFormFields, sanitizeInput };

export const rateLimitProfiles = {
  auth: { limit: 12, windowMs: 60_000 },
  read: { limit: 120, windowMs: 60_000 },
  write: { limit: 30, windowMs: 60_000 },
  payment: { limit: 12, windowMs: 60_000 },
  upload: { limit: 10, windowMs: 60_000 },
  admin: { limit: 20, windowMs: 60_000 },
  feedback: { limit: 8, windowMs: 60_000 },
};
