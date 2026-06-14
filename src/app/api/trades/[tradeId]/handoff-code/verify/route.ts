import { verifyTradeHandoffCodeSchema } from "@/lib/validation";
import { jsonError, requireAppUser } from "@/server/auth";
import {
  rateLimit,
  rateLimitProfiles,
  readJsonObject,
  secureJson,
} from "@/server/security";
import { verifyTradeHandoffCode } from "@/server/trade-handoff";
import { getTradeForAction, listTradesForUser } from "@/server/trades";

export async function POST(
  request: Request,
  context: { params: Promise<{ tradeId: string }> },
) {
  try {
    await rateLimit(request, {
      key: "handoff-code-verify:post",
      limit: 6,
      windowMs: rateLimitProfiles.write.windowMs,
    });
    const user = await requireAppUser(request);
    const { tradeId } = await context.params;
    const parsed = verifyTradeHandoffCodeSchema.safeParse({
      ...(await readJsonObject(request)),
      tradeId,
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid handoff code.");
    }

    const trade = await getTradeForAction(tradeId);
    const result = await verifyTradeHandoffCode({
      code: parsed.data.code,
      trade,
      user,
    });

    return secureJson({
      ...(await listTradesForUser(user)),
      outcome: result.outcome,
      message: result.outcome === "review_required" ? result.message : undefined,
    });
  } catch (error) {
    return jsonError(error);
  }
}
