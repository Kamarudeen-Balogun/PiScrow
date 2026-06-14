import StellarSdk from "stellar-sdk";

import {
  cancelPiPayment,
  completePiPayment,
  getPiPayment,
  getPiWalletPrivateSeed,
  hasPiNetworkApiKey,
  hasPiWalletPrivateSeed,
  piPlatformCreatePayment,
  piTransactionLink,
} from "@/lib/pi-platform";
import { normalizePiUsername, type AppUser } from "@/server/auth";
import { getServiceClientOrThrow, type TradeRow } from "@/server/trades";
import type { PiPaymentDTO } from "@/types/pi";
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
  release_transaction_link: string | null;
  release_amount_test_pi: number | string | null;
};

type UserRecipientRow = {
  id: string;
  pi_uid: string;
  pi_username: string;
};

type ReleaseActor = Pick<AppUser, "username"> & {
  id?: string | null;
};

export function hasAutomaticPiReleaseConfig() {
  return hasPiNetworkApiKey() && hasPiWalletPrivateSeed();
}

function roundTestPi(amount: number) {
  return Math.round((amount + Number.EPSILON) * 10000) / 10000;
}

function releaseMemo(tradeId: string, releaseType: EscrowReleaseType) {
  return releaseType === "seller_release"
    ? "PiScrow seller payout"
    : "PiScrow buyer refund";
}

function isPiWalletScopeError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("missing_scope") && message.includes("wallet_address");
}

function piWalletScopeRecoveryMessage(releaseType: EscrowReleaseType) {
  const recipientRole = releaseType === "seller_release" ? "seller" : "buyer";
  return `PiScrow cannot complete this ${
    releaseType === "seller_release" ? "seller payout" : "buyer refund"
  } yet because the ${recipientRole}'s Pi account has not granted wallet access. Ask the ${recipientRole} to sign out of PiScrow, sign in again, approve the wallet permission, then retry this action.`;
}

function isPiPaymentAlreadyLinkedError(error: unknown) {
  return error instanceof Error && error.message.includes("payment_already_linked_with_a_tx");
}

function parsePiPlatformErrorBody(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  const jsonStart = error.message.indexOf("{");

  if (jsonStart === -1) {
    return null;
  }

  try {
    return JSON.parse(error.message.slice(jsonStart)) as {
      error?: string;
      error_message?: string;
      payment?: PiPaymentDTO;
    };
  } catch {
    return null;
  }
}

function assertDbOk(error: { message?: string } | null | undefined) {
  if (error) {
    throw new Error(error.message ?? "Could not update escrow release state.");
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getHorizonServer(network: string | undefined) {
  const normalizedNetwork = (network ?? "").trim();
  const isMainnet = normalizedNetwork === "Pi Network";
  const serverUrl = isMainnet
    ? "https://api.mainnet.minepi.com"
    : "https://api.testnet.minepi.com";
  const networkPassphrase = isMainnet
    ? "Pi Network"
    : "Pi Testnet";

  return {
    horizon: new StellarSdk.Server(serverUrl),
    networkPassphrase,
    serverUrl,
  };
}

function releasePaymentMatchesContext({
  buyerPaymentId,
  recipientPiUid,
  releasePayment,
  releaseType,
  tradeId,
}: {
  buyerPaymentId: string;
  recipientPiUid: string;
  releasePayment: PiPaymentDTO;
  releaseType: EscrowReleaseType;
  tradeId: string;
}) {
  const buyerPaymentMetadata = releasePayment.metadata?.buyerPaymentId;
  const releaseTypeMetadata = releasePayment.metadata?.releaseType;
  const tradeIdMetadata = releasePayment.metadata?.tradeId;

  return (
    releasePayment.user_uid === recipientPiUid &&
    tradeIdMetadata === tradeId &&
    buyerPaymentMetadata === buyerPaymentId &&
    releaseTypeMetadata === releaseType
  );
}

async function storedReleaseTxidMatchesPayment(
  payment: PiPaymentDTO,
  txid: string,
) {
  const paymentIdentifier = payment.identifier?.trim();
  const fromAddress = payment.from_address?.trim();
  const network = payment.network?.trim();
  const normalizedTxid = txid.trim();

  if (!paymentIdentifier || !fromAddress || !network || !normalizedTxid) {
    return false;
  }

  const { serverUrl } = getHorizonServer(network);
  const response = await fetch(
    `${serverUrl}/transactions/${encodeURIComponent(normalizedTxid)}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return false;
  }

  const transaction = (await response.json()) as {
    memo?: string;
    source_account?: string;
    successful?: boolean;
  };

  return (
    transaction.successful !== false &&
    transaction.memo === paymentIdentifier &&
    transaction.source_account === fromAddress
  );
}

async function recoverLinkedPiPayment(paymentId: string) {
  let recoveredPayment: PiPaymentDTO | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      await delay(1200 * attempt);
    }

    recoveredPayment = await getPiPayment(paymentId);
    const recoveredTxid = recoveredPayment.transaction?.txid?.trim() || "";

    if (recoveredPayment.status?.developer_completed && recoveredTxid) {
      return { payment: recoveredPayment, txid: recoveredTxid };
    }

    if (recoveredTxid) {
      return { payment: recoveredPayment, txid: recoveredTxid };
    }
  }

  return {
    payment: recoveredPayment,
    txid: recoveredPayment?.transaction?.txid?.trim() || "",
  };
}

async function waitForPiPaymentVerification(paymentId: string, fallbackTxid: string) {
  let observedPayment: PiPaymentDTO | null = null;
  let observedTxid = fallbackTxid.trim();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt > 0) {
      await delay(Math.min(1500 * attempt, 6000));
    }

    observedPayment = await getPiPayment(paymentId);
    observedTxid = observedPayment.transaction?.txid?.trim() || observedTxid;

    if (observedPayment.status?.developer_completed && observedTxid) {
      return {
        payment: observedPayment,
        txid: observedTxid,
        verified: true,
      };
    }

    if (
      observedTxid &&
      (observedPayment.status?.transaction_verified || observedPayment.transaction?.verified)
    ) {
      return {
        payment: observedPayment,
        txid: observedTxid,
        verified: true,
      };
    }
  }

  return {
    payment: observedPayment,
    txid: observedTxid,
    verified: Boolean(
      observedPayment?.status?.transaction_verified || observedPayment?.transaction?.verified,
    ),
  };
}

async function resetReleaseState(paymentRowId: string) {
  const supabase = getServiceClientOrThrow();
  const { error } = await supabase
    .from("payments")
    .update({
      release_pi_payment_id: null,
      release_txid: null,
      release_transaction_link: null,
      release_completed_at: null,
      release_failure: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentRowId);

  assertDbOk(error);
}

async function persistLinkedPiReleaseEvidence({
  payment,
  releasePayment,
}: {
  payment: PaymentReleaseRow;
  releasePayment: PiPaymentDTO;
}) {
  const releasePaymentId = releasePayment.identifier?.trim() || "";
  const txid = releasePayment.transaction?.txid?.trim() || "";
  const transactionLink =
    releasePayment.transaction?._link?.trim() ||
    (txid ? piTransactionLink(txid, releasePayment.network) : null);

  if (!releasePaymentId && !txid && !transactionLink) {
    return;
  }

  const supabase = getServiceClientOrThrow();
  const { error } = await supabase
    .from("payments")
    .update({
      release_pi_payment_id: releasePaymentId || payment.release_pi_payment_id || null,
      release_txid: txid || payment.release_txid || null,
      release_transaction_link:
        transactionLink || payment.release_transaction_link || null,
      release_status: payment.release_status === "Completed" ? "Completed" : "Submitted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id);

  assertDbOk(error);
}

function linkedTxCannotVerify(releasePayment: PiPaymentDTO) {
  return Boolean(
    releasePayment.transaction?.txid &&
      !releasePayment.transaction?.verified &&
      !releasePayment.status?.transaction_verified,
  );
}

function releasePaymentIsCancelled(releasePayment: PiPaymentDTO) {
  return Boolean(releasePayment.status?.cancelled);
}

function sellerReleaseNeedsManualReview({
  payment,
  releasePayment,
  releaseType,
}: {
  payment: PaymentReleaseRow;
  releasePayment: PiPaymentDTO;
  releaseType: EscrowReleaseType;
}) {
  if (releaseType !== "seller_release") {
    return false;
  }

  return Boolean(
    releasePayment.transaction?.txid?.trim() ||
      payment.release_txid?.trim(),
  );
}

async function cancelUnverifiablePiRelease(paymentRowId: string, releasePayment: PiPaymentDTO) {
  await cancelPiPayment(releasePayment.identifier);
  await resetReleaseState(paymentRowId);
}

async function submitAppWalletPayment(payment: PiPaymentDTO) {
  const walletSeed = getPiWalletPrivateSeed();
  const keypair = StellarSdk.Keypair.fromSecret(walletSeed);
  const paymentIdentifier = payment.identifier?.trim();
  const fromAddress = payment.from_address?.trim();
  const toAddress = payment.to_address?.trim();
  const network = payment.network?.trim();

  if (!paymentIdentifier || !fromAddress || !toAddress || !network) {
    throw new Error(
      "Pi release payment is missing its identifier, from_address, to_address, or network.",
    );
  }

  if (fromAddress !== keypair.publicKey()) {
    throw new Error(
      "PI_WALLET_PRIVATE_SEED does not match the app wallet expected by this Pi payment.",
    );
  }

  const { horizon, networkPassphrase } = getHorizonServer(network);
  const account = await horizon.loadAccount(keypair.publicKey());
  const baseFee = await horizon.fetchBaseFee();
  const timebounds = await horizon.fetchTimebounds(180);

  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: baseFee.toString(),
    networkPassphrase,
    timebounds,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination: toAddress,
        asset: StellarSdk.Asset.native(),
        amount: Number(payment.amount).toString(),
      }),
    )
    .addMemo(StellarSdk.Memo.text(paymentIdentifier))
    .build();

  transaction.sign(keypair);

  const submitted = await horizon.submitTransaction(transaction);

  return submitted.hash;
}

async function getCompletedPaymentRow(tradeId: string) {
  const supabase = getServiceClientOrThrow();
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, pi_payment_id, seller_amount_test_pi, buyer_total_test_pi, status, escrow_status, release_type, release_status, release_pi_payment_id, release_txid, release_transaction_link, release_amount_test_pi",
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

async function persistCompletedEscrowRelease({
  payment,
  paymentId,
  releasePayment,
  releaseType,
  txid,
}: {
  payment: PaymentReleaseRow;
  paymentId: string;
  releasePayment: PiPaymentDTO;
  releaseType: EscrowReleaseType;
  txid: string;
}) {
  const supabase = getServiceClientOrThrow();
  const completedAt = new Date().toISOString();
  const releaseExplorerLink = piTransactionLink(txid, releasePayment.network);
  const { error: completedError } = await supabase
    .from("payments")
    .update({
      escrow_status:
        releaseType === "seller_release" ? "released_to_seller" : "refunded_to_buyer",
      release_status: "Completed",
      release_pi_payment_id: paymentId,
      release_txid: txid,
      release_transaction_link: releaseExplorerLink,
      release_completed_at: completedAt,
      release_failure: null,
      raw_provider_status: {
        buyerPaymentStatus: payment,
        releasePaymentStatus: releasePayment,
      },
      updated_at: completedAt,
    })
    .eq("id", payment.id);

  assertDbOk(completedError);

  return {
    completedAt,
    releaseExplorerLink,
  };
}

export async function executeEscrowRelease({
  actor,
  notes,
  releaseType,
  trade,
}: {
  actor: ReleaseActor;
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

  if (
    payment.release_status &&
    !["NotStarted", "Failed", "Cancelled", "Created", "Submitted"].includes(
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
      release_requested_by_user_id: actor.id ?? null,
      release_requested_at: now,
      release_failure: null,
      updated_at: now,
    })
    .eq("id", payment.id);

  assertDbOk(createdError);

  let paymentId = payment.release_pi_payment_id;
  let releasePayment: PiPaymentDTO | null = null;
  const createPaymentArgs = {
    amount: releaseAmount,
    memo: releaseMemo(trade.id, releaseType),
    metadata: {
      product: "PiScrow escrow release",
      tradeId: trade.id,
      buyerPaymentId: payment.pi_payment_id,
      releaseType,
      adminUsername: normalizePiUsername(actor.username),
      notes,
    },
    uid: recipient.pi_uid,
  };

  while (true) {
    try {
      if (paymentId) {
        releasePayment = await getPiPayment(paymentId);

      if (
        !releasePaymentMatchesContext({
          buyerPaymentId: payment.pi_payment_id,
          recipientPiUid: recipient.pi_uid,
          releasePayment,
          releaseType,
          tradeId: trade.id,
        })
      ) {
        await resetReleaseState(payment.id);
        paymentId = null;
        releasePayment = null;
      } else if (releasePaymentIsCancelled(releasePayment)) {
        await resetReleaseState(payment.id);
        paymentId = null;
        releasePayment = null;
      } else if (linkedTxCannotVerify(releasePayment)) {
        if (sellerReleaseNeedsManualReview({ payment, releasePayment, releaseType })) {
          await persistLinkedPiReleaseEvidence({
            payment,
            releasePayment,
          });
          throw new Error(
            "Seller payout already has a linked blockchain transaction for this trade. PiScrow stopped automatic retry to prevent double payment. Review this trade manually before sending another payout.",
          );
        }

        await cancelUnverifiablePiRelease(payment.id, releasePayment);
        paymentId = null;
        releasePayment = null;
      }
      }

      paymentId =
        paymentId ??
        (await piPlatformCreatePayment(createPaymentArgs));

      break;
    } catch (error) {
      if (isPiWalletScopeError(error)) {
        throw new Error(piWalletScopeRecoveryMessage(releaseType));
      }

      const piError = parsePiPlatformErrorBody(error);

      if (piError?.error === "ongoing_payment_found" && piError.payment) {
        const ongoingPayment = piError.payment;

        if (
          releasePaymentMatchesContext({
            buyerPaymentId: payment.pi_payment_id,
            recipientPiUid: recipient.pi_uid,
            releasePayment: ongoingPayment,
            releaseType,
            tradeId: trade.id,
          }) &&
          linkedTxCannotVerify(ongoingPayment)
        ) {
          if (sellerReleaseNeedsManualReview({ payment, releasePayment: ongoingPayment, releaseType })) {
            await persistLinkedPiReleaseEvidence({
              payment,
              releasePayment: ongoingPayment,
            });
            throw new Error(
              "Seller payout already has a linked blockchain transaction for this trade. PiScrow stopped automatic retry to prevent double payment. Review this trade manually before sending another payout.",
            );
          }

          await cancelUnverifiablePiRelease(payment.id, ongoingPayment);
          paymentId = null;
          releasePayment = null;
          continue;
        }
      }

      throw error;
    }
  }

  const { error: paymentIdError } = await supabase
    .from("payments")
    .update({
      release_pi_payment_id: paymentId,
      release_status: "Created",
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id);

  assertDbOk(paymentIdError);

  if (!releasePayment) {
    try {
      releasePayment = await getPiPayment(paymentId);
    } catch (error) {
      if (isPiWalletScopeError(error)) {
        throw new Error(piWalletScopeRecoveryMessage(releaseType));
      }

      throw error;
    }
  }
  let txid =
    releasePayment.transaction?.txid?.trim() || "";

  if (releasePaymentIsCancelled(releasePayment)) {
    await resetReleaseState(payment.id);
    return executeEscrowRelease({
      actor,
      notes,
      releaseType,
      trade,
    });
  }

  if (!txid && payment.release_txid) {
    const storedTxid = payment.release_txid.trim();

    if (await storedReleaseTxidMatchesPayment(releasePayment, storedTxid)) {
      txid = storedTxid;
    }
  }

  if (releasePayment.status?.developer_completed) {
    if (!txid) {
      throw new Error("Pi release payment is completed but no transaction hash was returned.");
    }

    const { releaseExplorerLink } = await persistCompletedEscrowRelease({
      payment,
      paymentId,
      releasePayment,
      releaseType,
      txid,
    });

    return {
      mode: "completed" as const,
      payment,
      releasePayment,
      releasePiPaymentId: paymentId,
      releaseTxid: txid,
      releaseTransactionLink: releaseExplorerLink,
    };
  }

  if (!txid) {
    txid = await submitAppWalletPayment(releasePayment);
  }
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

  const verification = await waitForPiPaymentVerification(paymentId, txid);

  if (verification.payment?.status?.developer_completed && verification.txid) {
    const { releaseExplorerLink } = await persistCompletedEscrowRelease({
      payment,
      paymentId,
      releasePayment: verification.payment,
      releaseType,
      txid: verification.txid,
    });

    return {
      mode: "completed" as const,
      payment,
      releasePayment: verification.payment,
      releasePiPaymentId: paymentId,
      releaseTxid: verification.txid,
      releaseTransactionLink: releaseExplorerLink,
    };
  }

  if (verification.verified && verification.txid) {
    txid = verification.txid;
  }

  let completed: PiPaymentDTO;

  try {
    completed = await completePiPayment(paymentId, txid);
  } catch (error) {
    const piError = parsePiPlatformErrorBody(error);

    if (piError?.error === "cancelled_payment") {
      await resetReleaseState(payment.id);
      return executeEscrowRelease({
        actor,
        notes,
        releaseType,
        trade,
      });
    }

    if (!isPiPaymentAlreadyLinkedError(error)) {
      throw error;
    }

    const { payment: refreshedPayment, txid: refreshedTxid } =
      await recoverLinkedPiPayment(paymentId);

    if (refreshedPayment?.status?.developer_completed && refreshedTxid) {
      completed = refreshedPayment;
      txid = refreshedTxid;
    } else if (refreshedTxid) {
      txid = refreshedTxid;
      completed = await completePiPayment(paymentId, txid);
    } else {
      throw error;
    }
  }

  const finalTxid = completed.transaction?.txid?.trim() || txid;
  const { releaseExplorerLink } = await persistCompletedEscrowRelease({
    payment,
    paymentId,
    releasePayment: completed,
    releaseType,
    txid: finalTxid,
  });

  return {
    mode: "completed" as const,
    payment,
    releasePayment: completed,
    releasePiPaymentId: paymentId,
    releaseTxid: finalTxid,
    releaseTransactionLink: releaseExplorerLink,
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
