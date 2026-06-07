import { tradeStatusLabels, tradeStatusTone } from "@/lib/trade-state";
import type { TradeStatus } from "@/types/trade";

export function StatusBadge({ status }: { status: TradeStatus }) {
  return (
    <span
      className={`inline-flex h-7 shrink-0 items-center border px-2.5 text-xs font-semibold ${tradeStatusTone[status]}`}
    >
      {tradeStatusLabels[status]}
    </span>
  );
}
