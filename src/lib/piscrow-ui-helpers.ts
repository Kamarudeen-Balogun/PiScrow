import type { UserReputation } from "@/types/profile";
import type { TradeReviewRecommendation } from "@/types/review";
import type { Trade, TradeEvent, TradeStatus } from "@/types/trade";
import { canRequestVerifiedBadge } from "@/lib/reputation";

export function createEvent(
  tradeId: string,
  actor: string,
  eventType: string,
  notes: string,
): TradeEvent {
  return {
    id: `event-${crypto.randomUUID()}`,
    tradeId,
    actor,
    eventType,
    notes,
    createdAt: new Date().toISOString(),
  };
}

export function normalizeUsername(username: string) {
  return username.trim().replace(/^@+/, "").toLowerCase();
}

export function isTerminal(status: TradeStatus) {
  return status === "Completed" || status === "Cancelled";
}

export function selectionExpired(trade: Trade) {
  return Boolean(
    trade.selectionExpiresAt &&
      new Date(trade.selectionExpiresAt).getTime() <= Date.now(),
  );
}

export function fundingWindowLabel(trade: Trade) {
  if (!trade.selectionExpiresAt) {
    return "1-hour funding window pending";
  }

  const remainingMs = new Date(trade.selectionExpiresAt).getTime() - Date.now();

  if (remainingMs <= 0) {
    return "Selection expired";
  }

  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  return `${minutes} min left to fund`;
}

export function interestErrorMessage(message?: string) {
  if (!message) {
    return "Could not submit interest.";
  }

  if (
    message.includes("expected string") ||
    message.includes("received undefined")
  ) {
    return "Could not read the optional buyer note. Try submitting again.";
  }

  return message;
}

export function trustScoreFromProfile(profile: Pick<
  UserReputation,
  | "successfulTrades"
  | "disputedTrades"
  | "cancelledTrades"
  | "buyCount"
  | "sellCount"
  | "verifiedBadge"
>) {
  const completedBonus = Math.min(profile.successfulTrades * 4, 16);
  const volumeBonus = Math.min((profile.buyCount + profile.sellCount) * 1.5, 9);
  const disputePenalty = Math.min(profile.disputedTrades * 9, 27);
  const cancelledPenalty = Math.min(profile.cancelledTrades * 4, 16);
  const verifiedBonus = profile.verifiedBadge ? 5 : 0;

  return Math.max(
    40,
    Math.min(
      99,
      Math.round(
        80 + completedBonus + volumeBonus + verifiedBonus - disputePenalty - cancelledPenalty,
      ),
    ),
  );
}

export function buildDemoProfile(
  username: string,
  tradeRows: Trade[],
): UserReputation {
  const normalized = normalizeUsername(username);
  const profile: UserReputation = {
    userId: `demo-${normalized}`,
    piUsername: normalized,
    verifiedBadge: normalized === "lagos_phone_hub",
    verificationRequestedAt:
      normalized === "market_runner" ? "2026-06-06T19:30:00.000Z" : undefined,
    payoutReady: true,
    payoutReadinessConfirmedAt: "2026-06-07T08:00:00.000Z",
    successfulTrades: 0,
    disputedTrades: 0,
    cancelledTrades: 0,
    buyCount: 0,
    sellCount: 0,
    trustScore: 80,
  };

  for (const trade of tradeRows) {
    const isSeller = normalizeUsername(trade.sellerPiUsername) === normalized;
    const isBuyer = normalizeUsername(trade.buyerPiUsername ?? "") === normalized;

    if (!isSeller && !isBuyer) {
      continue;
    }

    if (isSeller) {
      profile.sellCount += 1;
    }

    if (isBuyer) {
      profile.buyCount += 1;
    }

    if (trade.status === "Completed") {
      profile.successfulTrades += 1;
    }

    if (trade.status === "Disputed") {
      profile.disputedTrades += 1;
    }

    if (trade.status === "Cancelled") {
      profile.cancelledTrades += 1;
    }
  }

  profile.trustScore = trustScoreFromProfile(profile);
  return profile;
}

export function buildDemoVerificationRequests(tradeRows: Trade[]) {
  return [
    {
      ...buildDemoProfile("market_runner", tradeRows),
      verifiedBadge: false,
      verificationRequestedAt: "2026-06-06T19:30:00.000Z",
    },
  ].filter((profile) => canRequestVerifiedBadge(profile));
}

export function buildDemoReviewRecommendations(): TradeReviewRecommendation[] {
  return [
    {
      id: "review-demo-001",
      tradeId: "trade-003",
      reviewedByPiUsername: "admin",
      recommendedAction: "request_more_info",
      confidence: 64,
      summary:
        "More evidence is needed before release or refund. The buyer raised a serial-number mismatch and the seller proof needs clearer part photos.",
      missingEvidence: [
        "clear seller delivery proof",
        "buyer receipt confirmation proof",
      ],
      riskFlags: ["active_dispute_review", "party_claim_conflict"],
      createdAt: "2026-06-06T13:55:00.000Z",
    },
  ];
}

export function buildDemoReviewForTrade(
  trade: Trade,
  reviewer = "admin",
): TradeReviewRecommendation {
  const hasSellerProof = Boolean(trade.deliveryProofNote || trade.deliveryProofUrl);
  const hasBuyerReceipt = Boolean(
    trade.buyerReceiptNote || trade.buyerReceiptProofUrl,
  );
  const riskFlags = [
    "active_dispute_review",
    ...(hasSellerProof ? [] : ["seller_proof_missing"]),
    ...(trade.description.toLowerCase().includes("serial")
      ? ["party_claim_conflict"]
      : []),
  ];
  const missingEvidence = [
    ...(hasSellerProof ? [] : ["seller delivery proof"]),
    ...(hasBuyerReceipt ? [] : ["buyer receipt confirmation proof"]),
  ];
  const recommendedAction =
    missingEvidence.length > 0 || riskFlags.includes("party_claim_conflict")
      ? "request_more_info"
      : "release";

  return {
    id: `review-demo-${trade.id}-${Date.now()}`,
    tradeId: trade.id,
    reviewedByPiUsername: reviewer,
    recommendedAction,
    confidence: recommendedAction === "release" ? 82 : 63,
    summary:
      recommendedAction === "release"
        ? "Payment, seller proof, and buyer receipt are present. Admin can consider the seller release path after final review."
        : `More evidence is needed before release or refund. Missing: ${
            missingEvidence.length
              ? missingEvidence.join(", ")
              : "clear party agreement"
          }.`,
    missingEvidence,
    riskFlags,
    createdAt: new Date().toISOString(),
  };
}

export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function reviewActionLabel(
  action: TradeReviewRecommendation["recommendedAction"],
) {
  const labels: Record<TradeReviewRecommendation["recommendedAction"], string> = {
    release: "Seller release",
    refund: "Buyer refund",
    request_more_info: "More info needed",
    admin_review: "Admin review",
  };

  return labels[action];
}

export function humanizeUnderscore(value: string) {
  return value.replace(/_/g, " ");
}

export function isImageUrl(url: string) {
  return url.includes("token=") || /\.(jpe?g|png|webp)(\?|$)/i.test(url);
}

export function toneFromNotificationType(type: string) {
  if (type.includes("dispute") || type.includes("cancelled")) {
    return "warning" as const;
  }

  if (
    type.includes("selected") ||
    type.includes("funded") ||
    type.includes("confirmed") ||
    type.includes("resolved")
  ) {
    return "success" as const;
  }

  return "info" as const;
}
