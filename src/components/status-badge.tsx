import { tradeStatusLabels } from "@/lib/trade-state";
import type { TradeStatus } from "@/types/trade";

const statusStyles: Record<TradeStatus, { className: string; dot: string }> = {
  Draft: { className: "bo", dot: "var(--ok)" },
  PendingFunding: { className: "bp", dot: "var(--warn)" },
  Funded: { className: "bf", dot: "var(--gold)" },
  DeliverySubmitted: { className: "bv", dot: "var(--purple-light)" },
  AwaitingRelease: { className: "bq", dot: "var(--info)" },
  Completed: { className: "bo", dot: "var(--ok)" },
  Disputed: { className: "bd2", dot: "var(--danger)" },
  Cancelled: { className: "be", dot: "var(--muted-dark)" },
};

export function StatusBadge({ status }: { status: TradeStatus }) {
  const style = statusStyles[status];

  return (
    <span className={`bdg ${style.className}`}>
      <span className="bdot" style={{ background: style.dot }} />
      {tradeStatusLabels[status]}
    </span>
  );
}
