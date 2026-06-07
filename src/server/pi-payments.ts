import { calculateBuyerTotal, calculatePlatformFee } from "@/lib/fees";
import { piEscrowMemo, piscrowPaymentProduct } from "@/lib/pi-payment-product";
import { normalizePiUsername, type AppUser } from "@/server/auth";
import {
  assertBuyer,
  assertTradeStatus,
  getServiceClientOrThrow,
  type TradeRow,
} from "@/server/trades";
import type { PiPaymentDTO } from "@/types/pi";

type CompletedPaymentRow = {
  id: string;
  pi_payment_id: string;
};

function normalizeAmount(amount: number) {
  return Math.round((amount + Number.EPSILON) * 10000) / 10000;
}

function metadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
) {
  const value = metadata?.[key];

  return typeof value === "string" ? value : "";
}

function metadataNumber(
  metadata: Record<string, unknown> | undefined,
  key: string,
) {
  const value = metadata?.[key];

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return Number.NaN;
}

export function validatePiEscrowPayment({
  payment,
  trade,
  user,
  allowExpiredSelection = false,
}: {
  payment: PiPaymentDTO;
  trade: TradeRow;
  user: AppUser;
  allowExpiredSelection?: boolean;
}) {
  assertTradeStatus(trade, ["PendingFunding"]);
  assertBuyer(trade, user);

  if (!trade.selected_interest_id) {
    throw new Error("The seller must select your buyer response before funding.");
  }

  if (!trade.selection_expires_at) {
    throw new Error("The selected-buyer funding window is missing. Ask the seller to select you again.");
  }

  if (
    !allowExpiredSelection &&
    new Date(trade.selection_expires_at).getTime() <= Date.now()
  ) {
    throw new Error("Your 20-minute funding window expired. Ask the seller to select you again.");
  }

  if (payment.user_uid !== user.uid) {
    throw new Error("Pi payment user does not match the selected buyer.");
  }

  const metadata = payment.metadata ?? {};
  const sellerAmount = Number(trade.amount_test_pi);
  const platformFee = calculatePlatformFee(sellerAmount);
  const buyerTotal = calculateBuyerTotal(sellerAmount);
  const paymentAmount = normalizeAmount(Number(payment.amount));
  const expectedAmount = normalizeAmount(buyerTotal);

  if (paymentAmount !== expectedAmount) {
    throw new Error("Pi payment amount does not match the trade total.");
  }

  if (metadataString(metadata, "product") !== piscrowPaymentProduct) {
    throw new Error("Pi payment product does not match PiScrow escrow funding.");
  }

  if (payment.memo !== piEscrowMemo(trade.id)) {
    throw new Error("Pi payment memo does not match PiScrow escrow funding.");
  }

  if (metadataString(metadata, "tradeId") !== trade.id) {
    throw new Error("Pi payment metadata does not match this trade.");
  }

  if (normalizePiUsername(metadataString(metadata, "buyerUsername")) !== user.username) {
    throw new Error("Pi payment buyer does not match the selected buyer.");
  }

  if (
    normalizePiUsername(metadataString(metadata, "sellerUsername")) !==
    normalizePiUsername(trade.seller_pi_username)
  ) {
    throw new Error("Pi payment seller does not match this trade.");
  }

  const metadataFee = normalizeAmount(metadataNumber(metadata, "feeAmountTestPi"));
  const metadataTotal = normalizeAmount(metadataNumber(metadata, "buyerTotalTestPi"));

  if (
    metadataFee !== normalizeAmount(platformFee) ||
    metadataTotal !== expectedAmount
  ) {
    throw new Error("Pi payment fee metadata does not match this trade.");
  }

  return {
    sellerAmount,
    platformFee,
    buyerTotal,
  };
}

export async function assertNoCompletedPayment(tradeId: string) {
  const data = await getCompletedPaymentForTrade(tradeId);

  if (data) {
    throw new Error("This trade already has a completed payment.");
  }
}

export async function getCompletedPaymentForTrade(tradeId: string) {
  const supabase = getServiceClientOrThrow();
  const { data, error } = await supabase
    .from("payments")
    .select("id, pi_payment_id")
    .eq("trade_id", tradeId)
    .eq("status", "Completed")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as CompletedPaymentRow | null;
}
