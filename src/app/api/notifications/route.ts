import { jsonError, requireAppUser } from "@/server/auth";
import { listNotificationsForUser } from "@/server/notifications";
import { rateLimit, rateLimitProfiles, secureJson } from "@/server/security";

export async function GET(request: Request) {
  try {
    await rateLimit(request, { key: "notifications:get", ...rateLimitProfiles.read });
    const user = await requireAppUser(request);

    return secureJson({
      notifications: await listNotificationsForUser(user.id),
    });
  } catch (error) {
    return jsonError(error, 401);
  }
}
