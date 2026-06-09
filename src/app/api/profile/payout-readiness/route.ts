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
      key: "profile-payout-readiness:post",
      ...rateLimitProfiles.write,
    });
    const user = await requireAppUser(request);
    const supabase = getServiceClientOrThrow();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("users")
      .update({
        payout_ready: true,
        payout_readiness_confirmed_at: now,
        updated_at: now,
      })
      .eq("id", user.id);

    if (error) {
      throw new Error(error.message);
    }

    await createNotification({
      userId: user.id,
      type: "payout_ready",
      title: "Payout readiness confirmed",
      body: "You can now post offers, show buyer interest, and receive PiScrow releases on your authenticated Pi account.",
    });

    const profile = (await getUserReputations([user.id])).get(user.id);

    if (!profile) {
      throw new Error("Could not load profile.");
    }

    return secureJson({ profile });
  } catch (error) {
    return jsonError(error);
  }
}
