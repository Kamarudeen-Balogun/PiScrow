import { jsonError, requireAppUser } from "@/server/auth";
import { runReviewCopilot } from "@/server/review-copilot";
import { rateLimit, rateLimitProfiles, secureJson } from "@/server/security";

export async function POST(
  request: Request,
  context: { params: Promise<{ tradeId: string }> },
) {
  try {
    await rateLimit(request, {
      key: "review-copilot:post",
      ...rateLimitProfiles.admin,
    });
    const user = await requireAppUser(request);

    if (!user.isAdmin) {
      throw new Error("Only admins can run review recommendations.");
    }

    const { tradeId } = await context.params;
    const result = await runReviewCopilot(tradeId, user);

    return secureJson({
      ...result.tradePayload,
      recommendation: result.recommendation,
      reviewRecommendations: [result.recommendation],
    });
  } catch (error) {
    return jsonError(error, 401);
  }
}
