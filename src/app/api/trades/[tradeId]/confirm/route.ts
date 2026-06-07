import { NextResponse } from "next/server";

import { confirmReceiptSchema } from "@/lib/validation";
import { jsonError, requireAppUser } from "@/server/auth";
import { createNotification } from "@/server/notifications";
import { uploadTradeProofImage } from "@/server/proof-storage";
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
    const user = await requireAppUser(request);
    const { tradeId } = await context.params;
    const contentType = request.headers.get("content-type") ?? "";
    const body =
      contentType.includes("multipart/form-data")
        ? await request.formData()
        : await request.json().catch(() => ({}));
    const parsed = confirmReceiptSchema.safeParse({
      ...(body instanceof FormData ? Object.fromEntries(body) : body),
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
        status: "Completed",
        buyer_receipt_note: parsed.data.buyerReceiptNote,
        buyer_receipt_proof_url:
          proofImagePath || parsed.data.buyerReceiptProofUrl || null,
        completed_at: new Date().toISOString(),
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
      parsed.data.buyerReceiptNote,
    );

    await createNotification({
      userId: trade.seller_user_id,
      tradeId,
      type: "receipt_confirmed",
      title: "Buyer confirmed receipt",
      body: `@${user.username} confirmed receipt. The trade is now complete.`,
    });

    return NextResponse.json(await listTradesForUser(user));
  } catch (error) {
    return jsonError(error);
  }
}
