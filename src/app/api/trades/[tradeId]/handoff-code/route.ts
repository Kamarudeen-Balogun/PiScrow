import { tradeHandoffCodeActionSchema } from "@/lib/validation";
import { jsonError, requireAppUser } from "@/server/auth";
import {
  rateLimit,
  rateLimitProfiles,
  readJsonObject,
  secureJson,
} from "@/server/security";
import {
  generateTradeHandoffCode,
  getTradeHandoffSummary,
  revealTradeHandoffCode,
} from "@/server/trade-handoff";
import { getTradeForAction, listTradesForUser } from "@/server/trades";

export async function POST(
  request: Request,
  context: { params: Promise<{ tradeId: string }> },
) {
  try {
    await rateLimit(request, {
      key: "handoff-code:post",
      ...rateLimitProfiles.write,
    });
    const user = await requireAppUser(request);
    const { tradeId } = await context.params;
    const parsed = tradeHandoffCodeActionSchema.safeParse({
      ...(await readJsonObject(request)),
      tradeId,
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid handoff code action.");
    }

    const trade = await getTradeForAction(tradeId);
    let code: string | undefined;

    if (parsed.data.action === "generate") {
      const result = await generateTradeHandoffCode(trade, user);
      code = result.code;
    } else {
      await revealTradeHandoffCode(trade, user);
    }

    return secureJson({
      ...(await listTradesForUser(user)),
      handoffCode: await getTradeHandoffSummary(tradeId),
      code,
    });
  } catch (error) {
    return jsonError(error);
  }
}
