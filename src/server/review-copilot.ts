import { createNotification } from "@/server/notifications";
import {
  getServiceClientOrThrow,
  insertTradeEvent,
  listTradesForUser,
  type TradeRow,
} from "@/server/trades";
import type { AppUser } from "@/server/auth";
import type {
  ReviewRecommendationAction,
  TradeReviewRecommendation,
} from "@/types/review";

type PaymentRow = {
  id: string;
  status: string;
  amount_test_pi: number | string;
  created_at: string;
};

type DisputeRow = {
  reason: string;
  evidence_note: string | null;
  created_at: string;
};

type RecommendationInput = {
  trade: TradeRow;
  payments: PaymentRow[];
  disputes: DisputeRow[];
};

type RecommendationDraft = {
  recommendedAction: ReviewRecommendationAction;
  confidence: number;
  summary: string;
  missingEvidence: string[];
  riskFlags: string[];
};

type ReviewRecommendationRow = {
  id: string;
  trade_id: string;
  reviewed_by_pi_username: string;
  recommended_action: ReviewRecommendationAction;
  confidence: number;
  summary: string;
  missing_evidence: string[] | null;
  risk_flags: string[] | null;
  created_at: string;
};

export function mapReviewRecommendation(
  row: ReviewRecommendationRow,
): TradeReviewRecommendation {
  return {
    id: row.id,
    tradeId: row.trade_id,
    reviewedByPiUsername: row.reviewed_by_pi_username,
    recommendedAction: row.recommended_action,
    confidence: row.confidence,
    summary: row.summary,
    missingEvidence: row.missing_evidence ?? [],
    riskFlags: row.risk_flags ?? [],
    createdAt: row.created_at,
  };
}

export async function listLatestReviewRecommendations(tradeIds: string[]) {
  const uniqueTradeIds = [...new Set(tradeIds.filter(Boolean))];

  if (uniqueTradeIds.length === 0) {
    return [];
  }

  const supabase = getServiceClientOrThrow();
  const { data, error } = await supabase
    .from("trade_review_recommendations")
    .select(
      "id, trade_id, reviewed_by_pi_username, recommended_action, confidence, summary, missing_evidence, risk_flags, created_at",
    )
    .in("trade_id", uniqueTradeIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const seen = new Set<string>();
  const recommendations: TradeReviewRecommendation[] = [];

  for (const row of (data ?? []) as ReviewRecommendationRow[]) {
    if (seen.has(row.trade_id)) {
      continue;
    }

    seen.add(row.trade_id);
    recommendations.push(mapReviewRecommendation(row));
  }

  return recommendations;
}

export function buildReviewRecommendation({
  trade,
  payments,
  disputes,
}: RecommendationInput): RecommendationDraft {
  const missingEvidence: string[] = [];
  const riskFlags: string[] = [];
  let confidence = 52;

  const hasCompletedPayment = payments.some((payment) => payment.status === "Completed");
  const sellerProofText = trade.delivery_proof_note?.trim() ?? "";
  const buyerReceiptText = trade.buyer_receipt_note?.trim() ?? "";
  const hasSellerProof = sellerProofText.length >= 8 || Boolean(trade.delivery_proof_url);
  const hasBuyerReceipt =
    buyerReceiptText.length >= 8 || Boolean(trade.buyer_receipt_proof_url);
  const hasOpenDispute = trade.status === "Disputed" || disputes.length > 0;
  const awaitingRelease = trade.status === "AwaitingRelease";

  if (!hasCompletedPayment) {
    missingEvidence.push("verified completed Test Pi payment");
    riskFlags.push("payment_not_completed");
    confidence -= 22;
  } else {
    confidence += 12;
  }

  if (!hasSellerProof) {
    missingEvidence.push("seller delivery proof");
    riskFlags.push("seller_proof_missing");
    confidence -= 14;
  } else {
    confidence += 10;
  }

  if (!hasBuyerReceipt) {
    missingEvidence.push("buyer receipt confirmation proof");
    confidence -= 10;
  } else {
    confidence += 18;
  }

  if (hasOpenDispute) {
    riskFlags.push("active_dispute_review");
    confidence -= 8;
  }

  if (awaitingRelease) {
    riskFlags.push("release_ready_review");
    confidence += 6;
  }

  if (Number(trade.amount_test_pi) > 250) {
    riskFlags.push("high_value_testnet_trade");
    confidence -= 8;
  }

  const disputeText = disputes
    .map((dispute) => `${dispute.reason} ${dispute.evidence_note ?? ""}`)
    .join(" ")
    .toLowerCase();

  if (/missing|not received|wrong|fake|serial|broken|damage|damaged|unclear/.test(disputeText)) {
    riskFlags.push("party_claim_conflict");
    confidence -= 12;
  }

  let recommendedAction: ReviewRecommendationAction = "admin_review";

  if (missingEvidence.length > 0 || riskFlags.includes("party_claim_conflict")) {
    recommendedAction = "request_more_info";
  }

  if (
    hasCompletedPayment &&
    hasSellerProof &&
    hasBuyerReceipt &&
    !riskFlags.includes("party_claim_conflict") &&
    Number(trade.amount_test_pi) <= 250
  ) {
    recommendedAction = "release";
    confidence += 10;
  }

  if (
    hasCompletedPayment &&
    !hasSellerProof &&
    riskFlags.includes("party_claim_conflict") &&
    trade.status === "Disputed"
  ) {
    recommendedAction = "refund";
    confidence += 4;
  }

  confidence = Math.max(15, Math.min(96, Math.round(confidence)));

  const summary = recommendationSummary({
    recommendedAction,
    hasCompletedPayment,
    hasSellerProof,
    hasBuyerReceipt,
    hasOpenDispute,
    missingEvidence,
    riskFlags,
  });

  return {
    recommendedAction,
    confidence,
    summary,
    missingEvidence,
    riskFlags,
  };
}

export async function runReviewCopilot(tradeId: string, admin: AppUser) {
  const supabase = getServiceClientOrThrow();
  const { data: trade, error: tradeError } = await supabase
    .from("trades")
    .select("*")
    .eq("id", tradeId)
    .single();

  if (tradeError || !trade) {
    throw new Error(tradeError?.message ?? "Trade not found.");
  }

  const tradeRow = trade as TradeRow;

  if (!["Disputed", "AwaitingRelease"].includes(tradeRow.status)) {
    throw new Error("Review copilot only runs on disputed or release-ready trades.");
  }

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("id, status, amount_test_pi, created_at")
    .eq("trade_id", tradeId)
    .order("created_at", { ascending: false });

  if (paymentsError) {
    throw new Error(paymentsError.message);
  }

  const { data: disputes, error: disputesError } = await supabase
    .from("disputes")
    .select("reason, evidence_note, created_at")
    .eq("trade_id", tradeId)
    .order("created_at", { ascending: false });

  if (disputesError) {
    throw new Error(disputesError.message);
  }

  const recommendation = buildReviewRecommendation({
    trade: tradeRow,
    payments: (payments ?? []) as PaymentRow[],
    disputes: (disputes ?? []) as DisputeRow[],
  });

  const { data: created, error: insertError } = await supabase
    .from("trade_review_recommendations")
    .insert({
      trade_id: tradeId,
      reviewed_by_pi_username: admin.username,
      recommended_action: recommendation.recommendedAction,
      confidence: recommendation.confidence,
      summary: recommendation.summary,
      missing_evidence: recommendation.missingEvidence,
      risk_flags: recommendation.riskFlags,
      metadata: {
        engine: "deterministic_phase_19a",
        recommendOnly: true,
      },
    })
    .select(
      "id, trade_id, reviewed_by_pi_username, recommended_action, confidence, summary, missing_evidence, risk_flags, created_at",
    )
    .single();

  if (insertError || !created) {
    throw new Error(insertError?.message ?? "Could not save review recommendation.");
  }

  await insertTradeEvent(
    tradeId,
    admin.id,
    "Review copilot recommendation",
    `${recommendationLabel(recommendation.recommendedAction)} with ${recommendation.confidence}% confidence. ${recommendation.summary}`,
    {
      recommendedAction: recommendation.recommendedAction,
      confidence: recommendation.confidence,
      missingEvidence: recommendation.missingEvidence,
      riskFlags: recommendation.riskFlags,
      recommendOnly: true,
    },
  );

  if (
    recommendation.recommendedAction === "admin_review" ||
    recommendation.recommendedAction === "request_more_info" ||
    recommendation.confidence < 72
  ) {
    await createNotification({
      userId: admin.id,
      tradeId,
      type: "review_copilot_escalated",
      title: "Review copilot needs admin judgment",
      body: recommendation.summary,
      metadata: {
        confidence: recommendation.confidence,
        recommendedAction: recommendation.recommendedAction,
      },
    });
  }

  return {
    recommendation: mapReviewRecommendation(created as ReviewRecommendationRow),
    tradePayload: await listTradesForUser(admin),
  };
}

function recommendationSummary({
  recommendedAction,
  hasCompletedPayment,
  hasSellerProof,
  hasBuyerReceipt,
  hasOpenDispute,
  missingEvidence,
  riskFlags,
}: {
  recommendedAction: ReviewRecommendationAction;
  hasCompletedPayment: boolean;
  hasSellerProof: boolean;
  hasBuyerReceipt: boolean;
  hasOpenDispute: boolean;
  missingEvidence: string[];
  riskFlags: string[];
}) {
  if (recommendedAction === "release") {
    return "Payment, seller proof, and buyer receipt are all present. Admin can consider the seller release path after final review.";
  }

  if (recommendedAction === "refund") {
    return "Payment exists, but the dispute evidence points toward unresolved delivery proof risk. Admin can consider the buyer refund path after final review.";
  }

  if (recommendedAction === "request_more_info") {
    return `More evidence is needed before release or refund. Missing: ${
      missingEvidence.length ? missingEvidence.join(", ") : "clear party agreement"
    }. Risk flags: ${riskFlags.length ? riskFlags.join(", ") : "none"}.`;
  }

  return `Admin review remains required. Payment verified: ${hasCompletedPayment ? "yes" : "no"}. Seller proof: ${
    hasSellerProof ? "yes" : "no"
  }. Buyer receipt: ${hasBuyerReceipt ? "yes" : "no"}. Dispute active: ${
    hasOpenDispute ? "yes" : "no"
  }.`;
}

export function recommendationLabel(action: ReviewRecommendationAction) {
  const labels: Record<ReviewRecommendationAction, string> = {
    release: "Recommend seller release",
    refund: "Recommend buyer refund",
    request_more_info: "Request more information",
    admin_review: "Keep admin review",
  };

  return labels[action];
}
