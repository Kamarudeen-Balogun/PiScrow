import type { UserReputation } from "@/types/profile";

export const VERIFIED_BADGE_MIN_COMPLETED_TRADES = 5;

export type ReputationBadgeId =
  | "first_trade"
  | "fast_shipper"
  | "trusted_trader"
  | "market_regular"
  | "verified_local";

export type ReputationBadgeState = {
  id: ReputationBadgeId;
  earned: boolean;
  progress: number;
  target: number;
};

export function reputationBadgeLabel(id: ReputationBadgeId) {
  switch (id) {
    case "first_trade":
      return "First Trade";
    case "fast_shipper":
      return "Fast Shipper";
    case "trusted_trader":
      return "Trusted Trader";
    case "market_regular":
      return "10+ Trades";
    case "verified_local":
      return "Verified Local";
    default:
      return "Badge";
  }
}

export function totalTradeCount(profile: Pick<UserReputation, "buyCount" | "sellCount">) {
  return profile.buyCount + profile.sellCount;
}

export function canRequestVerifiedBadge(
  profile: Pick<UserReputation, "successfulTrades">,
) {
  return profile.successfulTrades >= VERIFIED_BADGE_MIN_COMPLETED_TRADES;
}

export function buildReputationBadges(
  profile: Pick<
    UserReputation,
    "buyCount" | "sellCount" | "successfulTrades" | "verifiedBadge"
  >,
): ReputationBadgeState[] {
  const totalTrades = totalTradeCount(profile);

  return [
    {
      id: "first_trade",
      earned: profile.successfulTrades >= 1,
      progress: Math.min(profile.successfulTrades, 1),
      target: 1,
    },
    {
      id: "fast_shipper",
      earned: profile.successfulTrades >= 3,
      progress: Math.min(profile.successfulTrades, 3),
      target: 3,
    },
    {
      id: "trusted_trader",
      earned: profile.successfulTrades >= VERIFIED_BADGE_MIN_COMPLETED_TRADES,
      progress: Math.min(
        profile.successfulTrades,
        VERIFIED_BADGE_MIN_COMPLETED_TRADES,
      ),
      target: VERIFIED_BADGE_MIN_COMPLETED_TRADES,
    },
    {
      id: "market_regular",
      earned: totalTrades >= 10,
      progress: Math.min(totalTrades, 10),
      target: 10,
    },
    {
      id: "verified_local",
      earned: profile.verifiedBadge,
      progress: profile.verifiedBadge ? 1 : 0,
      target: 1,
    },
  ];
}
