import { jsonError, requireAppUser } from "@/server/auth";
import { createNotification } from "@/server/notifications";
import { rateLimit, rateLimitProfiles, secureJson } from "@/server/security";
import {
  getServiceClientOrThrow,
  getUserReputations,
} from "@/server/trades";

export async function POST(request: Request) {
  try {
    await rateLimit(request, {
      key: "profile-verification:post",
      ...rateLimitProfiles.write,
    });
    const user = await requireAppUser(request);
    const supabase = getServiceClientOrThrow();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("users")
      .update({
        verification_requested_at: now,
        updated_at: now,
      })
      .eq("id", user.id)
      .eq("verified_badge", false);

    if (error) {
      throw new Error(error.message);
    }

    await createNotification({
      userId: user.id,
      type: "verification_requested",
      title: "Verification requested",
      body: "Your verified badge request is waiting for admin review.",
    });

    const profile = (await getUserReputations([user.id])).get(user.id);
    return secureJson({ profile });
  } catch (error) {
    return jsonError(error);
  }
}
