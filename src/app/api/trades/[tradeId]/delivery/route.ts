import { deliveryProofSchema } from "@/lib/validation";
import { DELIVERY_WINDOW_DAYS } from "@/lib/trade-deadlines";
import { jsonError, requireAppUser } from "@/server/auth";
import { createNotification } from "@/server/notifications";
import { uploadTradeProofImage } from "@/server/proof-storage";
import {
  rateLimit,
  rateLimitProfiles,
  readFormDataBody,
  readJsonObject,
  sanitizeFormFields,
  secureJson,
} from "@/server/security";
import { addTradeChatSystemMessage } from "@/server/trade-chat";
import {
  assertSeller,
  assertTradeStatus,
  getServiceClientOrThrow,
  getTradeForAction,
  insertTradeEvent,
  listTradesForUser,
} from "@/server/trades";

export async function POST(
  request: Request,
  context: { params: Promise<{ tradeId: string }> },
) {
  try {
    await rateLimit(request, { key: "delivery:post", ...rateLimitProfiles.upload });
    const user = await requireAppUser(request);
    const { tradeId } = await context.params;
    const contentType = request.headers.get("content-type") ?? "";
    const body =
      contentType.includes("multipart/form-data")
        ? await readFormDataBody(request)
        : await readJsonObject(request);
    const parsed = deliveryProofSchema.safeParse({
      ...(body instanceof FormData ? sanitizeFormFields(body) : body),
      tradeId,
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid delivery proof.");
    }

    const trade = await getTradeForAction(tradeId);
    assertSeller(trade, user);
    assertTradeStatus(trade, ["Funded"]);

    if (
      trade.delivery_due_at &&
      new Date(trade.delivery_due_at).getTime() <= Date.now()
    ) {
      throw new Error(
        `This trade passed the ${DELIVERY_WINDOW_DAYS}-day delivery window. PiScrow will refund the buyer automatically.`,
      );
    }

    const proofImagePath =
      body instanceof FormData
        ? await uploadTradeProofImage({
            tradeId,
            userId: user.id,
            purpose: "seller-delivery",
            file: body.get("deliveryProofImage") as File | null,
          })
        : parsed.data.deliveryProofImagePath || "";

    const supabase = getServiceClientOrThrow();
    const { error } = await supabase
      .from("trades")
      .update({
        status: "DeliverySubmitted",
        delivery_proof_note: parsed.data.deliveryProofNote,
        delivery_proof_url: proofImagePath || parsed.data.deliveryProofUrl || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tradeId);

    if (error) {
      throw new Error(error.message);
    }

    await insertTradeEvent(
      tradeId,
      user.id,
      "Delivery submitted",
      parsed.data.deliveryProofNote,
    );
    await addTradeChatSystemMessage(
      { ...trade, status: "DeliverySubmitted" },
      proofImagePath
        ? `Seller @${user.username} submitted delivery proof and uploaded a package image.`
        : `Seller @${user.username} submitted delivery proof: ${parsed.data.deliveryProofNote}`,
    );

    await createNotification({
      userId: trade.buyer_user_id,
      tradeId,
      type: "delivery_submitted",
      title: "Package proof submitted",
      body: `@${user.username} submitted seller delivery proof for your review.`,
    });

    return secureJson(await listTradesForUser(user));
  } catch (error) {
    return jsonError(error);
  }
}
