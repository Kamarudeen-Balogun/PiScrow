import type { TradeStatus } from "@/types/trade";

export const tradeStatusLabels: Record<TradeStatus, string> = {
  Draft: "Open for interest",
  PendingFunding: "Pending funding",
  Funded: "Funded",
  DeliverySubmitted: "Delivery submitted",
  AwaitingRelease: "Awaiting release",
  Completed: "Completed",
  Disputed: "Disputed",
  Cancelled: "Cancelled",
};

export const tradeStatusTone: Record<TradeStatus, string> = {
  Draft: "border-emerald-400/25 bg-emerald-500/12 text-emerald-200",
  PendingFunding: "border-amber-400/25 bg-amber-400/12 text-amber-200",
  Funded: "border-[rgba(245,166,35,0.28)] bg-[rgba(245,166,35,0.12)] text-[var(--gold)]",
  DeliverySubmitted: "border-violet-400/30 bg-violet-500/12 text-violet-200",
  AwaitingRelease: "border-sky-400/25 bg-sky-500/12 text-sky-200",
  Completed: "border-emerald-400/25 bg-emerald-400/12 text-emerald-200",
  Disputed: "border-rose-400/28 bg-rose-500/12 text-rose-200",
  Cancelled: "border-white/12 bg-white/6 text-slate-300",
};

const transitions: Record<TradeStatus, TradeStatus[]> = {
  Draft: ["PendingFunding", "Cancelled"],
  PendingFunding: ["Funded", "Cancelled", "Disputed"],
  Funded: ["DeliverySubmitted", "Disputed", "Cancelled"],
  DeliverySubmitted: ["AwaitingRelease", "Disputed"],
  AwaitingRelease: ["Completed", "Disputed", "Cancelled"],
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
