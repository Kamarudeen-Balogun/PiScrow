import { createServiceSupabaseClient } from "@/lib/supabase";
import { formatTestPi } from "@/lib/trade-state";
import { calculatePlatformFee } from "@/lib/fees";
import { normalizePiUsername, type AppUser } from "@/server/auth";
import { signProofUrl } from "@/server/proof-storage";
import type {
  Trade,
  TradeEvent,
  TradeInterest,
  TradePaymentSummary,
  TradeStatus,
} from "@/types/trade";
import type { UserReputation } from "@/types/profile";

type UserRow = {
  id: string;
  pi_username: string;
  verified_badge?: boolean;
  verification_requested_at?: string | null;
  payout_ready?: boolean;
  payout_readiness_confirmed_at?: string | null;
};

type UserTradingStatusRow = {
  id: string;
  pi_uid: string;
  pi_username: string;
  payout_ready: boolean | null;
  payout_readiness_confirmed_at: string | null;
};

export type TradeRow = {
  id: string;
  seller_user_id: string | null;
  seller_pi_username: string;
  buyer_user_id: string | null;
  visibility: "public" | "private";
  target_buyer_pi_usernames: string[] | null;
  selected_interest_id: string | null;
  selected_at: string | null;
  selection_expires_at: string | null;
  title: string;
  description: string;
  amount_test_pi: number | string;
  status: TradeStatus;
  location_label: string | null;
  location_area: string | null;
  delivery_terms: string;
  delivery_proof_note: string | null;
  delivery_proof_url: string | null;
  buyer_receipt_note: string | null;
  buyer_receipt_proof_url: string | null;
  completed_at: string | null;
  disputed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ReputationTradeRow = {
  seller_user_id: string | null;
  buyer_user_id: string | null;
  status: TradeStatus;
};

type TradeInterestRow = {
  id: string;
  trade_id: string;
  buyer_user_id: string;
  buyer_pi_username: string;
  response_note: string;
  status: "Open" | "Selected" | "Declined" | "Withdrawn";
  created_at: string;
  updated_at: string;
};

type TradeEventRow = {
  id: string;
  trade_id: string;
  actor_user_id: string | null;
  event_type: string;
  notes: string | null;
  created_at: string;
};

type PaymentRow = {
  id: string;
  trade_id: string;
  pi_payment_id: string;
  amount_test_pi: number | string;
  seller_amount_test_pi: number | string | null;
  platform_fee_test_pi: number | string | null;
  buyer_total_test_pi: number | string | null;
  buyer_payment_txid: string | null;
  buyer_payment_link: string | null;
  escrow_status: TradePaymentSummary["escrowStatus"] | null;
  release_type: TradePaymentSummary["releaseType"] | null;
  release_status: TradePaymentSummary["releaseStatus"] | null;
  release_pi_payment_id: string | null;
  release_txid: string | null;
  release_transaction_link: string | null;
  release_amount_test_pi: number | string | null;
  release_target_pi_username: string | null;
  release_requested_at: string | null;
  release_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function getServiceClientOrThrow() {
  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase service client is not configured.");
  }

  return supabase;
}

export async function getUserTradingStatus(userId: string) {
  const supabase = getServiceClientOrThrow();
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, pi_uid, pi_username, payout_ready, payout_readiness_confirmed_at",
    )
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not load PiScrow trading profile.");
  }

  return data as UserTradingStatusRow;
}

export async function assertUserPayoutReady(
  userId: string,
  intent: "buy" | "fund" | "sell",
) {
  const status = await getUserTradingStatus(userId);

  if (status.payout_ready) {
    return status;
  }

  const messageByIntent = {
    buy: "Complete payout readiness in Profile before showing buyer interest. PiScrow uses your authenticated Pi account for refunds and escrow releases.",
    fund: "Complete payout readiness in Profile before funding trades. PiScrow releases refunds and seller payouts through your authenticated Pi account.",
    sell: "Complete payout readiness in Profile before posting seller offers. PiScrow releases seller payouts to your authenticated Pi account.",
  } as const;

  throw new Error(messageByIntent[intent]);
}

export function mapTrade(
  row: TradeRow,
  users: Map<string, string>,
  interestCount = 0,
  reputations = new Map<string, UserReputation>(),
  payments = new Map<string, TradePaymentSummary>(),
): Trade {
  return {
    id: row.id,
    sellerUserId: row.seller_user_id ?? undefined,
    sellerPiUsername: row.seller_pi_username,
    buyerUserId: row.buyer_user_id ?? undefined,
    buyerPiUsername: row.buyer_user_id
      ? users.get(row.buyer_user_id) ?? "unknown_buyer"
      : undefined,
    title: row.title,
    description: row.description,
    amountTestPi: Number(row.amount_test_pi),
    status: row.status,
    visibility: row.visibility,
    targetBuyerPiUsernames: row.target_buyer_pi_usernames ?? [],
    selectedInterestId: row.selected_interest_id ?? undefined,
    selectedAt: row.selected_at ?? undefined,
    selectionExpiresAt: row.selection_expires_at ?? undefined,
    interestCount,
    sellerProfile: row.seller_user_id
      ? reputations.get(row.seller_user_id)
      : undefined,
    buyerProfile: row.buyer_user_id
      ? reputations.get(row.buyer_user_id)
      : undefined,
    locationLabel: row.location_label ?? undefined,
    locationArea: row.location_area ?? undefined,
    deliveryTerms: row.delivery_terms,
    deliveryProofNote: row.delivery_proof_note ?? undefined,
    deliveryProofUrl: row.delivery_proof_url ?? undefined,
    buyerReceiptNote: row.buyer_receipt_note ?? undefined,
    buyerReceiptProofUrl: row.buyer_receipt_proof_url ?? undefined,
    payment: payments.get(row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function mapTradeWithSignedProofs(
  row: TradeRow,
  users: Map<string, string>,
  interestCount = 0,
  canViewProofs = false,
  reputations = new Map<string, UserReputation>(),
  payments = new Map<string, TradePaymentSummary>(),
) {
  const trade = mapTrade(row, users, interestCount, reputations, payments);

  if (!canViewProofs) {
    return {
      ...trade,
      deliveryProofUrl: undefined,
      buyerReceiptProofUrl: undefined,
    };
  }

  return {
    ...trade,
    deliveryProofUrl: await signProofUrl(trade.deliveryProofUrl),
    buyerReceiptProofUrl: await signProofUrl(trade.buyerReceiptProofUrl),
  };
}

export function mapInterest(
  row: TradeInterestRow,
  reputations = new Map<string, UserReputation>(),
): TradeInterest {
  return {
    id: row.id,
    tradeId: row.trade_id,
    buyerUserId: row.buyer_user_id,
    buyerPiUsername: row.buyer_pi_username,
    buyerProfile: reputations.get(row.buyer_user_id),
    responseNote: row.response_note,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapEvent(row: TradeEventRow, users: Map<string, string>): TradeEvent {
  return {
    id: row.id,
    tradeId: row.trade_id,
    actor: row.actor_user_id
      ? users.get(row.actor_user_id) ?? "unknown_actor"
      : "system",
    eventType: row.event_type,
    notes: row.notes ?? "",
    createdAt: row.created_at,
  };
}

function mapPayment(row: PaymentRow): TradePaymentSummary {
  return {
    id: row.id,
    tradeId: row.trade_id,
    piPaymentId: row.pi_payment_id,
    amountTestPi: Number(row.amount_test_pi),
    sellerAmountTestPi:
      row.seller_amount_test_pi == null
        ? undefined
        : Number(row.seller_amount_test_pi),
    platformFeeTestPi:
      row.platform_fee_test_pi == null
        ? undefined
        : Number(row.platform_fee_test_pi),
    buyerTotalTestPi:
      row.buyer_total_test_pi == null
        ? undefined
        : Number(row.buyer_total_test_pi),
    buyerPaymentTxid: row.buyer_payment_txid ?? undefined,
    buyerPaymentLink: row.buyer_payment_link ?? undefined,
    escrowStatus: row.escrow_status ?? undefined,
    releaseType: row.release_type ?? undefined,
    releaseStatus: row.release_status ?? undefined,
    releasePiPaymentId: row.release_pi_payment_id ?? undefined,
    releaseTxid: row.release_txid ?? undefined,
    releaseTransactionLink: row.release_transaction_link ?? undefined,
    releaseAmountTestPi:
      row.release_amount_test_pi == null
        ? undefined
        : Number(row.release_amount_test_pi),
    releaseTargetPiUsername: row.release_target_pi_username ?? undefined,
    releaseRequestedAt: row.release_requested_at ?? undefined,
    releaseCompletedAt: row.release_completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getCompletedPaymentMap(tradeIds: string[]) {
  const supabase = getServiceClientOrThrow();
  const uniqueIds = [...new Set(tradeIds.filter(Boolean))];

  if (uniqueIds.length === 0) {
    return new Map<string, TradePaymentSummary>();
  }

  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, trade_id, pi_payment_id, amount_test_pi, seller_amount_test_pi, platform_fee_test_pi, buyer_total_test_pi, buyer_payment_txid, buyer_payment_link, escrow_status, release_type, release_status, release_pi_payment_id, release_txid, release_transaction_link, release_amount_test_pi, release_target_pi_username, release_requested_at, release_completed_at, created_at, updated_at",
    )
    .in("trade_id", uniqueIds)
    .eq("status", "Completed")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const payments = new Map<string, TradePaymentSummary>();

  for (const row of (data ?? []) as PaymentRow[]) {
    if (!payments.has(row.trade_id)) {
      payments.set(row.trade_id, mapPayment(row));
    }
  }

  return payments;
}

export async function getUserMap(userIds: string[]) {
  const supabase = getServiceClientOrThrow();
  const uniqueIds = [...new Set(userIds.filter(Boolean))];

  if (uniqueIds.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, pi_username")
    .in("id", uniqueIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as UserRow[]).map((user) => [user.id, user.pi_username]),
  );
}

export async function getUserReputations(userIds: string[]) {
  const supabase = getServiceClientOrThrow();
  const uniqueIds = [...new Set(userIds.filter(Boolean))];

  if (uniqueIds.length === 0) {
    return new Map<string, UserReputation>();
  }

  const { data: userData, error: userError } = await supabase
    .from("users")
    .select(
      "id, pi_username, verified_badge, verification_requested_at, payout_ready, payout_readiness_confirmed_at",
    )
    .in("id", uniqueIds);

  if (userError) {
    throw new Error(userError.message);
  }

  const { data: tradeData, error: tradeError } = await supabase
    .from("trades")
    .select("seller_user_id, buyer_user_id, status")
    .or(
      `seller_user_id.in.(${uniqueIds.join(",")}),buyer_user_id.in.(${uniqueIds.join(",")})`,
    );

  if (tradeError) {
    throw new Error(tradeError.message);
  }

  const profiles = new Map<string, UserReputation>(
    ((userData ?? []) as UserRow[]).map((user) => [
      user.id,
      {
        userId: user.id,
        piUsername: user.pi_username,
        verifiedBadge: Boolean(user.verified_badge),
        verificationRequestedAt: user.verification_requested_at ?? undefined,
        payoutReady: Boolean(user.payout_ready),
        payoutReadinessConfirmedAt:
          user.payout_readiness_confirmed_at ?? undefined,
        successfulTrades: 0,
        disputedTrades: 0,
        cancelledTrades: 0,
        buyCount: 0,
        sellCount: 0,
        trustScore: 80,
      },
    ]),
  );

  for (const trade of (tradeData ?? []) as ReputationTradeRow[]) {
    const seller = trade.seller_user_id
      ? profiles.get(trade.seller_user_id)
      : undefined;
    const buyer = trade.buyer_user_id
      ? profiles.get(trade.buyer_user_id)
      : undefined;

    if (seller) {
      seller.sellCount += 1;
    }

    if (buyer) {
      buyer.buyCount += 1;
    }

    if (trade.status === "Completed") {
      if (seller) {
        seller.successfulTrades += 1;
      }
      if (buyer) {
        buyer.successfulTrades += 1;
      }
    }

    if (trade.status === "Disputed") {
      if (seller) {
        seller.disputedTrades += 1;
      }
      if (buyer) {
        buyer.disputedTrades += 1;
      }
    }

    if (trade.status === "Cancelled") {
      if (seller) {
        seller.cancelledTrades += 1;
      }
      if (buyer) {
        buyer.cancelledTrades += 1;
      }
    }
  }

  for (const profile of profiles.values()) {
    profile.trustScore = calculateTrustScore(profile);
  }

  return profiles;
}

export function calculateTrustScore(profile: Pick<
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
      Math.round(80 + completedBonus + volumeBonus + verifiedBonus - disputePenalty - cancelledPenalty),
    ),
  );
}

export async function listTradesForUser(user: AppUser) {
  const supabase = getServiceClientOrThrow();
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as TradeRow[];
  const normalizedUsername = normalizePiUsername(user.username);
  const visibleRows = rows.filter(
    (trade) =>
      user.isAdmin ||
      trade.seller_user_id === user.id ||
      trade.buyer_user_id === user.id ||
      trade.visibility === "public" ||
      trade.target_buyer_pi_usernames?.includes(normalizedUsername),
  );
  const tradeIds = visibleRows.map((trade) => trade.id);

  const { data: interestRows, error: interestsError } = tradeIds.length
    ? await supabase
        .from("trade_interests")
        .select("*")
        .in("trade_id", tradeIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  if (interestsError) {
    throw new Error(interestsError.message);
  }

  const { data: eventRows, error: eventsError } = tradeIds.length
    ? await supabase
        .from("trade_events")
        .select("*")
        .in("trade_id", tradeIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  if (eventsError) {
    throw new Error(eventsError.message);
  }

  const allInterestRows = (interestRows ?? []) as TradeInterestRow[];
  const actorIds = ((eventRows ?? []) as TradeEventRow[])
    .map((event) => event.actor_user_id)
    .filter((actorId): actorId is string => Boolean(actorId));
  const userIds = [
    ...visibleRows.flatMap((trade) => [
      trade.seller_user_id,
      trade.buyer_user_id,
    ]),
    ...allInterestRows.map((interest) => interest.buyer_user_id),
    ...actorIds,
  ].filter((userId): userId is string => Boolean(userId));
  const users = await getUserMap(userIds);
  const reputations = await getUserReputations(userIds);
  const payments = await getCompletedPaymentMap(tradeIds);
  const interests = allInterestRows.filter((interest) => {
    const trade = visibleRows.find((item) => item.id === interest.trade_id);

    if (!trade) {
      return false;
    }

    if (user.isAdmin || trade.seller_user_id === user.id) {
      return true;
    }

    return interest.buyer_user_id === user.id;
  });

  const interestCounts = allInterestRows.reduce<Map<string, number>>(
    (counts, interest) => {
      counts.set(interest.trade_id, (counts.get(interest.trade_id) ?? 0) + 1);
      return counts;
    },
    new Map<string, number>(),
  );

  return {
    trades: await Promise.all(
      visibleRows.map((trade) => {
        const canViewProofs =
          user.isAdmin ||
          trade.seller_user_id === user.id ||
          trade.buyer_user_id === user.id;

        return mapTradeWithSignedProofs(
          trade,
          users,
          interestCounts.get(trade.id) ?? 0,
          canViewProofs,
          reputations,
          payments,
        );
      }),
    ),
    interests: interests.map((interest) => mapInterest(interest, reputations)),
    events: ((eventRows ?? []) as TradeEventRow[]).map((event) =>
      mapEvent(event, users),
    ),
  };
}

export async function listPublicLedger() {
  const supabase = getServiceClientOrThrow();

  const { data: tradesData, error: tradesError } = await supabase
    .from("trades")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(25);

  if (tradesError) {
    throw new Error(tradesError.message);
  }

  const { data: eventRows, error: eventsError } = await supabase
    .from("trade_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(40);

  if (eventsError) {
    throw new Error(eventsError.message);
  }

  const rows = (tradesData ?? []) as TradeRow[];
  const tradeIds = rows.map((trade) => trade.id);
  const interestRows = tradeIds.length
    ? ((await supabase
        .from("trade_interests")
        .select("*")
        .in("trade_id", tradeIds)) as { data: TradeInterestRow[] | null })
    : { data: [] as TradeInterestRow[] | null };

  const interestCounts = (interestRows.data ?? []).reduce<Map<string, number>>(
    (counts, interest) => {
      counts.set(interest.trade_id, (counts.get(interest.trade_id) ?? 0) + 1);
      return counts;
    },
    new Map<string, number>(),
  );

  const userIds = [
    ...rows.flatMap((trade) => [trade.seller_user_id, trade.buyer_user_id]),
    ...((eventRows ?? []) as TradeEventRow[])
      .map((event) => event.actor_user_id)
      .filter((actorId): actorId is string => Boolean(actorId)),
  ].filter((userId): userId is string => Boolean(userId));
  const users = await getUserMap(userIds);
  const reputations = await getUserReputations(userIds);
  const payments = await getCompletedPaymentMap(tradeIds);

  return {
    trades: rows.map((trade) => ({
      ...mapTrade(
        trade,
        users,
        interestCounts.get(trade.id) ?? 0,
        reputations,
        payments,
      ),
      targetBuyerPiUsernames: [],
      deliveryProofUrl: undefined,
      buyerReceiptProofUrl: undefined,
    })),
    events: ((eventRows ?? []) as TradeEventRow[]).map((event) =>
      mapEvent(event, users),
    ),
  };
}

export async function getTradeForAction(tradeId: string) {
  const supabase = getServiceClientOrThrow();
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("id", tradeId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Trade not found.");
  }

  return data as TradeRow;
}

export async function insertTradeEvent(
  tradeId: string,
  actorUserId: string | null,
  eventType: string,
  notes: string,
  metadata: Record<string, unknown> = {},
) {
  const supabase = getServiceClientOrThrow();
  const { error } = await supabase.from("trade_events").insert({
    trade_id: tradeId,
    actor_user_id: actorUserId,
    event_type: eventType,
    notes,
    metadata,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export function assertBuyer(trade: TradeRow, user: AppUser) {
  if (trade.buyer_user_id !== user.id) {
    throw new Error("Only the buyer can perform this action.");
  }
}

export function assertSeller(trade: TradeRow, user: AppUser) {
  if (trade.seller_user_id !== user.id) {
    throw new Error("Only the seller can perform this action.");
  }
}

export function assertTradeListingOwner(trade: TradeRow, user: AppUser) {
  if (trade.seller_user_id !== user.id) {
    throw new Error("Only the seller can manage this listing.");
  }
}

export function assertBuyerIsEligibleForListing(trade: TradeRow, user: AppUser) {
  if (trade.seller_user_id === user.id) {
    throw new Error("The seller cannot express interest in their own listing.");
  }

  if (trade.visibility === "private") {
    const normalizedUsername = normalizePiUsername(user.username);
    const allowed = trade.target_buyer_pi_usernames ?? [];

    if (!allowed.includes(normalizedUsername)) {
      throw new Error("This private offer is not assigned to your Pi username.");
    }
  }
}

export function assertTradeIsOpenForInterest(trade: TradeRow) {
  if (trade.status !== "Draft") {
    throw new Error("This listing is no longer open for interest.");
  }
}

export function assertTradeHasSelectedBuyer(trade: TradeRow) {
  if (!trade.buyer_user_id) {
    throw new Error("The seller must select a buyer before escrow actions can continue.");
  }
}

export function assertSelectedBuyerCanFund(trade: TradeRow, user: AppUser) {
  assertBuyer(trade, user);

  if (!trade.selected_interest_id) {
    throw new Error("The seller must select your buyer response before funding.");
  }

  if (!trade.selection_expires_at) {
    throw new Error("The selected-buyer funding window is missing. Ask the seller to select you again.");
  }

  if (new Date(trade.selection_expires_at).getTime() <= Date.now()) {
    throw new Error("Your 1-hour funding window expired. Ask the seller to select you again.");
  }
}

export function selectionWindowExpired(trade: TradeRow) {
  return Boolean(
    trade.selection_expires_at &&
      new Date(trade.selection_expires_at).getTime() <= Date.now(),
  );
}

export async function getTradeInterestForAction(interestId: string) {
  const supabase = getServiceClientOrThrow();
  const { data, error } = await supabase
    .from("trade_interests")
    .select("*")
    .eq("id", interestId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Interest not found.");
  }

  return data as TradeInterestRow;
}

export function interestSubmittedEvent(username: string) {
  return `Buyer @${username} submitted interest for this listing.`;
}

export function sellerSelectedBuyerEvent(username: string) {
  return `Seller selected @${username}. The buyer has 1 hour to start funding.`;
}

export function assertTradeStatus(trade: TradeRow, allowed: TradeStatus[]) {
  if (!allowed.includes(trade.status)) {
    throw new Error(
      `Trade must be ${allowed.join(" or ")}. Current status is ${trade.status}.`,
    );
  }
}

export function paymentVerifiedEvent(amount: number) {
  const fee = calculatePlatformFee(amount);

  return `Server verified ${formatTestPi(amount + fee)} buyer funding, including ${formatTestPi(fee)} platform fee.`;
}
