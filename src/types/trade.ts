import type { UserReputation } from "@/types/profile";

export const tradeStatuses = [
  "Draft",
  "PendingFunding",
  "Funded",
  "DeliverySubmitted",
  "AwaitingRelease",
  "Completed",
  "Disputed",
  "Cancelled",
] as const;

export type TradeStatus = (typeof tradeStatuses)[number];

export const tradeVisibilities = ["public", "private"] as const;

export type TradeVisibility = (typeof tradeVisibilities)[number];

export const tradeInterestStatuses = [
  "Open",
  "Selected",
  "Declined",
  "Withdrawn",
] as const;

export type TradeInterestStatus = (typeof tradeInterestStatuses)[number];

export type Trade = {
  id: string;
  sellerUserId?: string;
  sellerPiUsername: string;
  buyerUserId?: string;
  buyerPiUsername?: string;
  title: string;
  description: string;
  amountTestPi: number;
  status: TradeStatus;
  visibility: TradeVisibility;
  targetBuyerPiUsernames: string[];
  selectedInterestId?: string;
  selectedAt?: string;
  selectionExpiresAt?: string;
  interestCount?: number;
  sellerProfile?: UserReputation;
  buyerProfile?: UserReputation;
  locationLabel?: string;
  locationArea?: string;
  deliveryTerms: string;
  deliveryProofNote?: string;
  deliveryProofUrl?: string;
  buyerReceiptNote?: string;
  buyerReceiptProofUrl?: string;
  deliveryDueAt?: string;
  deliveryExpiredAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  payment?: TradePaymentSummary;
  createdAt: string;
  updatedAt: string;
};

export type EscrowStatus =
  | "buyer_pending"
  | "held_in_app"
  | "release_pending"
  | "released_to_seller"
  | "refund_pending"
  | "refunded_to_buyer"
  | "release_failed"
  | "refund_failed";

export type EscrowReleaseType = "seller_release" | "buyer_refund";

export type EscrowReleaseStatus =
  | "NotStarted"
  | "Created"
  | "Submitted"
  | "Completed"
  | "Failed"
  | "Cancelled";

export type TradePaymentSummary = {
  id: string;
  tradeId: string;
  piPaymentId: string;
  amountTestPi: number;
  sellerAmountTestPi?: number;
  platformFeeTestPi?: number;
  buyerTotalTestPi?: number;
  buyerPaymentTxid?: string;
  buyerPaymentLink?: string;
  escrowStatus?: EscrowStatus;
  releaseType?: EscrowReleaseType;
  releaseStatus?: EscrowReleaseStatus;
  releasePiPaymentId?: string;
  releaseTxid?: string;
  releaseTransactionLink?: string;
  releaseAmountTestPi?: number;
  releaseTargetPiUsername?: string;
  releaseRequestedAt?: string;
  releaseCompletedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type TradeInterest = {
  id: string;
  tradeId: string;
  buyerUserId: string;
  buyerPiUsername: string;
  buyerProfile?: UserReputation;
  responseNote: string;
  status: TradeInterestStatus;
  createdAt: string;
  updatedAt: string;
};

export type TradeEvent = {
  id: string;
  tradeId: string;
  actor: string;
  actorProfile?: UserReputation;
  eventType: string;
  notes: string;
  createdAt: string;
};

export type Payment = {
  id: string;
  tradeId: string;
  piPaymentId: string;
  amountTestPi: number;
  status: "Pending" | "Approved" | "Completed" | "Failed" | "Cancelled";
  rawProviderStatus?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type Dispute = {
  id: string;
  tradeId: string;
  openedBy: string;
  reason: string;
  evidenceNote?: string;
  status: "Open" | "Resolved" | "Cancelled";
  resolution?: string;
  createdAt: string;
};

export type TradeChatRoom = {
  id: string;
  tradeId: string;
  status: "active" | "disputed" | "closed";
  claimedAdminUserId?: string;
  claimedAdminPiUsername?: string;
  claimedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type TradeChatMessage = {
  id: string;
  roomId: string;
  tradeId: string;
  senderUserId?: string;
  senderPiUsername: string;
  senderProfile?: UserReputation;
  senderRole: "buyer" | "seller" | "admin" | "system";
  messageType: "text" | "proof" | "system";
  body: string;
  attachmentUrl?: string;
  createdAt: string;
};
