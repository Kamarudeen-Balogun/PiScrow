import { jsonError, requireAppUser } from "@/server/auth";
import { rateLimit, rateLimitProfiles, secureJson } from "@/server/security";

export async function POST(request: Request) {
  try {
    rateLimit(request, { key: "auth:pi", ...rateLimitProfiles.auth });
    const user = await requireAppUser(request);

    return secureJson({ user });
  } catch (error) {
    return jsonError(error, 401);
  }
}
