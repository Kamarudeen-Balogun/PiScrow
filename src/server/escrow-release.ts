import PiNetwork from "pi-backend";

import {
  hasPiNetworkApiKey,
  hasPiWalletPrivateSeed,
  piTransactionLink,
} from "@/lib/pi-platform";
import { normalizePiUsername, type AppUser } from "@/server/auth";
import { getServiceClientOrThrow, type TradeRow } from "@/server/trades";
import type { EscrowReleaseType } from "@/types/trade";

type PaymentReleaseRow = {
  id: string;
  pi_payment_id: string;
  seller_amount_test_pi: number | string | null;
  buyer_total_test_pi: number | string | null;
  status: string;
  escrow_status: string | null;
  release_type: EscrowReleaseType | null;
  release_status: string | null;
  release_pi_payment_id: string | null;
  release_txid: string | null;
  release_amount_test_pi: number | string | null;
};

type UserRecipientRow = {
  id: string;
  pi_uid: string;
  pi_username: string;
};

export function hasAutomaticPiReleaseConfig() {
  return hasPiNetworkApiKey() && hasPiWalletPrivateSeed();
}

function getPiNetworkServer() {
  const apiKey = process.env.PI_NETWORK_API_KEY;
  const walletSeed = process.env.PI_WALLET_PRIVATE_SEED;

  if (!apiKey) {
    throw new Error("PI_NETWORK_API_KEY is not configured.");
  }

  if (!walletSeed) {
    throw new Error(
      "PI_WALLET_PRIVATE_SEED is not configured. Add the app wallet private seed on the server before automatic Test Pi release/refund.",
    );
  }

  return new PiNetwork(apiKey, walletSeed, {
    baseUrl: process.env.PI_PLATFORM_API_BASE ?? "https://api.minepi.com",
  });
}

function roundTestPi(amount: number) {
  return Math.round((amount + Number.EPSILON) * 10000) / 10000;
}

function releaseMemo(tradeId: string, releaseType: EscrowReleaseType) {
  return releaseType === "seller_release"
    ? `PiScrow seller release for trade ${tradeId}`
    : `PiScrow buyer refund for trade ${tradeId}`;
}

function assertDbOk(error: { message?: string } | null | undefined) {
  if (error) {
    throw new Error(error.message ?? "Could not update escrow release state.");
  }
}

async function getCompletedPaymentRow(tradeId: string) {
  const supabase = getServiceClientOrThrow();
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, pi_payment_id, seller_amount_test_pi, buyer_total_test_pi, status, escrow_status, release_type, release_status, release_pi_payment_id, release_txid, release_amount_test_pi",
    )
    .eq("trade_id", tradeId)
    .eq("status", "Completed")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("No completed buyer escrow payment exists for this trade.");
  }

  return data as PaymentReleaseRow;
}

async function getRecipientForRelease(
  trade: TradeRow,
  releaseType: EscrowReleaseType,
) {
  const recipientUserId =
    releaseType === "seller_release" ? trade.seller_user_id : trade.buyer_user_id;

  if (!recipientUserId) {
    throw new Error("Release recipient is missing for this trade.");
  }

  const supabase = getServiceClientOrThrow();
  const { data, error } = await supabase
    .from("users")
    .select("id, pi_uid, pi_username")
    .eq("id", recipientUserId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Release recipient user was not found.");
  }

  return data as UserRecipientRow;
}

export async function executeEscrowRelease({
  admin,
  notes,
  releaseType,
  trade,
}: {
  admin: AppUser;
  notes: string;
  releaseType: EscrowReleaseType;
  trade: TradeRow;
}) {
  const supabase = getServiceClientOrThrow();
  const payment = await getCompletedPaymentRow(trade.id);

  if (payment.release_status === "Completed") {
    return {
      mode: "already_completed" as const,
      payment,
      releaseTxid: payment.release_txid ?? "",
    };
  }

  if (payment.release_status === "Submitted" && payment.release_txid) {
    throw new Error(
      "This release already has a submitted transaction. Refresh before trying again.",
    );
  }

  if (
    payment.release_status &&
    !["NotStarted", "Failed", "Cancelled", "Created"].includes(
      payment.release_status,
    )
  ) {
    throw new Error("This escrow release is already in progress.");
  }

  const recipient = await getRecipientForRelease(trade, releaseType);
  const amount =
    releaseType === "seller_release"
      ? Number(payment.seller_amount_test_pi ?? trade.amount_test_pi)
      : Number(payment.buyer_total_test_pi ?? 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Escrow release amount is invalid.");
  }

  const releaseAmount = roundTestPi(amount);
  const now = new Date().toISOString();

  const { error: createdError } = await supabase
    .from("payments")
    .update({
      escrow_status:
        releaseType === "seller_release" ? "release_pending" : "refund_pending",
      release_type: releaseType,
      release_status: "Created",
      release_amount_test_pi: releaseAmount,
      release_target_user_id: recipient.id,
      release_target_pi_username: normalizePiUsername(recipient.pi_username),
      release_requested_by_user_id: admin.id,
      release_requested_at: now,
      release_failure: null,
      updated_at: now,
    })
    .eq("id", payment.id);

  assertDbOk(createdError);

  const pi = getPiNetworkServer();
  const paymentId =
    payment.release_pi_payment_id ??
    (await pi.createPayment({
      amount: releaseAmount,
      memo: releaseMemo(trade.id, releaseType),
      metadata: {
        product: "PiScrow escrow release",
        tradeId: trade.id,
        buyerPaymentId: payment.pi_payment_id,
        releaseType,
        adminUsername: normalizePiUsername(admin.username),
        notes,
      },
      uid: recipient.pi_uid,
    }));

  const { error: paymentIdError } = await supabase
    .from("payments")
    .update({
      release_pi_payment_id: paymentId,
      release_status: "Created",
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id);

  assertDbOk(paymentIdError);

  const txid = payment.release_txid ?? (await pi.submitPayment(paymentId));
  const transactionLink = piTransactionLink(txid);

  const { error: submittedError } = await supabase
    .from("payments")
    .update({
      release_txid: txid,
      release_transaction_link: transactionLink,
      release_status: "Submitted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id);

  assertDbOk(submittedError);

  const completed = await pi.completePayment(paymentId, txid);
  const completedAt = new Date().toISOString();

  const { error: completedError } = await supabase
    .from("payments")
    .update({
      escrow_status:
        releaseType === "seller_release" ? "released_to_seller" : "refunded_to_buyer",
      release_status: "Completed",
      release_transaction_link:
        completed.transaction?._link ?? transactionLink,
      release_completed_at: completedAt,
      raw_provider_status: {
        buyerPaymentStatus: payment,
        releasePaymentStatus: completed,
      },
      updated_at: completedAt,
    })
    .eq("id", payment.id);

  assertDbOk(completedError);

  return {
    mode: "completed" as const,
    payment,
    releasePayment: completed,
    releasePiPaymentId: paymentId,
    releaseTxid: txid,
    releaseTransactionLink: completed.transaction?._link ?? transactionLink,
  };
}

export async function markEscrowReleaseFailed({
  failure,
  releaseType,
  tradeId,
}: {
  failure: string;
  releaseType: EscrowReleaseType;
  tradeId: string;
}) {
  const supabase = getServiceClientOrThrow();
  const payment = await getCompletedPaymentRow(tradeId);
  const { error } = await supabase
    .from("payments")
    .update({
      escrow_status:
        releaseType === "seller_release" ? "release_failed" : "refund_failed",
      release_status: "Failed",
      release_failure: failure.slice(0, 600),
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id);

  assertDbOk(error);
}
