export const reviewRecommendationActions = [
  "release",
  "refund",
  "request_more_info",
  "admin_review",
] as const;

export type ReviewRecommendationAction =
  (typeof reviewRecommendationActions)[number];

export type TradeReviewRecommendation = {
  id: string;
  tradeId: string;
  reviewedByPiUsername: string;
  recommendedAction: ReviewRecommendationAction;
  confidence: number;
  summary: string;
  missingEvidence: string[];
  riskFlags: string[];
  createdAt: string;
};
