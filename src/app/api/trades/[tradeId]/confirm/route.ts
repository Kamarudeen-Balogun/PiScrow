import { confirmReceiptSchema } from "@/lib/validation";
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
  assertBuyer,
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
    await rateLimit(request, { key: "confirm:post", ...rateLimitProfiles.upload });
    const user = await requireAppUser(request);
    const { tradeId } = await context.params;
    const contentType = request.headers.get("content-type") ?? "";
    const body =
      contentType.includes("multipart/form-data")
        ? await readFormDataBody(request)
        : await readJsonObject(request);
    const parsed = confirmReceiptSchema.safeParse({
      ...(body instanceof FormData ? sanitizeFormFields(body) : body),
      tradeId,
    });

    if (!parsed.success) {
      throw new Error("Invalid confirmation request.");
    }

    const trade = await getTradeForAction(tradeId);
    assertBuyer(trade, user);
    assertTradeStatus(trade, ["DeliverySubmitted"]);

    const proofImagePath =
      body instanceof FormData
        ? await uploadTradeProofImage({
            tradeId,
            userId: user.id,
            purpose: "buyer-receipt",
            file: body.get("buyerReceiptImage") as File | null,
          })
        : parsed.data.buyerReceiptImagePath || "";

    const supabase = getServiceClientOrThrow();
    const { error } = await supabase
      .from("trades")
      .update({
        status: "AwaitingRelease",
        buyer_receipt_note: parsed.data.buyerReceiptNote,
        buyer_receipt_proof_url:
          proofImagePath || parsed.data.buyerReceiptProofUrl || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tradeId);

    if (error) {
      throw new Error(error.message);
    }

    await insertTradeEvent(
      tradeId,
      user.id,
      "Receipt confirmed",
      `${parsed.data.buyerReceiptNote} Seller payout is waiting for admin release.`,
    );
    await addTradeChatSystemMessage(
      { ...trade, status: "AwaitingRelease" },
      proofImagePath
        ? `Buyer @${user.username} confirmed receipt and uploaded receipt proof. Admin can now release the seller payout.`
        : `Buyer @${user.username} confirmed receipt: ${parsed.data.buyerReceiptNote}. Admin can now release the seller payout.`,
    );

    await Promise.all([
      createNotification({
        userId: trade.seller_user_id,
        tradeId,
        type: "receipt_confirmed",
        title: "Buyer confirmed receipt",
        body: `@${user.username} confirmed receipt. Seller payout is now waiting for admin release.`,
      }),
      createNotification({
        userId: trade.buyer_user_id,
        tradeId,
        type: "release_pending",
        title: "Release pending",
        body: "Your receipt proof was saved. PiScrow admin must release the held Test Pi to the seller.",
      }),
    ]);

    return secureJson(await listTradesForUser(user));
  } catch (error) {
    return jsonError(error);
  }
}
