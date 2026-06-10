import { jsonError, requireAppUser } from "@/server/auth";
import { rateLimit, rateLimitProfiles, secureJson } from "@/server/security";
import { getTelegramStatusForUser } from "@/server/telegram";

export async function GET(request: Request) {
  try {
    await rateLimit(request, { key: "telegram:status", ...rateLimitProfiles.read });
    const user = await requireAppUser(request);
    const telegram = await getTelegramStatusForUser(user.id);

    return secureJson({ telegram });
  } catch (error) {
    return jsonError(error, 401);
  }
}
