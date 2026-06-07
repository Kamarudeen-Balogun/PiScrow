import type { TradeStatus } from "@/types/trade";

export const tradeStatusLabels: Record<TradeStatus, string> = {
  Draft: "Open for interest",
  PendingFunding: "Pending funding",
  Funded: "Funded",
  DeliverySubmitted: "Delivery submitted",
  Completed: "Completed",
  Disputed: "Disputed",
  Cancelled: "Cancelled",
};

export const tradeStatusTone: Record<TradeStatus, string> = {
  Draft: "border-cyan-300 bg-cyan-100 text-cyan-900",
  PendingFunding: "border-amber-300 bg-amber-100 text-amber-900",
  Funded: "border-cyan-300 bg-cyan-100 text-cyan-900",
  DeliverySubmitted: "border-violet-300 bg-violet-100 text-violet-900",
  Completed: "border-emerald-300 bg-emerald-100 text-emerald-900",
  Disputed: "border-rose-300 bg-rose-100 text-rose-900",
  Cancelled: "border-stone-300 bg-stone-100 text-stone-700",
};

const transitions: Record<TradeStatus, TradeStatus[]> = {
  Draft: ["PendingFunding", "Cancelled"],
  PendingFunding: ["Funded", "Cancelled", "Disputed"],
  Funded: ["DeliverySubmitted", "Disputed", "Cancelled"],
  DeliverySubmitted: ["Completed", "Disputed"],
  Completed: [],
  Disputed: ["Completed", "Cancelled"],
  Cancelled: [],
};

export const tradeVisibilityLabels = {
  public: "Public",
  private: "Private",
} as const;

export function canTransitionTrade(
  fromStatus: TradeStatus,
  toStatus: TradeStatus,
) {
  return transitions[fromStatus].includes(toStatus);
}

export function assertTradeTransition(
  fromStatus: TradeStatus,
  toStatus: TradeStatus,
) {
  if (!canTransitionTrade(fromStatus, toStatus)) {
    throw new Error(`Cannot move trade from ${fromStatus} to ${toStatus}.`);
  }
}

export function formatTestPi(amount: number) {
  return `${amount.toLocaleString("en-US", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 0,
  })} Test Pi`;
}
