import { jsonError } from "@/server/auth";
import { rateLimit, rateLimitProfiles, secureJson } from "@/server/security";
import { listPublicLedger } from "@/server/trades";

export async function GET(request: Request) {
  try {
    rateLimit(request, { key: "public-feed:get", ...rateLimitProfiles.read });
    return secureJson(await listPublicLedger());
  } catch (error) {
    return jsonError(error, 500);
  }
}
