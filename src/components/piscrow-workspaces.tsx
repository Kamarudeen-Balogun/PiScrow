"use client";

import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  HandCoins,
  Languages,
  Lightbulb,
  LoaderCircle,
  LogOut,
  MapPin,
  MessageSquare,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";

import { PublicProfileSheet } from "@/components/public-profile-sheet";
import { StatusBadge } from "@/components/status-badge";
import { VerifiedUsername } from "@/components/verified-username";
import {
  calculateBuyerTotal,
  calculatePlatformFee,
  calculateSellerReceivable,
  feePercentLabel,
} from "@/lib/fees";
import {
  deliveryDeadlineChipLabel,
  deliveryDeadlineDetail,
  deliveryWindowExpired,
  dateLabel,
  fundingWindowLabel,
  humanizeUnderscore,
  isImageUrl,
  normalizeUsername,
  reviewActionLabel,
  selectionExpired,
} from "@/lib/piscrow-ui-helpers";
import {
  buildReputationBadges,
  canRequestVerifiedBadge,
  reputationBadgeLabel,
  VERIFIED_BADGE_MIN_COMPLETED_TRADES,
} from "@/lib/reputation";
import type { LanguageCode } from "@/lib/language";
import { getWorkspaceCopy, type WorkspaceCopy } from "@/lib/workspace-copy";
import { formatTestPi, tradeVisibilityLabels } from "@/lib/trade-state";
import type { TelegramLinkStatus, UserReputation } from "@/types/profile";
import type { TradeReviewRecommendation } from "@/types/review";
import type {
  Trade,
  TradeChatMessage,
  TradeChatRoom,
  TradeEvent,
  TradeInterest,
} from "@/types/trade";

type FeedbackStatus = {
  tone: "success" | "warning";
  message: string;
} | null;

const panelClass = "card mx-[14px]";
const inputClass = "inp";
const textareaClass = "ta";
const primaryButtonClass = "btn-g";
const secondaryButtonClass = "btn-gh";
const successButtonClass = "btn-s";
const dangerButtonClass = "btn-d";
const sectionEyebrowClass = "lbl";

type ListingCategory = "Physical Goods" | "Services" | "Digital Assets";

function formatPiAmount(amount: number) {
  return `π ${amount.toLocaleString("en-US", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 0,
  })}`;
}

function listingCategory(trade: Trade): ListingCategory {
  const text = `${trade.title} ${trade.description} ${trade.deliveryTerms}`.toLowerCase();

  if (/\b(service|repair|delivery|consult|design|install|support)\b/.test(text)) {
    return "Services";
  }

  if (/\b(digital|asset|nft|theme|skin|software|code|file|ebook)\b/.test(text)) {
    return "Digital Assets";
  }

  return "Physical Goods";
}

function tradeSearchText(trade: Trade) {
  return [
    trade.title,
    trade.description,
    trade.sellerPiUsername,
    trade.buyerPiUsername,
    trade.locationLabel,
    trade.locationArea,
    trade.deliveryTerms,
    listingCategory(trade),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function ledgerTradePriority(trade: Trade) {
  switch (trade.status) {
    case "Draft":
    case "PendingFunding":
    case "Funded":
    case "DeliverySubmitted":
    case "AwaitingRelease":
    case "Disputed":
      return 0;
    case "Completed":
      return 1;
    case "Cancelled":
      return 2;
    default:
      return 3;
  }
}

function tradeInterestsFor(trade: Trade, interests: TradeInterest[]) {
  return interests.filter((interest) => interest.tradeId === trade.id);
}

function userInterestFor(
  trade: Trade,
  interests: TradeInterest[],
  currentUsername: string,
  currentUserId?: string,
) {
  return interests.find(
    (interest) =>
      interest.tradeId === trade.id &&
      (
        (currentUserId && interest.buyerUserId === currentUserId) ||
        normalizeUsername(interest.buyerPiUsername) === currentUsername
      ),
  );
}

function isSelectedBuyer(trade: Trade, currentUsername: string) {
  return (
    Boolean(trade.buyerPiUsername) &&
    normalizeUsername(trade.buyerPiUsername ?? "") === currentUsername
  );
}

function isSeller(trade: Trade, currentUsername: string) {
  return normalizeUsername(trade.sellerPiUsername) === currentUsername;
}

function canReportTrade(trade: Trade, currentUsername: string) {
  return (
    (isSeller(trade, currentUsername) || isSelectedBuyer(trade, currentUsername)) &&
    ["Funded", "DeliverySubmitted", "AwaitingRelease"].includes(trade.status)
  );
}

function compactProfileForTrade(trade: Trade) {
  return (
    trade.sellerProfile ?? {
      userId: trade.sellerUserId ?? trade.sellerPiUsername,
      piUsername: trade.sellerPiUsername,
      verifiedBadge: false,
      payoutReady: false,
      successfulTrades: 0,
      disputedTrades: 0,
      cancelledTrades: 0,
      buyCount: 0,
      sellCount: 0,
      trustScore: 94,
    }
  );
}

function profileForTradeParticipant(
  trade: Trade,
  username?: string,
): UserReputation | undefined {
  const normalized = normalizeUsername(username ?? "");

  if (!normalized) {
    return undefined;
  }

  if (normalized === normalizeUsername(trade.sellerPiUsername)) {
    return trade.sellerProfile ?? compactProfileForTrade(trade);
  }

  if (
    trade.buyerPiUsername &&
    normalized === normalizeUsername(trade.buyerPiUsername)
  ) {
    return trade.buyerProfile;
  }

  return undefined;
}

function statusToneClass(trade: Trade) {
  if (trade.status === "Disputed" || trade.status === "Cancelled") {
    return "border-rose-400/20";
  }

  if (trade.status === "PendingFunding") {
    return "border-amber-400/20";
  }

  return "";
}

function cardInterestLabel(count?: number) {
  const safeCount = count ?? 0;
  return `${safeCount} ${safeCount === 1 ? "interest" : "interests"}`;
}

function shortTxid(value?: string) {
  if (!value) {
    return "";
  }

  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function compactEscrowLabel(trade: Trade) {
  const payment = trade.payment;

  if (!payment) {
    if (trade.status === "PendingFunding") {
      return "Funding open";
    }

    return null;
  }

  switch (payment.escrowStatus) {
    case "buyer_pending":
      return "Funding pending";
    case "held_in_app":
      return trade.status === "AwaitingRelease" ? "Release review" : "Held in escrow";
    case "release_pending":
      return "Payout pending";
    case "released_to_seller":
      return "Released";
    case "refund_pending":
      return "Refund pending";
    case "refunded_to_buyer":
      return "Refunded";
    case "release_failed":
      return "Payout failed";
    case "refund_failed":
      return "Refund failed";
    default:
      return "Escrow";
  }
}

function compactEscrowTone(trade: Trade): "danger" | "info" | "neutral" | "private" | "success" | "warning" {
  const payment = trade.payment;

  if (!payment) {
    return trade.status === "PendingFunding" ? "warning" : "neutral";
  }

  switch (payment.escrowStatus) {
    case "released_to_seller":
    case "refunded_to_buyer":
      return "success";
    case "release_failed":
    case "refund_failed":
      return "danger";
    case "buyer_pending":
    case "refund_pending":
      return "warning";
    case "held_in_app":
    case "release_pending":
      return "info";
    default:
      return "neutral";
  }
}

function escrowHeadline(trade: Trade) {
  const payment = trade.payment;

  if (!payment) {
    if (trade.status === "PendingFunding") {
      return "Waiting for buyer funding";
    }

    return "No escrow payment yet";
  }

  switch (payment.escrowStatus) {
    case "buyer_pending":
      return "PiScrow is approving buyer funding";
    case "held_in_app":
      return trade.status === "AwaitingRelease"
        ? "Funds are held while payout waits for release"
        : "Funds are held in PiScrow escrow";
    case "release_pending":
      return "Seller payout is being submitted";
    case "released_to_seller":
      return "Seller payout completed";
    case "refund_pending":
      return "Buyer refund is being submitted";
    case "refunded_to_buyer":
      return "Buyer refund completed";
    case "release_failed":
      return "Seller payout needs another review";
    case "refund_failed":
      return "Buyer refund needs another review";
    default:
      return "Escrow state updated";
  }
}

function escrowDescription(trade: Trade) {
  const payment = trade.payment;

  if (!payment) {
    if (trade.status === "PendingFunding") {
      return "The seller selected one buyer. PiScrow will hold the Test Pi as soon as buyer funding completes.";
    }

    if (trade.status === "Draft") {
      return "No money has moved yet. Escrow starts only after the seller chooses one buyer.";
    }

    return "Payment tracking will appear here once buyer funding is verified.";
  }

  switch (payment.escrowStatus) {
    case "buyer_pending":
      return "The Pi payment was approved and is still waiting for final blockchain completion.";
    case "held_in_app":
      if (trade.status === "Disputed") {
        return "PiScrow is holding the buyer payment while the dispute stays frozen for admin review.";
      }

      if (trade.status === "AwaitingRelease") {
        if (trade.buyerReceiptNote || trade.buyerReceiptProofUrl) {
          return "Buyer receipt proof is saved. PiScrow is still holding the buyer payment until admin releases it to the seller.";
        }

        return "Seller requested payout release. PiScrow is still holding the buyer payment until admin finishes release review.";
      }

      return "The buyer paid successfully. PiScrow is holding the Test Pi until proof and review are completed.";
    case "release_pending":
      return "PiScrow is submitting the seller payout from escrow to the seller's Pi account.";
    case "released_to_seller":
      return "The seller payout left PiScrow escrow and was sent to the seller's Pi account.";
    case "refund_pending":
      return "PiScrow is submitting the refund from escrow back to the buyer's Pi account.";
    case "refunded_to_buyer":
      return "The buyer refund left PiScrow escrow and was sent back to the buyer's Pi account.";
    case "release_failed":
      return "Automatic payout could not be completed. Admin should review the failure before retrying release.";
    case "refund_failed":
      return "Automatic refund could not be completed. Admin should review the failure before retrying the refund.";
    default:
      return "Escrow tracking is available for this trade.";
  }
}

function releaseLineLabel(trade: Trade) {
  const payment = trade.payment;

  if (payment?.releaseType === "buyer_refund" || trade.status === "Cancelled") {
    return "Buyer refund";
  }

  return "Seller payout";
}

function releaseLineStatus(trade: Trade) {
  const payment = trade.payment;

  if (!payment) {
    if (trade.status === "AwaitingRelease") {
      return "Waiting for admin release review";
    }

    if (trade.status === "Disputed") {
      return "Frozen for dispute review";
    }

    return "Not started";
  }

  if (payment.releaseStatus === "Completed") {
    return payment.releaseType === "buyer_refund"
      ? "Refund completed on Pi Testnet"
      : "Payout completed on Pi Testnet";
  }

  if (payment.releaseStatus === "Submitted") {
    return payment.releaseType === "buyer_refund"
      ? "Refund submitted to Pi Testnet"
      : "Payout submitted to Pi Testnet";
  }

  if (payment.releaseStatus === "Created") {
    return payment.releaseType === "buyer_refund"
      ? "Refund created, waiting for submission"
      : "Payout created, waiting for submission";
  }

  if (payment.releaseStatus === "Failed") {
    return payment.releaseType === "buyer_refund"
      ? "Refund failed and needs admin attention"
      : "Payout failed and needs admin attention";
  }

  if (trade.status === "Disputed") {
    return "Frozen for dispute review";
  }

  if (trade.status === "AwaitingRelease") {
    return "Waiting for admin release review";
  }

  return "Not started";
}

function awaitingReleaseNotice(trade: Trade, emphasis: "admin" | "buyer" | "seller") {
  if (trade.status !== "AwaitingRelease") {
    return null;
  }

  const buyerConfirmed = Boolean(trade.buyerReceiptNote || trade.buyerReceiptProofUrl);

  if (emphasis === "buyer") {
    return buyerConfirmed
      ? "Your receipt proof is already saved. PiScrow is still holding the funds until admin releases the seller payout."
      : "The seller requested payout release. Admin review is still required before funds leave escrow.";
  }

  if (emphasis === "seller") {
    return buyerConfirmed
      ? "Buyer receipt proof is already saved. PiScrow is still holding the funds until admin releases your payout."
      : "Your payout request is recorded. PiScrow is still holding the funds until admin completes release review.";
  }

  return "Releasing now should create the actual seller payout from PiScrow escrow. Refunding will instead send the held Test Pi back to the buyer.";
}

const piTestnetExplorerBase = "https://blockexplorer.minepi.com/testnet";

const piTransactionHashPattern = /^[0-9a-f]{64}$/i;

function canOpenExplorerTransaction(txid?: string) {
  return Boolean(txid?.trim() && piTransactionHashPattern.test(txid.trim()));
}

function transactionExplorerLink(link?: string, txid?: string) {
  const trimmedLink = link?.trim();

  if (trimmedLink?.includes("blockexplorer.minepi.com")) {
    return trimmedLink;
  }

  if (trimmedLink) {
    try {
      const parsed = new URL(trimmedLink);
      const transactionPathMatch = parsed.pathname.match(/\/transactions\/([^/?#]+)/i);

      if (transactionPathMatch?.[1] && canOpenExplorerTransaction(transactionPathMatch[1])) {
        return `${piTestnetExplorerBase}/tx/${encodeURIComponent(transactionPathMatch[1])}`;
      }
    } catch {
      // Fall through to txid fallback when the stored link is not a valid URL.
    }
  }

  const trimmedTxid = txid?.trim();

  if (trimmedTxid && canOpenExplorerTransaction(trimmedTxid)) {
    return `${piTestnetExplorerBase}/tx/${encodeURIComponent(trimmedTxid)}`;
  }

  return undefined;
}

function releaseExpectedAmount(trade: Trade) {
  const payment = trade.payment;

  if (!payment) {
    return trade.status === "Cancelled"
      ? calculateBuyerTotal(trade.amountTestPi)
      : calculateSellerReceivable(trade.amountTestPi);
  }

  if (payment.releaseAmountTestPi != null) {
    return payment.releaseAmountTestPi;
  }

  if (payment.releaseType === "buyer_refund" || trade.status === "Cancelled") {
    return payment.buyerTotalTestPi ?? payment.amountTestPi;
  }

  return payment.sellerAmountTestPi ?? calculateSellerReceivable(trade.amountTestPi);
}

export function SellerPostPanel({
  profile,
  username,
  onCancel,
  onCreateTrade,
}: {
  profile?: UserReputation | null;
  username: string;
  onCancel: () => void;
  onCreateTrade: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [step, setStep] = useState(1);

  return (
    <section className="mx-[14px] grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Create Listing</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
            <span>Step {step} of 3</span>
            <span>·</span>
            <VerifiedUsername
              className="text-slate-400"
              profile={profile ?? undefined}
              username={username}
            />
          </div>
        </div>
        <button
          aria-label="Close listing composer"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300"
          type="button"
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex justify-center gap-[6px]">
        {[1, 2, 3].map((item) => (
          <span
            key={item}
            className={`wd${item < step ? " dk" : item === step ? " on" : ""}`}
          />
        ))}
      </div>

      <form
        className="card grid gap-[14px]"
        onReset={() => {
          setVisibility("public");
          setStep(1);
        }}
        onSubmit={onCreateTrade}
      >
        <div className={step === 1 ? "grid gap-3" : "hidden"}>
          <label>
            <span className={sectionEyebrowClass}>Item title</span>
            <input
              className={inputClass}
              name="title"
              placeholder="Used Android phone barter"
            />
          </label>
          <label>
            <span className={sectionEyebrowClass}>Description</span>
            <textarea
              className={textareaClass}
              name="description"
              placeholder="Describe condition, quantity, handoff details, and what buyers should know."
            />
          </label>
          <button className={primaryButtonClass} type="button" onClick={() => setStep(2)}>
            Continue
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className={step === 2 ? "grid gap-3" : "hidden"}>
          <div>
            <span className={sectionEyebrowClass}>Offer type</span>
            <button
              className="flex w-full items-center gap-3 py-2 text-left"
              type="button"
              onClick={() =>
                setVisibility((current) => (current === "public" ? "private" : "public"))
              }
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white">
                  {visibility === "public" ? "Public Offer" : "Private Offer"}
                </div>
                <div className="text-xs text-slate-500">
                  {visibility === "public"
                    ? "Visible to all buyers on Explore"
                    : "Only one buyer username can receive this request"}
                </div>
              </div>
              <span
                className="tog-t"
                style={{
                  background:
                    visibility === "public"
                      ? "rgba(245,166,35,0.28)"
                      : "rgba(255,255,255,0.09)",
                }}
              >
                <span
                  className="tog-k"
                  style={{ left: visibility === "public" ? 22 : 2 }}
                />
              </span>
            </button>
            <input name="visibility" type="hidden" value={visibility} />
            {visibility === "private" && (
              <input
                className={inputClass}
                name="targetBuyerPiUsernames"
                placeholder="Target buyer @username"
              />
            )}
          </div>
          <label>
            <span className={sectionEyebrowClass}>City / State</span>
            <input className={inputClass} name="locationLabel" placeholder="Ikeja, Lagos" />
          </label>
          <label>
            <span className={sectionEyebrowClass}>Pickup or delivery area</span>
            <input
              className={inputClass}
              name="locationArea"
              placeholder="Computer Village"
            />
          </label>
          <div className="flex gap-2">
            <button className="btn-gh flex-1" type="button" onClick={() => setStep(1)}>
              Back
            </button>
            <button className="btn-g flex-[2]" type="button" onClick={() => setStep(3)}>
              Continue
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className={step === 3 ? "grid gap-3" : "hidden"}>
          <label>
            <span className={sectionEyebrowClass}>Price (π)</span>
            <input
              className={inputClass}
              min="0.01"
              name="amountTestPi"
              placeholder="0.00"
              step="0.01"
              type="number"
            />
          </label>
          <label>
            <span className={sectionEyebrowClass}>Delivery terms</span>
            <textarea
              className={textareaClass}
              name="deliveryTerms"
              placeholder="How will handoff, delivery proof, and receipt confirmation work?"
            />
          </label>
          <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm leading-6 text-amber-100">
            Sellers must complete delivery within 7 days after buyer funding. If no
            seller delivery proof is submitted before that deadline, PiScrow
            automatically refunds the buyer in full.
          </div>
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm leading-6 text-emerald-100">
            PiScrow fee: {feePercentLabel()} of the listing price. Buyers fund
            the seller price plus the platform fee.
          </div>
          <div className="flex gap-2">
            <button className="btn-gh flex-1" type="button" onClick={() => setStep(2)}>
              Back
            </button>
            <button className="btn-g flex-[2]" type="submit">
              <Plus className="h-4 w-4" />
              Publish Offer
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

export function BuyerDesk({
  chatLoadingTradeId,
  chatMessages,
  chatRooms,
  language,
  trades,
  interests,
  currentUsername,
  currentUserId,
  activeValue,
  paymentState,
  onConfirm,
  onGenerateHandoffCode,
  onDeleteTrade,
  onDeclinePrivate,
  onFund,
  onRevealHandoffCode,
  onOpenChat,
  onOpenDispute,
  onSubmitInterest,
}: {
  chatLoadingTradeId: string;
  chatMessages: TradeChatMessage[];
  chatRooms: TradeChatRoom[];
  language: LanguageCode;
  trades: Trade[];
  interests: TradeInterest[];
  currentUsername: string;
  currentUserId?: string;
  activeValue: number;
  paymentState: string;
  onConfirm: (trade: Trade, event: FormEvent<HTMLFormElement>) => void;
  onGenerateHandoffCode: (trade: Trade) => void;
  onDeleteTrade: (trade: Trade) => void;
  onDeclinePrivate: (trade: Trade) => void;
  onFund: (trade: Trade) => void;
  onRevealHandoffCode: (trade: Trade) => void;
  onOpenChat: (trade: Trade) => void;
  onOpenDispute: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitInterest: (trade: Trade, event: FormEvent<HTMLFormElement>) => void;
}) {
  const copy = getWorkspaceCopy(language);
  const [tab, setTab] = useState<"interests" | "escrows">("interests");
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const autoOpenedEscrowsRef = useRef(false);

  const myInterests = interests.filter(
    (interest) => normalizeUsername(interest.buyerPiUsername) === currentUsername,
  );
  const interestTrades = myInterests
    .map((interest) => trades.find((trade) => trade.id === interest.tradeId))
    .filter((trade): trade is Trade => Boolean(trade));
  const privateRequests = trades.filter(
    (trade) =>
      trade.visibility === "private" &&
      trade.status === "Draft" &&
      trade.targetBuyerPiUsernames.includes(currentUsername) &&
      !interestTrades.some((item) => item.id === trade.id),
  );
  const buyerOpportunities = [...privateRequests, ...interestTrades];
  const activeEscrows = trades.filter(
    (trade) =>
      isSelectedBuyer(trade, currentUsername) &&
      [
        "PendingFunding",
        "Funded",
        "DeliverySubmitted",
        "AwaitingRelease",
        "Disputed",
      ].includes(trade.status),
  );
  const disputes = activeEscrows.filter((trade) => trade.status === "Disputed").length;
  const visibleTrades = tab === "interests" ? buyerOpportunities : activeEscrows;
  const liveSelectedTrade =
    selectedTrade == null ? null : (trades.find((trade) => trade.id === selectedTrade.id) ?? null);

  useEffect(() => {
    if (!autoOpenedEscrowsRef.current && activeEscrows.length > 0) {
      autoOpenedEscrowsRef.current = true;
      setTab("escrows");
    }
  }, [activeEscrows.length]);

  return (
    <section>
      <section className="sg">
        <Metric
          icon={<CheckCircle2 className="h-5 w-5" />}
          label={copy.buyerDesk.openOffers}
          value={buyerOpportunities.length}
        />
        <Metric
          icon={<HandCoins className="h-5 w-5" />}
          label={copy.buyerDesk.activePi}
          value={formatPiAmount(activeValue).replace("π ", "")}
        />
        <Metric
          icon={<AlertTriangle className="h-5 w-5" />}
          label={copy.buyerDesk.disputes}
          value={disputes}
        />
      </section>

      <div className="seg">
        <button
          className={tab === "interests" ? "on" : ""}
          type="button"
          onClick={() => setTab("interests")}
        >
          {copy.buyerDesk.myInterests}
        </button>
        <button
          className={tab === "escrows" ? "on" : ""}
          type="button"
          onClick={() => setTab("escrows")}
        >
          {copy.buyerDesk.activeEscrows}
        </button>
      </div>

      {visibleTrades.length === 0 ? (
        <EmptyState
          label={
            tab === "interests"
              ? copy.buyerDesk.noBuyerInterests
              : copy.buyerDesk.noEscrows
          }
        />
      ) : (
        <div className="cstack">
          {visibleTrades.map((trade) => (
            tab === "escrows" ? (
              <EscrowTrackerCard
                key={trade.id}
                copy={copy}
                loading={chatLoadingTradeId === trade.id}
                trade={trade}
                onChat={() => onOpenChat(trade)}
                onDetails={() => setSelectedTrade(trade)}
                onFund={() => onFund(trade)}
              />
            ) : (
              <button
                key={trade.id}
                className={`card ${statusToneClass(trade)} w-full text-left`}
                type="button"
                onClick={() => setSelectedTrade(trade)}
              >
                <CompactListingCard
                  copy={copy}
                  interests={tradeInterestsFor(trade, interests)}
                  trade={trade}
                />
              </button>
            )
          ))}
        </div>
      )}

      {liveSelectedTrade && (
        <TradeDetailSheet
          copy={copy}
          currentUsername={currentUsername}
          currentUserId={currentUserId}
          interests={interests}
          paymentState={paymentState}
          trade={liveSelectedTrade}
          chatLoading={chatLoadingTradeId === liveSelectedTrade.id}
          chatMessages={chatMessages.filter(
            (message) => message.tradeId === liveSelectedTrade.id,
          )}
          chatRoom={chatRooms.find((room) => room.tradeId === liveSelectedTrade.id)}
          onClose={() => setSelectedTrade(null)}
          onConfirm={onConfirm}
          onGenerateHandoffCode={onGenerateHandoffCode}
          onDeleteTrade={onDeleteTrade}
          onDeclinePrivate={onDeclinePrivate}
          onFund={onFund}
          onRevealHandoffCode={onRevealHandoffCode}
          onOpenChat={onOpenChat}
          onOpenDispute={onOpenDispute}
          onSubmitInterest={onSubmitInterest}
        />
      )}
    </section>
  );
}

export function SellerDesk({
  chatLoadingTradeId,
  chatMessages,
  chatRooms,
  language,
  trades,
  interests,
  currentUsername,
  currentUserId,
  onNewListing,
  onSelect,
  onSelectInterest,
  onDeleteOffer,
  onOpenChat,
  onRequestRelease,
  onVerifyHandoffCode,
  onOpenDispute,
}: {
  chatLoadingTradeId: string;
  chatMessages: TradeChatMessage[];
  chatRooms: TradeChatRoom[];
  language: LanguageCode;
  trades: Trade[];
  interests: TradeInterest[];
  currentUsername: string;
  currentUserId?: string;
  onNewListing: () => void;
  onSelect: (tradeId: string) => void;
  onSelectInterest: (trade: Trade, interest: TradeInterest) => void;
  onDeleteOffer: (trade: Trade) => void;
  onOpenChat: (trade: Trade) => void;
  onRequestRelease: (trade: Trade, note: string) => void;
  onVerifyHandoffCode: (trade: Trade, code: string) => void;
  onOpenDispute: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const copy = getWorkspaceCopy(language);
  const [detailsTrade, setDetailsTrade] = useState<Trade | null>(null);
  const liveDetailsTrade =
    detailsTrade == null ? null : (trades.find((trade) => trade.id === detailsTrade.id) ?? null);

  function openTrade(trade: Trade) {
    onSelect(trade.id);
    setDetailsTrade(trade);
  }

  return (
    <section>
      <div className="sh gap-3">
        <span className="sh-t whitespace-nowrap text-lg">{copy.sellerDesk.myListings}</span>
        <button
          className="btn-g min-w-[150px] flex-none px-4 py-3"
          style={{ width: "auto" }}
          type="button"
          onClick={onNewListing}
        >
          <Plus className="h-4 w-4" />
          {copy.sellerDesk.newListing}
        </button>
      </div>

      {trades.length === 0 ? (
        <EmptyState label={copy.sellerDesk.noSellerOffers} />
      ) : (
        <div className="cstack">
          {trades.map((trade) => (
            <button
              key={trade.id}
              className={`card ${statusToneClass(trade)} w-full text-left`}
              type="button"
              onClick={() => openTrade(trade)}
            >
              <CompactListingCard
                copy={copy}
                interests={tradeInterestsFor(trade, interests)}
                trade={trade}
              />
            </button>
          ))}
        </div>
      )}

      {liveDetailsTrade && (
        <SellerTradeSheet
          copy={copy}
          currentUsername={currentUsername}
          currentUserId={currentUserId}
          interests={interests}
          trade={liveDetailsTrade}
          chatLoading={chatLoadingTradeId === liveDetailsTrade.id}
          chatMessages={chatMessages.filter(
            (message) => message.tradeId === liveDetailsTrade.id,
          )}
          chatRoom={chatRooms.find((room) => room.tradeId === liveDetailsTrade.id)}
          onClose={() => setDetailsTrade(null)}
          onDeleteOffer={onDeleteOffer}
          onOpenChat={onOpenChat}
          onOpenDispute={onOpenDispute}
          onSelectInterest={onSelectInterest}
          onRequestRelease={onRequestRelease}
          onVerifyHandoffCode={onVerifyHandoffCode}
        />
      )}
    </section>
  );
}

export function PublicLedger({
  language,
  trades,
  events,
  currentUsername,
  interests,
  loading,
  onDeclinePrivate,
  onSubmitInterest,
  onRefresh,
}: {
  language: LanguageCode;
  trades: Trade[];
  events: TradeEvent[];
  currentUsername: string;
  interests: TradeInterest[];
  loading: boolean;
  onDeclinePrivate?: (trade: Trade) => void;
  onSubmitInterest?: (trade: Trade, event: FormEvent<HTMLFormElement>) => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"All" | ListingCategory>("All");
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const copy = getWorkspaceCopy(language);
  const filters: ("All" | ListingCategory)[] = [
    "All",
    "Physical Goods",
    "Services",
    "Digital Assets",
  ];

  const visibleTrades = trades
    .filter((trade) => {
      const matchesQuery = tradeSearchText(trade).includes(query.trim().toLowerCase());
      const matchesFilter = filter === "All" || listingCategory(trade) === filter;
      const isPrivateVisible =
        trade.visibility === "public" ||
        (currentUsername && trade.targetBuyerPiUsernames.includes(currentUsername)) ||
        isSeller(trade, currentUsername);

      return matchesQuery && matchesFilter && isPrivateVisible;
    })
    .sort((left, right) => {
      const priorityDelta = ledgerTradePriority(left) - ledgerTradePriority(right);

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    })
    .slice(0, 25);

  if (showActivity) {
    return (
      <section>
        <div className="sh">
          <span className="sh-t">{copy.publicLedger.liveActivity}</span>
          <button className="sh-a" type="button" onClick={() => setShowActivity(false)}>
            <X className="h-3.5 w-3.5" />
            {copy.publicLedger.close}
          </button>
        </div>
        <Timeline events={events.slice(0, 50)} title={copy.publicLedger.liveActivity} />
      </section>
    );
  }

  return (
    <section>
      <div className="srch">
        <Search className="h-4 w-4 text-slate-500" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.publicLedger.searchListings}
        />
        {query && (
          <button className="text-slate-500" type="button" onClick={() => setQuery("")}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="fps">
        {filters.map((item) => (
          <button
            key={item}
            className={`fp${filter === item ? " on" : ""}`}
            type="button"
            onClick={() => setFilter(item)}
          >
            {copy.publicLedger.filters[item]}
          </button>
        ))}
      </div>
      <div className="sh">
        <span className="sh-t">{copy.publicLedger.liveLedger}</span>
        <div className="flex items-center gap-3">
          <button className="sh-a" type="button" onClick={() => setShowActivity(true)}>
            {copy.publicLedger.activity}
          </button>
          <button className="sh-a" type="button" onClick={onRefresh}>
            <RefreshCcw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            {loading ? copy.publicLedger.refreshing : copy.publicLedger.refresh}
          </button>
        </div>
      </div>
      {visibleTrades.length === 0 ? (
        <EmptyState label={copy.publicLedger.noMatches} />
      ) : (
        <div className="cstack">
          {visibleTrades.map((trade) => (
            <button
              key={trade.id}
              className={`card ${statusToneClass(trade)} w-full text-left`}
              type="button"
              onClick={() => setSelectedTrade(trade)}
            >
              <CompactListingCard
                copy={copy}
                category={listingCategory(trade)}
                interests={tradeInterestsFor(trade, interests)}
                trade={trade}
              />
            </button>
          ))}
        </div>
      )}

      {selectedTrade && (
        <ExploreTradeSheet
          copy={copy}
          currentUsername={currentUsername}
          interests={interests}
          trade={selectedTrade}
          onClose={() => setSelectedTrade(null)}
          onDeclinePrivate={onDeclinePrivate}
          onSubmitInterest={onSubmitInterest}
        />
      )}
    </section>
  );
}

export function ProfileDesk({
  feedbackSending,
  feedbackStatus,
  language,
  loading,
  profile,
  payoutReadyLoading,
  telegram,
  telegramLoading,
  telegramPendingLink,
  trades,
  username,
  onConfirmPayoutReadiness,
  onLinkTelegram,
  onRefreshTelegram,
  onSubmitFeedback,
  onRefresh,
  onSignOut,
  onRequestVerifiedBadge,
  onUnlinkTelegram,
}: {
  feedbackSending: boolean;
  feedbackStatus: FeedbackStatus;
  language: LanguageCode;
  loading: boolean;
  profile: UserReputation | null;
  payoutReadyLoading: boolean;
  telegram: TelegramLinkStatus;
  telegramLoading: boolean;
  telegramPendingLink: boolean;
  trades: Trade[];
  username: string;
  onConfirmPayoutReadiness: () => void;
  onLinkTelegram: () => void;
  onRefreshTelegram: () => void;
  onSubmitFeedback: (event: FormEvent<HTMLFormElement>) => void;
  onRefresh: () => void;
  onSignOut: () => void;
  onRequestVerifiedBadge: () => void;
  onUnlinkTelegram: () => void;
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const copy = getWorkspaceCopy(language);

  if (!profile) {
    return <EmptyState label={copy.profile.profileNotReady} />;
  }

  const hasRequested = Boolean(profile.verificationRequestedAt);
  const userTrades = trades.filter(
    (trade) =>
      normalizeUsername(trade.sellerPiUsername) === username ||
      normalizeUsername(trade.buyerPiUsername ?? "") === username,
  );
  const achievements = buildReputationBadges(profile);
  const verificationEligible = canRequestVerifiedBadge(profile);

  return (
    <section className="grid gap-3">
      <section className={panelClass}>
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--purple),var(--gold))] text-[24px] font-black text-white shadow-[0_8px_22px_rgba(91,37,159,0.35)]">
            {profile.piUsername.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <VerifiedUsername
                className="truncate text-lg font-bold text-white"
                profile={profile}
                username={profile.piUsername}
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <TrustRing score={profile.trustScore} />
              <span className="text-xs text-slate-300">
                {copy.profile.trustScore(profile.trustScore)}
              </span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MiniProfileStat
            color="var(--gold)"
            label={copy.profile.trades}
            value={profile.buyCount + profile.sellCount}
          />
          <MiniProfileStat
            color="var(--ok)"
            label={copy.profile.done}
            value={profile.successfulTrades}
          />
          <MiniProfileStat
            color="var(--danger)"
            label={copy.admin.disputes}
            value={profile.disputedTrades}
          />
        </div>
      </section>

      <section className="mx-[14px] grid gap-3 sm:grid-cols-2">
        <section className="grid gap-3 rounded-2xl border border-white/10 bg-black/14 p-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-200">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-white">{copy.profile.telegramAlerts}</h3>
                <span className={`bdg ${telegram.linked ? "bo" : "bq"}`}>
                  {telegram.linked ? "Linked" : "Optional"}
                </span>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                Trade and dispute updates after leaving Pi Browser.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/14 p-3 text-sm leading-6 text-slate-300">
            {telegram.linked ? (
              <>
                Telegram is linked
                {telegram.telegramUsername ? ` to @${telegram.telegramUsername}` : ""}.
                {telegram.maskedChatId && (
                  <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Chat {telegram.maskedChatId}
                  </span>
                )}
              </>
            ) : telegramPendingLink ? (
              <>
                Finish linking inside Telegram.
                <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Return here and tap Check status.
                </span>
              </>
            ) : telegram.configured ? (
              <>Link @{telegram.botUsername || "PiScrow_bot"} from here for trade alerts.</>
            ) : (
              "Telegram alerts are not configured on this deployment yet."
            )}
          </div>
          <div className="grid gap-2">
            <button
              className={primaryButtonClass}
              disabled={telegramLoading || !telegram.configured}
              type="button"
              onClick={onLinkTelegram}
            >
              {telegramLoading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              {telegram.linked ? "Open bot" : "Link Telegram"}
            </button>
            <div className="grid gap-2 sm:grid-cols-2">
              {(telegram.linked || telegramPendingLink) && (
                <button
                  className={secondaryButtonClass}
                  disabled={telegramLoading}
                  type="button"
                  onClick={onRefreshTelegram}
                >
                  {telegramLoading ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                  Check status
                </button>
              )}
              {telegram.linked && (
                <button
                  className={secondaryButtonClass}
                  disabled={telegramLoading}
                  type="button"
                  onClick={onUnlinkTelegram}
                >
                  {telegramLoading ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                  Disconnect
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-3 rounded-2xl border border-white/10 bg-black/14 p-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-100">
              <HandCoins className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-white">{copy.profile.payoutReadiness}</h3>
                <span className={`bdg ${profile.payoutReady ? "bo" : "bp"}`}>
                  {profile.payoutReady ? "Ready" : "Required"}
                </span>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                Confirm once so PiScrow can send refunds and releases.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/14 p-3 text-sm leading-6 text-slate-300">
            {profile.payoutReady ? (
              <>
                Payout flow is enabled for this account.
                {profile.payoutReadinessConfirmedAt && (
                  <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Confirmed {dateLabel(profile.payoutReadinessConfirmedAt)}
                  </span>
                )}
              </>
            ) : (
              "Required before posting offers, showing interest, or funding a trade."
            )}
          </div>
          {!profile.payoutReady && (
            <button
              className={primaryButtonClass}
              disabled={payoutReadyLoading}
              type="button"
              onClick={onConfirmPayoutReadiness}
            >
              {payoutReadyLoading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {payoutReadyLoading ? "Saving readiness" : "Enable PiScrow payouts"}
            </button>
          )}
        </section>
      </section>

      <section className="mx-[14px] grid gap-3">
        <h3 className="text-sm font-bold text-slate-400">{copy.profile.achievementBadges}</h3>
        <div className="flex flex-wrap gap-2">
          {achievements.map((achievement) => (
            <span
              key={achievement.id}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${
                achievement.earned
                  ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                  : "border-white/10 bg-white/[0.04] text-slate-500"
              }`}
            >
              {achievement.earned ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-current opacity-60" />
              )}
              {reputationBadgeLabel(achievement.id)}
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] opacity-80">
                {achievement.progress}/{achievement.target}
              </span>
            </span>
          ))}
        </div>
      </section>

      <section className={panelClass}>
        <SettingsRow icon={<Languages className="h-4 w-4" />} label="Language" />
        <SettingsRow
          href="/rules"
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Rules & Privacy"
        />
        <SettingsRow
          icon={<MessageSquare className="h-4 w-4" />}
          label="Give feedback"
          onClick={() => setFeedbackOpen(true)}
        />
        <button
          className="fr w-full border-t border-white/8 text-left text-sm font-semibold text-slate-300"
          disabled={loading}
          type="button"
          onClick={onRefresh}
        >
          <span className="inline-flex items-center gap-2">
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {copy.profile.refreshProfile}
          </span>
          <ChevronRight className="h-4 w-4 text-slate-600" />
        </button>
        <button
          className="fr w-full border-t border-white/8 text-left text-sm font-semibold text-slate-300"
          disabled={loading || profile.verifiedBadge || hasRequested || !verificationEligible}
          type="button"
          onClick={onRequestVerifiedBadge}
        >
          <span className="inline-flex items-center gap-2">
            <BadgeCheck className="h-4 w-4" />
            {profile.verifiedBadge
              ? copy.profile.verifiedBadgeActive
              : hasRequested
                ? copy.profile.badgeRequestPending
                : copy.profile.requestVerifiedBadge}
          </span>
          <ChevronRight className="h-4 w-4 text-slate-600" />
        </button>
        <button
          className="fr w-full border-t border-white/8 text-left text-sm font-semibold text-rose-200"
          type="button"
          onClick={onSignOut}
        >
          <span className="inline-flex items-center gap-2">
            <LogOut className="h-4 w-4" />
            {copy.profile.signOut}
          </span>
          <ChevronRight className="h-4 w-4 text-slate-600" />
        </button>
        {!profile.verifiedBadge && !hasRequested && (
          <div className="border-t border-white/8 px-4 py-3 text-sm leading-6 text-slate-400">
            Complete {VERIFIED_BADGE_MIN_COMPLETED_TRADES} successful trades before
            requesting verification. {Math.min(profile.successfulTrades, VERIFIED_BADGE_MIN_COMPLETED_TRADES)}/
            {VERIFIED_BADGE_MIN_COMPLETED_TRADES} completed.
          </div>
        )}
        <div className="fr border-t border-white/8 text-sm font-semibold text-slate-300">
          <span className="inline-flex items-center gap-2">
            <Settings className="h-4 w-4" />
            {copy.profile.tradeHistory}
          </span>
          <span className="text-slate-500">{userTrades.length}</span>
        </div>
      </section>

      {feedbackOpen && (
        <BottomSheet onClose={() => setFeedbackOpen(false)}>
          <FeedbackForm
            sending={feedbackSending}
            status={feedbackStatus}
            onSubmit={onSubmitFeedback}
          />
        </BottomSheet>
      )}
    </section>
  );
}

export function AdminDesk({
  chatLoadingTradeId,
  chatMessages,
  chatRooms,
  currentUserId,
  language,
  trades,
  events,
  reviewLoadingTradeId,
  reviewRecommendations,
  verificationLoading,
  verificationRequests,
  onApproveVerification,
  onClaimChat,
  onOpenChat,
  onRefreshVerifications,
  onRunReview,
  onResolve,
}: {
  chatLoadingTradeId: string;
  chatMessages: TradeChatMessage[];
  chatRooms: TradeChatRoom[];
  currentUserId?: string;
  language: LanguageCode;
  trades: Trade[];
  events: TradeEvent[];
  reviewLoadingTradeId: string;
  reviewRecommendations: TradeReviewRecommendation[];
  verificationLoading: boolean;
  verificationRequests: UserReputation[];
  onApproveVerification: (request: UserReputation) => void;
  onClaimChat: (trade: Trade) => void;
  onOpenChat: (trade: Trade) => void;
  onRefreshVerifications: () => void;
  onRunReview: (trade: Trade) => void;
  onResolve: (trade: Trade, status: "Completed" | "Cancelled") => void;
}) {
  const copy = getWorkspaceCopy(language);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<UserReputation | null>(null);
  const resolvedEvents = events.filter((event) =>
    /complete|resolved|cancel/i.test(event.eventType),
  ).length;

  return (
    <section>
      <section className="sg">
        <Metric icon={<Eye className="h-5 w-5" />} label={copy.admin.totalTrades} value={events.length} />
        <Metric icon={<AlertTriangle className="h-5 w-5" />} label={copy.admin.disputes} value={trades.length} />
        <Metric icon={<CheckCircle2 className="h-5 w-5" />} label={copy.admin.resolved} value={resolvedEvents} />
      </section>

      <div className="sh">
        <span className="sh-t text-lg">{copy.admin.disputeQueue}</span>
        <span className="bdg bd2">{copy.admin.activeCount(trades.length)}</span>
      </div>

      {trades.length === 0 ? (
        <EmptyState label={copy.admin.noDisputes} />
      ) : (
        <div className="cstack">
          {trades.map((trade) => (
            <article key={trade.id} className="card border-l-4 border-l-rose-500">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={trade.status} />
                <Chip>{listingCategory(trade)}</Chip>
              </div>
              <h3 className="text-[17px] font-bold text-white">{trade.title}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-6 text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <span>Buyer:</span>
                  {trade.buyerPiUsername ? (
                    <VerifiedUsername
                      className="text-slate-300"
                      onClick={
                        trade.buyerProfile
                          ? () => setSelectedProfile(trade.buyerProfile ?? null)
                          : undefined
                      }
                      profile={trade.buyerProfile}
                      username={trade.buyerPiUsername}
                    />
                  ) : (
                    <span>{copy.admin.unselectedBuyer}</span>
                  )}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span>Seller:</span>
                  <VerifiedUsername
                    className="text-slate-300"
                    onClick={() =>
                      setSelectedProfile(
                        trade.sellerProfile ?? compactProfileForTrade(trade),
                      )
                    }
                    profile={trade.sellerProfile ?? compactProfileForTrade(trade)}
                    username={trade.sellerPiUsername}
                  />
                </span>
              </div>
              <div className="mt-3 flex items-end gap-2">
                <span className="pi text-lg">
                  {formatPiAmount(calculateBuyerTotal(trade.amountTestPi))}
                </span>
                <span className="pb-0.5 text-xs text-slate-500">{copy.admin.atStake}</span>
              </div>
              <button
                className="btn-p mt-4"
                type="button"
                onClick={() => {
                  setSelectedTrade(trade);
                }}
              >
                <ShieldCheck className="h-4 w-4" />
                {copy.admin.enterDisputeRoom}
              </button>
            </article>
          ))}
        </div>
      )}

      <VerificationQueue
        copy={copy}
        loading={verificationLoading}
        requests={verificationRequests}
        onApprove={onApproveVerification}
        onRefresh={onRefreshVerifications}
      />

      {selectedTrade && (
        <AdminTradeSheet
          copy={copy}
          currentUserId={currentUserId}
          loading={reviewLoadingTradeId === selectedTrade.id}
          recommendation={reviewRecommendations.find(
            (item) => item.tradeId === selectedTrade.id,
          )}
          trade={selectedTrade}
          chatLoading={chatLoadingTradeId === selectedTrade.id}
          chatMessages={chatMessages.filter(
            (message) => message.tradeId === selectedTrade.id,
          )}
          chatRoom={chatRooms.find((room) => room.tradeId === selectedTrade.id)}
          onClose={() => setSelectedTrade(null)}
          onClaimChat={onClaimChat}
          onOpenChat={onOpenChat}
          onResolve={onResolve}
          onRunReview={onRunReview}
        />
      )}
      {selectedProfile && (
        <PublicProfileSheet
          profile={selectedProfile}
          onClose={() => setSelectedProfile(null)}
        />
      )}
    </section>
  );
}

function CompactListingCard({
  copy,
  category,
  interests,
  trade,
}: {
  copy: WorkspaceCopy;
  category?: ListingCategory;
  interests: TradeInterest[];
  trade: Trade;
}) {
  const location = [trade.locationLabel, trade.locationArea].filter(Boolean).join(" / ");
  const profile = compactProfileForTrade(trade);

  return (
    <div className="min-w-0 overflow-hidden">
      <div className="mb-3 flex flex-wrap items-center gap-[5px]">
        <StatusBadge status={trade.status} />
        <Chip tone={trade.visibility === "private" ? "private" : "neutral"}>
          {tradeVisibilityLabels[trade.visibility]}
        </Chip>
        <Chip>{cardInterestLabel(interests.length || trade.interestCount)}</Chip>
        {trade.status === "PendingFunding" && <Chip>{fundingWindowLabel(trade)}</Chip>}
        {compactEscrowLabel(trade) && (
          <Chip tone={compactEscrowTone(trade)}>{compactEscrowLabel(trade)}</Chip>
        )}
      </div>
      <h3 className="break-words text-[16px] font-bold leading-snug text-white">
        {trade.title}
      </h3>
      <div className="mt-3 flex min-w-0 items-center gap-2">
        <VerifiedUsername
          className="min-w-0 break-words whitespace-normal text-sm text-slate-300"
          profile={profile}
          username={trade.sellerPiUsername}
        />
        <TrustRing score={profile.trustScore} />
      </div>
      <div className="mt-3 flex min-w-0 items-start gap-1 text-sm text-slate-500">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 break-words whitespace-normal">
          {location || copy.trade.locationNotProvided}
        </span>
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 text-[10px] uppercase tracking-[0.04em] text-slate-500">
            {copy.trade.buyerFunds}
          </div>
          <span className="pi text-lg">
            {formatPiAmount(calculateBuyerTotal(trade.amountTestPi))}
          </span>
        </div>
        <div className="inline-flex shrink-0 items-center gap-1 text-right text-sm text-slate-500">
          {copy.publicLedger.filters[category ?? listingCategory(trade)]}
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function ExploreTradeSheet({
  copy,
  currentUsername,
  interests,
  trade,
  onClose,
  onDeclinePrivate,
  onSubmitInterest,
}: {
  copy: WorkspaceCopy;
  currentUsername: string;
  interests: TradeInterest[];
  trade: Trade;
  onClose: () => void;
  onDeclinePrivate?: (trade: Trade) => void;
  onSubmitInterest?: (trade: Trade, event: FormEvent<HTMLFormElement>) => void;
}) {
  const profile = compactProfileForTrade(trade);
  const tradeInterests = tradeInterestsFor(trade, interests);
  const userInterest = userInterestFor(
    trade,
    interests,
    currentUsername,
  );
  const ownOffer = isSeller(trade, currentUsername);
  const selectedForUser = isSelectedBuyer(trade, currentUsername);
  const [selectedProfile, setSelectedProfile] = useState<UserReputation | null>(null);
  const isPrivateRequest =
    trade.visibility === "private" &&
    currentUsername &&
    trade.targetBuyerPiUsernames.includes(currentUsername);
  const canSubmitInterest = Boolean(
    onSubmitInterest && currentUsername && trade.status === "Draft" && !userInterest && !ownOffer,
  );

  return (
    <BottomSheet onClose={onClose}>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge status={trade.status} />
        <Chip>{trade.visibility}</Chip>
      </div>
      <h2 className="text-2xl font-black leading-tight text-white">{trade.title}</h2>

      <section className="mt-5 flex items-center gap-3 rounded-2xl border border-white/8 bg-black/14 p-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--purple),var(--gold))] text-lg font-black text-white">
          {trade.sellerPiUsername.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <VerifiedUsername
            className="truncate font-bold text-white"
            onClick={() => setSelectedProfile(profile)}
            profile={profile}
            username={trade.sellerPiUsername}
          />
          <p className="mt-1 text-xs text-slate-500">
            {copy.trade.interestedBuyers(tradeInterests.length)}
          </p>
        </div>
        <TrustRing score={profile.trustScore} size={42} />
      </section>

      <LocationLine trade={trade} />
      <TradeEconomics trade={trade} />
      <TradeTransactionPanel trade={trade} />
      <p className="text-sm leading-7 text-slate-300">{trade.description}</p>
      <TextBlock label={copy.trade.deliveryTerms} value={trade.deliveryTerms} />
      {trade.deliveryProofNote && (
        <TextBlock label={copy.trade.sellerPackageProof} value={trade.deliveryProofNote} />
      )}
      {trade.deliveryProofUrl && (
        <ProofLink label={copy.trade.sellerProofImage} url={trade.deliveryProofUrl} />
      )}
      {trade.buyerReceiptNote && (
        <TextBlock label={copy.trade.buyerReceiptProof} value={trade.buyerReceiptNote} />
      )}
      {trade.buyerReceiptProofUrl && (
        <ProofLink label={copy.trade.buyerReceiptImage} url={trade.buyerReceiptProofUrl} />
      )}

      {ownOffer && (
        <InfoBox tone="warning">{copy.trade.ownListingInfo}</InfoBox>
      )}

      {userInterest && (
        <InfoBox tone="info">{copy.trade.yourResponse(userInterest.status)}</InfoBox>
      )}

      {selectedForUser && trade.status === "PendingFunding" && (
        <div className="grid gap-3">
          <InfoBox tone={selectionExpired(trade) ? "danger" : "success"}>
            {fundingWindowLabel(trade)}
          </InfoBox>
        </div>
      )}

      {isPrivateRequest && !userInterest && onDeclinePrivate && (
        <button className={secondaryButtonClass} type="button" onClick={() => onDeclinePrivate(trade)}>
          {copy.trade.declinePrivateRequest}
        </button>
      )}

      {canSubmitInterest && (
        <form className="grid gap-3" onSubmit={(event) => onSubmitInterest?.(trade, event)}>
          <textarea
            className={textareaClass}
            name="responseNote"
            placeholder={copy.trade.optionalBuyerNote}
          />
          <button className={primaryButtonClass} type="submit">
            <Send className="h-4 w-4" />
            {copy.trade.submitInterest}
          </button>
        </form>
      )}
      {selectedProfile && (
        <PublicProfileSheet
          profile={selectedProfile}
          onClose={() => setSelectedProfile(null)}
        />
      )}
    </BottomSheet>
  );
}

function TradeDetailSheet({
  copy,
  chatLoading,
  chatMessages,
  chatRoom,
  currentUsername,
  currentUserId,
  interests,
  paymentState,
  trade,
  onClose,
  onConfirm,
  onGenerateHandoffCode,
  onDeleteTrade,
  onDeclinePrivate,
  onFund,
  onRevealHandoffCode,
  onOpenChat,
  onOpenDispute,
  onSubmitInterest,
}: {
  copy: WorkspaceCopy;
  chatLoading: boolean;
  chatMessages: TradeChatMessage[];
  chatRoom?: TradeChatRoom;
  currentUsername: string;
  currentUserId?: string;
  interests: TradeInterest[];
  paymentState: string;
  trade: Trade;
  onClose: () => void;
  onConfirm: (trade: Trade, event: FormEvent<HTMLFormElement>) => void;
  onGenerateHandoffCode: (trade: Trade) => void;
  onDeleteTrade: (trade: Trade) => void;
  onDeclinePrivate: (trade: Trade) => void;
  onFund: (trade: Trade) => void;
  onRevealHandoffCode: (trade: Trade) => void;
  onOpenChat: (trade: Trade) => void;
  onOpenDispute: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitInterest: (trade: Trade, event: FormEvent<HTMLFormElement>) => void;
}) {
  const selectedForUser = isSelectedBuyer(trade, currentUsername);
  const userInterest = userInterestFor(trade, interests, currentUsername);
  const ownOffer = isSeller(trade, currentUsername);
  const sellerProfile = compactProfileForTrade(trade);
  const [selectedProfile, setSelectedProfile] = useState<UserReputation | null>(null);
  const isPrivateRequest =
    trade.visibility === "private" &&
    currentUsername &&
    trade.targetBuyerPiUsernames.includes(currentUsername);
  const canSubmitInterest =
    trade.status === "Draft" && !userInterest && !ownOffer && Boolean(currentUsername);

  return (
    <BottomSheet onClose={onClose}>
      <SheetTradeHeader trade={trade} />
      <TradeEconomics trade={trade} />
      <TradeTransactionPanel trade={trade} emphasis={selectedForUser ? "buyer" : "neutral"} />
      <InfoBox tone="info">{paymentState}</InfoBox>
      <section className="rounded-2xl border border-white/10 bg-black/14 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Seller profile
            </p>
            <div className="mt-1 flex items-center gap-2">
              <VerifiedUsername
                className="font-bold text-white"
                onClick={() => setSelectedProfile(sellerProfile)}
                profile={sellerProfile}
                username={trade.sellerPiUsername}
              />
              <TrustChip profile={sellerProfile} />
            </div>
          </div>
          <button
            className="sh-a"
            type="button"
            onClick={() => setSelectedProfile(sellerProfile)}
          >
            View
          </button>
        </div>
      </section>
      {trade.deliveryProofNote && (
        <TextBlock label={copy.trade.sellerPackageProof} value={trade.deliveryProofNote} />
      )}
      {trade.deliveryProofUrl && (
        <ProofLink label={copy.trade.sellerProofImage} url={trade.deliveryProofUrl} />
      )}
      {trade.buyerReceiptNote && (
        <TextBlock label={copy.trade.buyerReceiptProof} value={trade.buyerReceiptNote} />
      )}
      {trade.buyerReceiptProofUrl && (
        <ProofLink label={copy.trade.buyerReceiptImage} url={trade.buyerReceiptProofUrl} />
      )}

      {selectedForUser && trade.status === "PendingFunding" && (
        <button
          className={successButtonClass}
          disabled={selectionExpired(trade)}
          type="button"
          onClick={() => onFund(trade)}
        >
          <HandCoins className="h-4 w-4" />
          {copy.escrowTracker.fund(formatTestPi(calculateBuyerTotal(trade.amountTestPi)))}
        </button>
      )}

      {isPrivateRequest && !userInterest && (
        <button
          className={secondaryButtonClass}
          type="button"
          onClick={() => onDeclinePrivate(trade)}
        >
          {copy.trade.declinePrivateRequest}
        </button>
      )}

      {canSubmitInterest && (
        <form className="grid gap-3" onSubmit={(event) => onSubmitInterest(trade, event)}>
          <textarea
            className={textareaClass}
            name="responseNote"
            placeholder={copy.trade.optionalBuyerNote}
          />
          <button className={primaryButtonClass} type="submit">
            <Send className="h-4 w-4" />
            {copy.trade.submitInterest}
          </button>
        </form>
      )}

      {selectedForUser && trade.status === "DeliverySubmitted" && (
        <ReceiptForm trade={trade} onConfirm={onConfirm} />
      )}

      {selectedForUser && trade.status === "Funded" && (
        <BuyerHandoffCodePanel
          trade={trade}
          onGenerate={onGenerateHandoffCode}
          onReveal={onRevealHandoffCode}
        />
      )}

      {selectedForUser && ["Completed", "Cancelled"].includes(trade.status) && (
        <button className={dangerButtonClass} type="button" onClick={() => onDeleteTrade(trade)}>
          <Trash2 className="h-4 w-4" />
          {copy.trade.deleteTrade}
        </button>
      )}

      <TradeChatPanel
        copy={copy}
        currentUserId={currentUserId}
        loading={chatLoading}
        messages={chatMessages}
        room={chatRoom}
        trade={trade}
        onOpen={onOpenChat}
      />

      {canReportTrade(trade, currentUsername) && (
        <DisputeForm trade={trade} onOpenDispute={onOpenDispute} />
      )}
      {tradeInterestsFor(trade, interests).length > 0 && (
        <TextBlock
          label={copy.trade.buyerResponses}
          value={copy.trade.connectedResponses(tradeInterestsFor(trade, interests).length)}
        />
      )}
      {selectedProfile && (
        <PublicProfileSheet
          profile={selectedProfile}
          onClose={() => setSelectedProfile(null)}
        />
      )}
    </BottomSheet>
  );
}

function SellerTradeSheet({
  copy,
  chatLoading,
  chatMessages,
  chatRoom,
  currentUsername,
  currentUserId,
  interests,
  trade,
  onClose,
  onDeleteOffer,
  onOpenChat,
  onOpenDispute,
  onSelectInterest,
  onRequestRelease,
  onVerifyHandoffCode,
}: {
  copy: WorkspaceCopy;
  chatLoading: boolean;
  chatMessages: TradeChatMessage[];
  chatRoom?: TradeChatRoom;
  currentUsername: string;
  currentUserId?: string;
  interests: TradeInterest[];
  trade: Trade;
  onClose: () => void;
  onDeleteOffer: (trade: Trade) => void;
  onOpenChat: (trade: Trade) => void;
  onOpenDispute: (event: FormEvent<HTMLFormElement>) => void;
  onSelectInterest: (trade: Trade, interest: TradeInterest) => void;
  onRequestRelease: (trade: Trade, note: string) => void;
  onVerifyHandoffCode: (trade: Trade, code: string) => void;
}) {
  const tradeInterests = tradeInterestsFor(trade, interests);
  const [selectedProfile, setSelectedProfile] = useState<UserReputation | null>(null);

  return (
    <BottomSheet onClose={onClose}>
      <SheetTradeHeader trade={trade} />
      <TradeEconomics trade={trade} />
      <TradeTransactionPanel trade={trade} emphasis="seller" />
      {trade.deliveryProofNote && (
        <TextBlock label={copy.trade.sellerPackageProof} value={trade.deliveryProofNote} />
      )}
      {trade.deliveryProofUrl && (
        <ProofLink label={copy.trade.sellerProofImage} url={trade.deliveryProofUrl} />
      )}
      {trade.buyerReceiptNote && (
        <TextBlock label={copy.trade.buyerReceiptProof} value={trade.buyerReceiptNote} />
      )}
      {trade.buyerReceiptProofUrl && (
        <ProofLink label={copy.trade.buyerReceiptImage} url={trade.buyerReceiptProofUrl} />
      )}

      {(trade.status === "Draft" || ["Completed", "Cancelled"].includes(trade.status)) && (
        <button className={dangerButtonClass} type="button" onClick={() => onDeleteOffer(trade)}>
          <Trash2 className="h-4 w-4" />
          {trade.status === "Draft" ? copy.trade.deleteOffer : copy.trade.deleteTrade}
        </button>
      )}

      <section className="grid gap-3">
        <h3 className="font-bold text-white">{copy.trade.buyerResponses}</h3>
        {tradeInterests.length === 0 ? (
          <InfoBox tone="info">{copy.trade.noBuyerResponses}</InfoBox>
        ) : (
          tradeInterests.map((interest) => (
            <article
              key={interest.id}
              className="grid gap-3 rounded-xl border border-white/10 bg-black/16 p-3"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <VerifiedUsername
                    className="font-black text-white"
                    onClick={
                      interest.buyerProfile
                        ? () => setSelectedProfile(interest.buyerProfile ?? null)
                        : undefined
                    }
                    profile={interest.buyerProfile}
                    username={interest.buyerPiUsername}
                  />
                  {interest.buyerProfile && <TrustChip profile={interest.buyerProfile} />}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {interest.responseNote}
                </p>
                <p className="mt-2 text-xs font-bold uppercase text-slate-500">
                  {interest.status}
                  {trade.status === "PendingFunding" && trade.selectedInterestId === interest.id
                    ? ` / ${fundingWindowLabel(trade)}`
                    : ""}
                </p>
              </div>
              {((trade.status === "Draft" && interest.status === "Open") ||
                (trade.status === "PendingFunding" &&
                  !selectionExpired(trade) &&
                  interest.status !== "Withdrawn")) &&
                trade.selectedInterestId !== interest.id && (
                  <button
                    className={primaryButtonClass}
                    type="button"
                    onClick={() => onSelectInterest(trade, interest)}
                  >
                    {trade.status === "PendingFunding" ? copy.trade.changeBuyer : copy.trade.selectBuyer}
                  </button>
                )}
              {trade.status === "PendingFunding" &&
                selectionExpired(trade) &&
                trade.selectedInterestId !== interest.id &&
                interest.status !== "Withdrawn" && (
                  <button
                    className={primaryButtonClass}
                    type="button"
                    onClick={() => onSelectInterest(trade, interest)}
                  >
                    {copy.trade.reselectBuyer}
                  </button>
                )}
            </article>
          ))
        )}
      </section>

      {trade.status === "DeliverySubmitted" && (
        <RequestReleaseForm trade={trade} onRequestRelease={onRequestRelease} />
      )}

      {trade.status === "Funded" && trade.handoffCode?.status === "active" && (
        <SellerHandoffCodePanel trade={trade} onVerify={onVerifyHandoffCode} />
      )}

      <TradeChatPanel
        copy={copy}
        currentUserId={currentUserId}
        loading={chatLoading}
        messages={chatMessages}
        room={chatRoom}
        trade={trade}
        onOpen={onOpenChat}
      />

      {canReportTrade(trade, currentUsername) && (
        <DisputeForm trade={trade} onOpenDispute={onOpenDispute} />
      )}

      {selectedProfile && (
        <PublicProfileSheet
          profile={selectedProfile}
          onClose={() => setSelectedProfile(null)}
        />
      )}
    </BottomSheet>
  );
}

function AdminTradeSheet({
  copy,
  chatLoading,
  chatMessages,
  chatRoom,
  currentUserId,
  loading,
  recommendation,
  trade,
  onClose,
  onClaimChat,
  onOpenChat,
  onResolve,
  onRunReview,
}: {
  copy: WorkspaceCopy;
  chatLoading: boolean;
  chatMessages: TradeChatMessage[];
  chatRoom?: TradeChatRoom;
  currentUserId?: string;
  loading: boolean;
  recommendation?: TradeReviewRecommendation;
  trade: Trade;
  onClose: () => void;
  onClaimChat: (trade: Trade) => void;
  onOpenChat: (trade: Trade) => void;
  onResolve: (trade: Trade, status: "Completed" | "Cancelled") => void;
  onRunReview: (trade: Trade) => void;
}) {
  return (
    <BottomSheet onClose={onClose}>
      <SheetTradeHeader trade={trade} />
      <TradeEconomics trade={trade} />
      <TradeTransactionPanel trade={trade} emphasis="admin" />
      <ReviewRecommendationPanel
        copy={copy}
        loading={loading}
        recommendation={recommendation}
        trade={trade}
        onRunReview={onRunReview}
      />
      <TradeChatPanel
        copy={copy}
        adminMode
        currentUserId={currentUserId}
        loading={chatLoading}
        messages={chatMessages}
        room={chatRoom}
        trade={trade}
        onClaim={onClaimChat}
        onOpen={onOpenChat}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <button className={successButtonClass} type="button" onClick={() => onResolve(trade, "Completed")}>
          {copy.admin.releaseToSeller}
        </button>
        <button className={secondaryButtonClass} type="button" onClick={() => onResolve(trade, "Cancelled")}>
          {copy.admin.refundBuyer}
        </button>
      </div>
    </BottomSheet>
  );
}

function BottomSheet({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    document.body.classList.add("overlay-open");

    return () => {
      document.body.classList.remove("overlay-open");
    };
  }, []);

  return (
    <div className="bs-wrap" role="dialog" aria-modal="true">
      <button aria-label="Close detail" className="bs-bg" type="button" onClick={onClose} />
      <section className="bs grid gap-4">
        <div className="bs-h" />
        <button
          aria-label="Close"
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/6 text-slate-300"
          type="button"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </section>
    </div>
  );
}

function SheetTradeHeader({ trade }: { trade: Trade }) {
  return (
    <section className="grid gap-3 pr-10">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={trade.status} />
        <Chip>{trade.visibility}</Chip>
      </div>
      <h2 className="text-2xl font-black leading-tight text-white">{trade.title}</h2>
      <LocationLine trade={trade} />
    </section>
  );
}

function LocationLine({ trade }: { trade: Trade }) {
  const location = [trade.locationLabel, trade.locationArea].filter(Boolean).join(" / ");

  if (!location) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-start gap-2 text-sm text-slate-400">
      <MapPin className="h-4 w-4 shrink-0 text-[var(--gold)]" />
      <span className="min-w-0 break-words whitespace-normal">{location}</span>
    </div>
  );
}

function EscrowTrackerCard({
  copy,
  loading,
  trade,
  onChat,
  onDetails,
  onFund,
}: {
  copy: WorkspaceCopy;
  loading: boolean;
  trade: Trade;
  onChat: () => void;
  onDetails: () => void;
  onFund: () => void;
}) {
  const steps = [
    { label: copy.escrowTracker.offerAccepted, done: true },
    { label: copy.escrowTracker.fundEscrow, done: ["Funded", "DeliverySubmitted", "AwaitingRelease", "Disputed", "Completed"].includes(trade.status) },
    { label: copy.escrowTracker.deliveryInProgress, done: ["DeliverySubmitted", "AwaitingRelease", "Disputed", "Completed"].includes(trade.status) },
    { label: copy.escrowTracker.adminReleaseReview, done: ["AwaitingRelease", "Completed"].includes(trade.status) },
    { label: copy.escrowTracker.releaseFunds, done: trade.status === "Completed" },
  ];
  const canFund = trade.status === "PendingFunding" && !selectionExpired(trade);
  const canOpenChat = [
    "Funded",
    "DeliverySubmitted",
    "AwaitingRelease",
    "Disputed",
    "Completed",
    "Cancelled",
  ].includes(trade.status);

  return (
    <article className={`card ${statusToneClass(trade)} grid gap-4`}>
      <button className="text-left" type="button" onClick={onDetails}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={trade.status} />
          {trade.status === "PendingFunding" && <Chip>{fundingWindowLabel(trade)}</Chip>}
          {trade.status === "Funded" && trade.deliveryDueAt && (
            <Chip tone={deliveryWindowExpired(trade) ? "danger" : "info"}>
              {deliveryDeadlineChipLabel(trade)}
            </Chip>
          )}
        </div>
        <h3 className="text-[17px] font-black leading-tight text-white">{trade.title}</h3>
        <LocationLine trade={trade} />
        <div className="mt-3 flex items-end gap-2">
          <span className="pi text-lg">{formatPiAmount(calculateBuyerTotal(trade.amountTestPi))}</span>
          <span className="pb-0.5 text-xs text-slate-500">{copy.escrowTracker.escrowTotal}</span>
        </div>
      </button>
      <div className="grid gap-2">
        {steps.map((step, index) => (
          <div key={step.label} className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-black ${
                step.done
                  ? "border-emerald-300/40 bg-emerald-400/14 text-emerald-200"
                  : "border-white/10 bg-white/5 text-slate-500"
              }`}
            >
              {step.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">{step.label}</p>
              <p className="text-xs leading-5 text-slate-500">
                {step.done ? copy.escrowTracker.completedOrActive : copy.escrowTracker.waitingForNextAction}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          className={secondaryButtonClass}
          disabled={!canOpenChat}
          title={!canOpenChat ? copy.escrowTracker.chatAfterFunding : undefined}
          type="button"
          onClick={onChat}
        >
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
          {copy.escrowTracker.chat}
        </button>
        <button
          className={canFund ? successButtonClass : primaryButtonClass}
          disabled={
            !canFund &&
            !["DeliverySubmitted", "AwaitingRelease"].includes(trade.status)
          }
          type="button"
          onClick={canFund ? onFund : onDetails}
        >
          <HandCoins className="h-4 w-4" />
          {canFund
            ? copy.escrowTracker.fund(formatTestPi(calculateBuyerTotal(trade.amountTestPi)))
            : ["DeliverySubmitted", "AwaitingRelease"].includes(trade.status)
              ? copy.escrowTracker.reviewProof
              : copy.escrowTracker.inProgress}
        </button>
      </div>
    </article>
  );
}

function TradeChatPanel({
  copy,
  adminMode = false,
  currentUserId,
  loading,
  messages,
  room,
  trade,
  onClaim,
  onOpen,
}: {
  copy: WorkspaceCopy;
  adminMode?: boolean;
  currentUserId?: string;
  loading: boolean;
  messages: TradeChatMessage[];
  room?: TradeChatRoom;
  trade: Trade;
  onClaim?: (trade: Trade) => void;
  onOpen: (trade: Trade) => void;
}) {
  const chatAvailable = [
    "Funded",
    "DeliverySubmitted",
    "AwaitingRelease",
    "Disputed",
    "Completed",
    "Cancelled",
  ].includes(trade.status);
  const claimedByMe = Boolean(
    room?.claimedAdminUserId &&
      currentUserId &&
      room.claimedAdminUserId === currentUserId,
  );
  const claimedByOther = Boolean(
    room?.claimedAdminUserId &&
      (!currentUserId || room.claimedAdminUserId !== currentUserId),
  );
  const canSend =
    chatAvailable &&
    !["Completed", "Cancelled"].includes(trade.status) &&
    (!adminMode || claimedByMe);
  const [selectedProfile, setSelectedProfile] = useState<UserReputation | null>(null);
  const latestMessage = messages[messages.length - 1];
  const latestMessageProfile = latestMessage
    ? latestMessage.senderProfile ??
      profileForTradeParticipant(trade, latestMessage.senderPiUsername)
    : undefined;

  if (!chatAvailable) {
    return null;
  }

  return (
    <>
      <ActionPanel title={copy.chat.title} icon={<MessageSquare className="h-4 w-4" />}>
        <InfoBox tone={trade.status === "Disputed" ? "danger" : "info"}>
          {trade.status === "Disputed"
            ? copy.chat.disputeActive
            : copy.chat.tradeRoomInfo}
        </InfoBox>
        <div className="grid gap-2 rounded-2xl border border-white/10 bg-black/16 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-white">
                {room ? copy.chat.secureRoomReady : copy.chat.secureRoomOnDemand}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                {messages.length > 0
                  ? copy.chat.messagesRecorded(messages.length)
                  : copy.chat.noMessages}
              </p>
            </div>
            <span className={`bdg ${trade.status === "Disputed" ? "bd2" : "bv"}`}>
              {trade.status === "Disputed" ? copy.chat.disputeRoom : copy.chat.tradeRoom}
            </span>
          </div>
          {latestMessage && (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-sm leading-6 text-slate-300">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                {copy.chat.latestUpdate}
              </p>
              <div className="mt-2">
                <VerifiedUsername
                  className="font-semibold text-white"
                  onClick={
                    latestMessageProfile
                      ? () => setSelectedProfile(latestMessageProfile)
                      : undefined
                  }
                  profile={latestMessageProfile}
                  username={latestMessage.senderPiUsername}
                />
              </div>
              <p className="mt-1 text-slate-300">
                {latestMessage.body || copy.chat.proofImageUploaded}
              </p>
            </div>
          )}
        </div>
        {adminMode && room && (
          <div className="rounded-2xl border border-white/10 bg-black/16 p-3 text-sm leading-6 text-slate-300">
            {room.claimedAdminPiUsername
              ? copy.chat.claimedBy(room.claimedAdminPiUsername)
              : trade.status === "AwaitingRelease"
                ? copy.chat.noReleaseRoomAdmin
                : copy.chat.noDisputeRoomAdmin}
          </div>
        )}
        <div className="flex gap-2">
          <button
            className={secondaryButtonClass}
            disabled={loading}
            type="button"
            onClick={() => onOpen(trade)}
          >
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            {room ? copy.chat.openFullConversation : copy.chat.openSecureChat}
          </button>
          {adminMode && !claimedByMe && !claimedByOther && onClaim && (
            <button className={primaryButtonClass} disabled={loading} type="button" onClick={() => onClaim(trade)}>
              <ShieldCheck className="h-4 w-4" />
              {copy.chat.joinRoom}
            </button>
          )}
        </div>
        {claimedByOther && adminMode && (
          <InfoBox tone="warning">
            {trade.status === "AwaitingRelease"
              ? copy.chat.anotherAdminRelease
              : copy.chat.anotherAdminDispute}
          </InfoBox>
        )}
        <p className="text-sm leading-6 text-slate-500">
          {canSend
            ? copy.chat.openFullScreenHelp
            : copy.chat.readOnlyHelp}
        </p>
      </ActionPanel>
      {selectedProfile && (
        <PublicProfileSheet
          profile={selectedProfile}
          onClose={() => setSelectedProfile(null)}
        />
      )}
    </>
  );
}

function FeedbackForm({
  sending,
  status,
  onSubmit,
}: {
  sending: boolean;
  status: FeedbackStatus;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="grid gap-3" onSubmit={onSubmit}>
      <div className="flex items-start gap-3 pr-10">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(245,166,35,0.12)] text-[var(--gold)]">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-black text-white">Give feedback</h2>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            Send issues, ideas, or improvement notes to the developer.
          </p>
        </div>
      </div>
      <label className="grid gap-2">
        <span className={sectionEyebrowClass}>Type</span>
        <select className={inputClass} defaultValue="suggestion" name="category">
          <option value="suggestion">Suggestion</option>
          <option value="improvement">Improvement</option>
          <option value="issue">Issue</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label>
        <span className={sectionEyebrowClass}>Message</span>
        <textarea
          className={textareaClass}
          maxLength={1500}
          name="message"
          placeholder="What should PiScrow improve, fix, or add next?"
        />
      </label>
      <label>
        <span className={sectionEyebrowClass}>Email for reply</span>
        <input className={inputClass} name="contactEmail" placeholder="Optional" type="email" />
      </label>
      <button className={primaryButtonClass} disabled={sending} type="submit">
        {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {sending ? "Sending" : "Send feedback"}
      </button>
      {status && (
        <p
          className={`rounded-xl border px-3 py-2 text-sm font-semibold leading-6 ${
            status.tone === "success"
              ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
              : "border-rose-400/25 bg-rose-500/10 text-rose-200"
          }`}
          role="status"
        >
          {status.message}
        </p>
      )}
    </form>
  );
}

function ReceiptForm({
  trade,
  onConfirm,
}: {
  trade: Trade;
  onConfirm: (trade: Trade, event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <ActionPanel title="Receipt Proof" icon={<CheckCircle2 className="h-4 w-4" />}>
      <form className="grid gap-3" onSubmit={(event) => onConfirm(trade, event)}>
        <textarea
          className={textareaClass}
          name="buyerReceiptNote"
          placeholder="Confirm what you received and whether the package matches."
        />
        <input
          className={inputClass}
          name="buyerReceiptProofUrl"
          placeholder="Optional receipt proof URL"
          type="url"
        />
        <ProofFileInput label="Receipt image" name="buyerReceiptImage" />
        <button className={primaryButtonClass} type="submit">
          <CheckCircle2 className="h-4 w-4" />
          Confirm receipt
        </button>
      </form>
    </ActionPanel>
  );
}

function BuyerHandoffCodePanel({
  trade,
  onGenerate,
  onReveal,
}: {
  trade: Trade;
  onGenerate: (trade: Trade) => void;
  onReveal: (trade: Trade) => void;
}) {
  const active = trade.handoffCode?.status === "active";

  return (
    <ActionPanel title="Local Handoff Code" icon={<ShieldCheck className="h-4 w-4" />}>
      <InfoBox tone="info">
        Use this only for in-person handoffs after buyer funding is already locked in escrow.
      </InfoBox>
      {trade.handoffCode ? (
        <div className="rounded-2xl border border-white/8 bg-black/14 p-3 text-sm leading-6 text-slate-300">
          <p className="font-bold text-white">
            {active ? "Active one-time code" : humanizeUnderscore(trade.handoffCode.status)}
          </p>
          <p className="mt-1">{trade.handoffCode.maskedCode}</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Expires {dateLabel(trade.handoffCode.expiresAt)}
          </p>
        </div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <button className={primaryButtonClass} type="button" onClick={() => onGenerate(trade)}>
          <ShieldCheck className="h-4 w-4" />
          {active ? "Regenerate code" : "Generate code"}
        </button>
        <button
          className={secondaryButtonClass}
          disabled={!active}
          type="button"
          onClick={() => onReveal(trade)}
        >
          <Eye className="h-4 w-4" />
          Show code
        </button>
      </div>
    </ActionPanel>
  );
}

function RequestReleaseForm({
  trade,
  onRequestRelease,
}: {
  trade: Trade;
  onRequestRelease: (trade: Trade, note: string) => void;
}) {
  return (
    <ActionPanel title="Request Seller Payout" icon={<HandCoins className="h-4 w-4" />}>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          onRequestRelease(trade, String(formData.get("sellerReleaseNote") ?? ""));
          event.currentTarget.reset();
        }}
      >
        <textarea
          className={textareaClass}
          name="sellerReleaseNote"
          placeholder="Add a short note for admin review before payout release."
        />
        <button className={primaryButtonClass} type="submit">
          <HandCoins className="h-4 w-4" />
          Request payout release
        </button>
      </form>
    </ActionPanel>
  );
}

function SellerHandoffCodePanel({
  trade,
  onVerify,
}: {
  trade: Trade;
  onVerify: (trade: Trade, code: string) => void;
}) {
  return (
    <ActionPanel title="Verify Buyer Code" icon={<ShieldCheck className="h-4 w-4" />}>
      <InfoBox tone="warning">
        Enter the buyer's one-time handoff code only after the in-person exchange is complete.
      </InfoBox>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          onVerify(trade, String(formData.get("handoffCode") ?? ""));
        }}
      >
        <input
          className={inputClass}
          name="handoffCode"
          placeholder="ABCD-EFGH-IJKL-MNOP-QRST"
          type="text"
        />
        <button className={primaryButtonClass} type="submit">
          <ShieldCheck className="h-4 w-4" />
          Verify and release escrow
        </button>
      </form>
    </ActionPanel>
  );
}

function DisputeForm({
  trade,
  onOpenDispute,
}: {
  trade: Trade;
  onOpenDispute: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <ActionPanel title="Report This Trade" icon={<AlertTriangle className="h-4 w-4" />}>
      <InfoBox tone="danger">
        Reporting freezes this trade and sends its proof, payment state, and
        timeline to admin review.
      </InfoBox>
      <form className="grid gap-3" onSubmit={onOpenDispute}>
        <input name="tradeId" type="hidden" value={trade.id} />
        <textarea
          className={textareaClass}
          name="reason"
          placeholder={`Why should ${trade.title} be reviewed?`}
        />
        <input className={inputClass} name="evidenceNote" placeholder="Optional evidence note" />
        <button className={dangerButtonClass} type="submit">
          Freeze and report trade
        </button>
      </form>
    </ActionPanel>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="sc">
      <div className="mx-auto mb-1 flex h-6 w-6 items-center justify-center text-slate-500">
        {icon}
      </div>
      <div className="sc-v text-white">{value}</div>
      <div className="sc-l">{label}</div>
    </div>
  );
}

function MiniProfileStat({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number | string;
}) {
  return (
    <div className="text-center">
      <div className="mb-0.5 text-xl font-black" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}

function TrustRing({ score, size = 34 }: { score: number; size?: number }) {
  const radius = (size - 5) / 2;
  const circumference = 2 * Math.PI * radius;
  const stroke = (Math.max(0, Math.min(score, 100)) / 100) * circumference;
  const color =
    score >= 85 ? "var(--ok)" : score >= 70 ? "var(--warn)" : "var(--danger)";

  return (
    <span className="relative inline-flex shrink-0 items-center justify-center">
      <svg height={size} style={{ transform: "rotate(-90deg)" }} width={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="2.5"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={color}
          strokeDasharray={`${stroke} ${circumference}`}
          strokeLinecap="round"
          strokeWidth="2.5"
        />
      </svg>
      <span className="absolute text-[9px] font-black" style={{ color }}>
        {score}
      </span>
    </span>
  );
}

function TrustChip({ profile }: { profile: UserReputation }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 text-xs font-black text-emerald-100">
      {profile.verifiedBadge ? <BadgeCheck className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5" />}
      {profile.trustScore}% trust
    </span>
  );
}

function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "danger" | "info" | "neutral" | "private" | "success" | "warning";
}) {
  const classes = {
    danger: "bd2",
    info: "border border-sky-400/22 bg-sky-500/12 text-sky-100",
    neutral: "bq",
    private: "bv",
    success: "bo",
    warning: "bp",
  };

  return <span className={`bdg ${classes[tone]}`}>{children}</span>;
}

function TradeEconomics({ trade }: { trade: Trade }) {
  const payment = trade.payment;
  const fee = payment?.platformFeeTestPi ?? calculatePlatformFee(trade.amountTestPi);
  const sellerReceivable =
    payment?.sellerAmountTestPi ?? calculateSellerReceivable(trade.amountTestPi);
  const buyerTotal =
    payment?.buyerTotalTestPi ?? calculateBuyerTotal(trade.amountTestPi);

  return (
    <dl className="grid gap-3 rounded-2xl border border-white/10 bg-black/16 p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-slate-400">Seller receives</dt>
        <dd className="font-black text-white">
          {formatTestPi(sellerReceivable)}
        </dd>
      </div>
      <div className="flex items-center justify-between gap-3">
        <dt className="text-slate-400">PiScrow fee ({feePercentLabel()})</dt>
        <dd className="font-black text-slate-500">{formatTestPi(fee)}</dd>
      </div>
      <div className="h-px bg-white/8" />
      <div className="flex items-center justify-between gap-3">
        <dt className="text-base font-bold text-white">Total you pay</dt>
        <dd className="pi text-lg">{formatTestPi(buyerTotal)}</dd>
      </div>
    </dl>
  );
}

function TradeTransactionPanel({
  trade,
  emphasis = "neutral",
}: {
  trade: Trade;
  emphasis?: "admin" | "buyer" | "neutral" | "seller";
}) {
  const payment = trade.payment;
  const headlineTone =
    payment?.escrowStatus === "released_to_seller" ||
    payment?.escrowStatus === "refunded_to_buyer"
      ? "success"
      : payment?.escrowStatus === "release_failed" ||
          payment?.escrowStatus === "refund_failed"
        ? "danger"
        : trade.status === "AwaitingRelease"
          ? "info"
          : trade.status === "PendingFunding"
            ? "warning"
            : trade.status === "Disputed"
              ? "danger"
              : "info";
  const buyerFundingAmount =
    payment?.buyerTotalTestPi ?? calculateBuyerTotal(trade.amountTestPi);

  return (
    <ActionPanel title="Transaction Tracking" icon={<HandCoins className="h-4 w-4" />}>
      <InfoBox tone={headlineTone}>
        <p className="font-bold text-white">{escrowHeadline(trade)}</p>
        <p className="mt-1">{escrowDescription(trade)}</p>
      </InfoBox>

      <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/16 p-3">
        <TransactionRow
          actionLabel="Buyer funding"
          amount={formatTestPi(buyerFundingAmount)}
          link={payment?.buyerPaymentLink}
          status={
            payment?.buyerPaymentTxid
              ? "Completed and held by PiScrow"
              : trade.status === "PendingFunding"
                ? "Waiting for selected buyer payment"
                : "Not started"
          }
          txid={payment?.buyerPaymentTxid}
        />
        <TransactionRow
          actionLabel="Escrow state"
          amount={formatTestPi(
            payment?.sellerAmountTestPi ?? calculateSellerReceivable(trade.amountTestPi),
          )}
          chipLabel={compactEscrowLabel(trade) ?? "Escrow"}
          chipTone={compactEscrowTone(trade)}
          status={
            trade.status === "Disputed"
              ? "Funds stay frozen until admin review finishes."
              : payment?.escrowStatus === "held_in_app"
                ? "Buyer funds are being held inside the PiScrow app wallet."
                : payment?.escrowStatus === "released_to_seller"
                  ? "Escrow finished and seller payout completed."
                  : payment?.escrowStatus === "refunded_to_buyer"
                    ? "Escrow finished and buyer refund completed."
                    : payment?.escrowStatus === "release_pending"
                      ? "Seller payout is currently being submitted from escrow."
                      : payment?.escrowStatus === "refund_pending"
                        ? "Buyer refund is currently being submitted from escrow."
                        : payment?.escrowStatus === "release_failed"
                          ? "Seller payout failed and needs admin attention."
                          : payment?.escrowStatus === "refund_failed"
                            ? "Buyer refund failed and needs admin attention."
                            : "Escrow tracking starts as soon as funding is verified."
          }
        />
        {trade.deliveryDueAt && (
          <TransactionRow
            actionLabel="Delivery deadline"
            amount={dateLabel(trade.deliveryDueAt)}
            chipLabel={
              trade.deliveryExpiredAt
                ? "Expired"
                : deliveryWindowExpired(trade)
                  ? "Overdue"
                  : "7 days"
            }
            chipTone={
              trade.deliveryExpiredAt || deliveryWindowExpired(trade)
                ? "danger"
                : "info"
            }
            status={deliveryDeadlineDetail(trade)}
          />
        )}
        <TransactionRow
          actionLabel={releaseLineLabel(trade)}
          amount={formatTestPi(releaseExpectedAmount(trade))}
          link={payment?.releaseTransactionLink}
          status={releaseLineStatus(trade)}
          txid={payment?.releaseTxid}
        />
      </div>

      {emphasis === "buyer" && trade.status === "AwaitingRelease" && (
        <InfoBox tone="info">
          {awaitingReleaseNotice(trade, "buyer")}
        </InfoBox>
      )}

      {emphasis === "seller" && trade.status === "AwaitingRelease" && (
        <InfoBox tone="info">{awaitingReleaseNotice(trade, "seller")}</InfoBox>
      )}

      {emphasis === "seller" && trade.status === "Funded" && !trade.deliveryProofNote && (
        <InfoBox tone="warning">
          Buyer funding is already locked in PiScrow escrow. Submit seller proof here before asking the buyer to confirm receipt. {deliveryDeadlineDetail(trade)}
        </InfoBox>
      )}

      {emphasis === "admin" && trade.status === "AwaitingRelease" && (
        <InfoBox tone="warning">
          {awaitingReleaseNotice(trade, "admin")}
        </InfoBox>
      )}
    </ActionPanel>
  );
}

function TransactionRow({
  actionLabel,
  amount,
  chipLabel,
  chipTone,
  link,
  status,
  txid,
}: {
  actionLabel: string;
  amount: string;
  chipLabel?: string;
  chipTone?: "danger" | "info" | "neutral" | "private" | "success" | "warning";
  link?: string;
  status: string;
  txid?: string;
}) {
  const explorerLink = transactionExplorerLink(link, txid);

  return (
    <div className="rounded-2xl border border-white/8 bg-black/14 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            {actionLabel}
          </p>
          <p className="mt-1 text-base font-black text-white">{amount}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {chipLabel && chipTone && <Chip tone={chipTone}>{chipLabel}</Chip>}
          {explorerLink && (
            <a
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-bold text-slate-100 transition hover:bg-white/10"
              href={explorerLink}
              rel="noreferrer"
              target="_blank"
            >
              Explorer
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-300">{status}</p>
      {txid && (
        <p className="mt-2 text-xs font-semibold text-slate-500">
          Hash: <span className="text-slate-300">{shortTxid(txid)}</span>
        </p>
      )}
    </div>
  );
}

function ActionPanel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3 rounded-2xl border border-white/10 bg-black/14 p-3">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <h2 className="font-black text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm leading-6 text-slate-200">{value}</p>
    </div>
  );
}

function InfoBox({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "danger" | "info" | "success" | "warning";
}) {
  const classes = {
    danger: "border-rose-400/20 bg-rose-500/10 text-rose-100",
    info: "border-sky-400/20 bg-sky-500/10 text-sky-100",
    success: "border-emerald-400/20 bg-emerald-500/10 text-emerald-100",
    warning: "border-amber-400/20 bg-amber-400/10 text-amber-100",
  };

  return (
    <div className={`rounded-2xl border p-3 text-sm leading-6 ${classes[tone]}`}>
      {children}
    </div>
  );
}

function ProofFileInput({ label, name }: { label: string; name: string }) {
  return (
    <label className="grid gap-2 rounded-2xl border border-dashed border-white/18 bg-black/12 p-3">
      <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <input
        accept="image/jpeg,image/png,image/webp"
        className="text-sm font-semibold text-slate-300 file:mr-3 file:h-10 file:rounded-xl file:border-0 file:bg-[rgba(245,166,35,0.14)] file:px-3 file:text-sm file:font-black file:text-[var(--gold)]"
        name={name}
        type="file"
      />
      <span className="text-xs leading-5 text-slate-500">
        JPEG, PNG, or WebP. Max 5 MB. Stored privately for trade review.
      </span>
    </label>
  );
}

function ProofLink({ label, url }: { label: string; url: string }) {
  return (
    <div className="grid gap-2">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      {isImageUrl(url) ? (
        <a aria-label={`View ${label}`} href={url} rel="noreferrer" target="_blank">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={label}
            className="aspect-[4/3] w-full rounded-2xl border border-white/10 object-cover"
            src={url}
          />
        </a>
      ) : (
        <a
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold leading-6 text-[var(--gold)] underline-offset-4 hover:underline"
          href={url}
          rel="noreferrer"
          target="_blank"
        >
          <Eye className="h-4 w-4" />
          View proof
        </a>
      )}
    </div>
  );
}

function Timeline({
  compact = false,
  events,
  title = "Live Activity",
}: {
  compact?: boolean;
  events: TradeEvent[];
  title?: string;
}) {
  const [selectedProfile, setSelectedProfile] = useState<UserReputation | null>(null);

  return (
    <>
      <section className={compact ? "grid gap-2" : panelClass}>
        <div className="mb-2 flex items-center gap-2">
          <Eye className="h-4 w-4 text-slate-400" />
          <h2 className="font-black text-white">{title}</h2>
        </div>
        <div className="grid max-h-[560px] gap-2 overflow-auto pr-1">
          {events.length === 0 ? (
            <p className="text-sm text-slate-400">No events yet.</p>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className="rounded-r-2xl border-l-2 border-[var(--gold)] bg-black/16 px-3 py-2"
              >
                <p className="text-sm font-black text-white">
                  {humanizeUnderscore(event.eventType)}
                </p>
                <p className="text-xs leading-5 text-slate-300">{event.notes}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
                  <VerifiedUsername
                    className="text-slate-400"
                    onClick={
                      event.actorProfile
                        ? () => setSelectedProfile(event.actorProfile ?? null)
                        : undefined
                    }
                    profile={event.actorProfile}
                    username={event.actor}
                  />
                  <span>{dateLabel(event.createdAt)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
      {selectedProfile && (
        <PublicProfileSheet
          profile={selectedProfile}
          onClose={() => setSelectedProfile(null)}
        />
      )}
    </>
  );
}

function SettingsRow({
  href,
  icon,
  label,
  onClick,
}: {
  href?: string;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="inline-flex items-center gap-2">
        {icon}
        {label}
      </span>
      <ChevronRight className="h-4 w-4 text-slate-600" />
    </>
  );

  if (href) {
    return (
      <a className="fr border-t border-white/8 text-sm font-semibold text-slate-300" href={href}>
        {content}
      </a>
    );
  }

  return (
    <button
      className="fr w-full border-t border-white/8 text-left text-sm font-semibold text-slate-300"
      type="button"
      onClick={onClick}
    >
      {content}
    </button>
  );
}

function VerificationQueue({
  copy,
  loading,
  requests,
  onApprove,
  onRefresh,
}: {
  copy: WorkspaceCopy;
  loading: boolean;
  requests: UserReputation[];
  onApprove: (request: UserReputation) => void;
  onRefresh: () => void;
}) {
  const [selectedProfile, setSelectedProfile] = useState<UserReputation | null>(null);

  return (
    <>
      <section className={`${panelClass} mt-4`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={sectionEyebrowClass}>{copy.verification.queue}</p>
            <h2 className="font-black text-white">{copy.verification.title}</h2>
          </div>
          <button className="sh-a" type="button" onClick={onRefresh}>
            <RefreshCcw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            {copy.verification.refresh}
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          {requests.length === 0 ? (
            <p className="text-sm font-semibold text-slate-400">
              {copy.verification.noRequests}
            </p>
          ) : (
            requests.map((request) => (
              <article
                key={request.userId}
                className="grid gap-3 rounded-2xl border border-white/10 bg-black/16 p-3"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <VerifiedUsername
                      className="font-black text-white"
                      onClick={() => setSelectedProfile(request)}
                      profile={request}
                      username={request.piUsername}
                    />
                    <TrustChip profile={request} />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {copy.verification.statsLine(
                      request.successfulTrades,
                      request.disputedTrades,
                      request.cancelledTrades,
                    )}
                  </p>
                </div>
                <button className={successButtonClass} type="button" onClick={() => onApprove(request)}>
                  <BadgeCheck className="h-4 w-4" />
                  {copy.verification.approveBadge}
                </button>
              </article>
            ))
          )}
        </div>
      </section>
      {selectedProfile && (
        <PublicProfileSheet
          profile={selectedProfile}
          onClose={() => setSelectedProfile(null)}
        />
      )}
    </>
  );
}

function ReviewRecommendationPanel({
  copy,
  loading,
  recommendation,
  trade,
  onRunReview,
}: {
  copy: WorkspaceCopy;
  loading: boolean;
  recommendation?: TradeReviewRecommendation;
  trade: Trade;
  onRunReview: (trade: Trade) => void;
}) {
  return (
    <section className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-amber-100">
            <Lightbulb className="h-4 w-4" />
            <h3 className="text-sm font-black text-white">{copy.review.title}</h3>
          </div>
          <p className="mt-1 text-sm leading-6 text-amber-50/80">
            {copy.review.body}
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-50/70">
            It never releases funds or resolves a trade. Admin still decides the outcome.
          </p>
        </div>
        <button
          className="btn-gh shrink-0 border-amber-300/25 text-amber-100"
          disabled={loading}
          type="button"
          onClick={() => onRunReview(trade)}
        >
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
          {copy.review.review}
        </button>
      </div>
      {recommendation && (
        <div className="mt-3 grid gap-2 rounded-xl border border-amber-300/20 bg-black/18 p-3 text-sm leading-6 text-amber-50/90">
          <p className="font-black text-white">
            {reviewActionLabel(recommendation.recommendedAction)} · {copy.review.confidence(recommendation.confidence)}
          </p>
          <p>{recommendation.summary}</p>
          {recommendation.missingEvidence.length > 0 && (
            <p>{copy.review.missingEvidence}: {recommendation.missingEvidence.join(", ")}</p>
          )}
          {recommendation.riskFlags.length > 0 && (
            <p>{copy.review.riskFlags}: {recommendation.riskFlags.join(", ")}</p>
          )}
        </div>
      )}
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <section className={`${panelClass} border-dashed text-center`}>
      <p className="text-sm font-semibold leading-6 text-slate-400">{label}</p>
    </section>
  );
}
