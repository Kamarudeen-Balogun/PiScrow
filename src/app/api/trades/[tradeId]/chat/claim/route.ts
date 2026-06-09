import { jsonError, requireAppUser } from "@/server/auth";
import {
  rateLimit,
  rateLimitProfiles,
  secureJson,
} from "@/server/security";
import {
  claimTradeChatRoom,
  listTradeChatMessages,
} from "@/server/trade-chat";
import { getTradeForAction } from "@/server/trades";

export async function POST(
  request: Request,
  context: { params: Promise<{ tradeId: string }> },
) {
  try {
    await rateLimit(request, { key: "trade-chat-claim:post", ...rateLimitProfiles.admin });
    const user = await requireAppUser(request);
    const { tradeId } = await context.params;
    const trade = await getTradeForAction(tradeId);
    const room = await claimTradeChatRoom(trade, user);

    return secureJson({
      room: {
        id: room.id,
        tradeId: room.trade_id,
        status: room.status,
        claimedAdminUserId: room.claimed_admin_user_id ?? undefined,
        claimedAdminPiUsername: room.claimed_admin_pi_username ?? undefined,
        claimedAt: room.claimed_at ?? undefined,
        createdAt: room.created_at,
        updatedAt: room.updated_at,
      },
      messages: await listTradeChatMessages(room.id),
    });
  } catch (error) {
    return jsonError(error);
  }
}
