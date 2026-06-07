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

export function rateLimit(request: Request, options: RateLimitOptions) {
  const now = Date.now();
  const bucketKey = `${options.key}:${clientIp(request)}`;
  const bucket = rateBuckets.get(bucketKey);

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(bucketKey, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return;
  }

  if (bucket.count >= options.limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    const response = secureJson(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429 },
    );
    response.headers.set("Retry-After", String(retryAfter));
    throw response;
  }

  bucket.count += 1;
}

export function applySecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");

  return response;
}

export function secureJson(data: unknown, init?: ResponseInit) {
  return applySecurityHeaders(NextResponse.json(data, init));
}

export function isSecurityResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
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
};
