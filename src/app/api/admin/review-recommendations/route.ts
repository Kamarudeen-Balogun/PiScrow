import { jsonError, requireAppUser } from "@/server/auth";
import { listLatestReviewRecommendations } from "@/server/review-copilot";
import { rateLimit, rateLimitProfiles, secureJson } from "@/server/security";
import { getServiceClientOrThrow } from "@/server/trades";

export async function GET(request: Request) {
  try {
    await rateLimit(request, {
      key: "admin-review-recommendations:get",
      ...rateLimitProfiles.admin,
    });
    const user = await requireAppUser(request);

    if (!user.isAdmin) {
      throw new Error("Only admins can view review recommendations.");
    }

    const supabase = getServiceClientOrThrow();
    const { data, error } = await supabase
      .from("trades")
      .select("id")
      .eq("status", "Disputed")
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(error.message);
    }

    const tradeIds = ((data ?? []) as { id: string }[]).map((trade) => trade.id);

    return secureJson({
      recommendations: await listLatestReviewRecommendations(tradeIds),
    });
  } catch (error) {
    return jsonError(error, 401);
  }
}
