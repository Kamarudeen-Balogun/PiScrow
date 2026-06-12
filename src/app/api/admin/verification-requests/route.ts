import { z } from "zod";

import { canRequestVerifiedBadge, VERIFIED_BADGE_MIN_COMPLETED_TRADES } from "@/lib/reputation";
import { jsonError, requireAppUser } from "@/server/auth";
import { createNotification } from "@/server/notifications";
import { rateLimit, rateLimitProfiles, readJsonBody, secureJson } from "@/server/security";
import { getServiceClientOrThrow, getUserReputations } from "@/server/trades";

const approveSchema = z.object({
  userId: z.string().min(1),
});

export async function GET(request: Request) {
  try {
    await rateLimit(request, {
      key: "admin-verification:get",
      ...rateLimitProfiles.admin,
    });
    const user = await requireAppUser(request);

    if (!user.isAdmin) {
      throw new Error("Only admins can view verification requests.");
    }

    return secureJson({ requests: await listVerificationRequests() });
  } catch (error) {
    return jsonError(error, 401);
  }
}

export async function POST(request: Request) {
  try {
    await rateLimit(request, {
      key: "admin-verification:post",
      ...rateLimitProfiles.admin,
    });
    const user = await requireAppUser(request);

    if (!user.isAdmin) {
      throw new Error("Only admins can approve verification requests.");
    }

    const parsed = approveSchema.safeParse(await readJsonBody(request));

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid verification request.");
    }

    const profile = (await getUserReputations([parsed.data.userId])).get(parsed.data.userId);

    if (!profile) {
      throw new Error("Could not load the requested profile.");
    }

    if (!canRequestVerifiedBadge(profile)) {
      throw new Error(
        `User must complete ${VERIFIED_BADGE_MIN_COMPLETED_TRADES} successful trades before approval.`,
      );
    }

    const supabase = getServiceClientOrThrow();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("users")
      .update({
        verified_badge: true,
        verification_reviewed_at: now,
        verification_reviewed_by: user.username,
        updated_at: now,
      })
      .eq("id", parsed.data.userId);

    if (error) {
      throw new Error(error.message);
    }

    await createNotification({
      userId: parsed.data.userId,
      type: "verification_approved",
      title: "Verified badge approved",
      body: `@${user.username} approved your PiScrow verified badge.`,
    });

    return secureJson({ requests: await listVerificationRequests() });
  } catch (error) {
    return jsonError(error);
  }
}

async function listVerificationRequests() {
  const supabase = getServiceClientOrThrow();
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .not("verification_requested_at", "is", null)
    .eq("verified_badge", false)
    .order("verification_requested_at", { ascending: true })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  const ids = ((data ?? []) as { id: string }[]).map((request) => request.id);
  return [...(await getUserReputations(ids)).values()].filter((profile) =>
    canRequestVerifiedBadge(profile),
  );
}
