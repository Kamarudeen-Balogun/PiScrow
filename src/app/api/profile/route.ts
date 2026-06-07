import { jsonError, requireAppUser } from "@/server/auth";
import { getUserReputations } from "@/server/trades";
import { rateLimit, rateLimitProfiles, secureJson } from "@/server/security";

export async function GET(request: Request) {
  try {
    await rateLimit(request, { key: "profile:get", ...rateLimitProfiles.read });
    const user = await requireAppUser(request);
    const reputations = await getUserReputations([user.id]);
    const profile = reputations.get(user.id);

    if (!profile) {
      throw new Error("Could not load profile.");
    }

    return secureJson({ profile });
  } catch (error) {
    return jsonError(error, 401);
  }
}
