"use client";

import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Eye,
  FileWarning,
  HandCoins,
  History,
  Lightbulb,
  LoaderCircle,
  Megaphone,
  Plus,
  RefreshCcw,
  Send,
  Star,
  Trash2,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import {
  calculateBuyerTotal,
  calculatePlatformFee,
  calculateSellerReceivable,
  feePercentLabel,
} from "@/lib/fees";
import {
  dateLabel,
  fundingWindowLabel,
  humanizeUnderscore,
  isImageUrl,
  normalizeUsername,
  reviewActionLabel,
  selectionExpired,
} from "@/lib/piscrow-ui-helpers";
import { formatTestPi, tradeVisibilityLabels } from "@/lib/trade-state";
import type { UserReputation } from "@/types/profile";
import type { TradeReviewRecommendation } from "@/types/review";
import type { Trade, TradeEvent, TradeInterest } from "@/types/trade";

export function SellerPostPanel({
  username,
  onCreateTrade,
}: {
  username: string;
  onCreateTrade: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [visibility, setVisibility] = useState<"public" | "private">("public");

  return (
    <section className="border border-black/10 bg-white p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-zinc-950">Post Seller Offer</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            @{username} posts first. Buyers compete with responses.
          </p>
        </div>
        <Plus className="h-5 w-5 text-emerald-700" />
      </div>
      <form
        className="grid gap-3"
        onReset={() => setVisibility("public")}
        onSubmit={onCreateTrade}
      >
        <input
          className="h-11 border border-black/15 bg-white px-3 text-sm outline-none focus:border-emerald-700"
          name="title"
          placeholder="Offer title"
        />
        <textarea
          className="min-h-24 border border-black/15 bg-white p-3 text-sm outline-none focus:border-emerald-700"
          name="description"
          placeholder="Item or service details"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className="h-11 border border-black/15 bg-white px-3 text-sm outline-none focus:border-emerald-700"
            min="0.01"
            name="amountTestPi"
            placeholder="Seller price in Test Pi"
            step="0.01"
            type="number"
          />
          <input
            className="h-11 border border-black/15 bg-white px-3 text-sm outline-none focus:border-emerald-700"
            name="locationLabel"
            placeholder="Trade location"
          />
        </div>
        <input
          className="h-11 border border-black/15 bg-white px-3 text-sm outline-none focus:border-emerald-700"
          name="locationArea"
          placeholder="Area or pickup zone"
        />
        <input name="visibility" type="hidden" value={visibility} />
        <div className="grid grid-cols-2 border border-black/15 bg-zinc-50 p-1">
          {(["public", "private"] as const).map((item) => (
            <button
              key={item}
              aria-pressed={visibility === item}
              className={`h-10 text-sm font-black transition ${
                visibility === item
                  ? "bg-zinc-950 text-white shadow-[3px_3px_0_#10b981]"
                  : "text-zinc-600 hover:bg-white"
              }`}
              type="button"
              onClick={() => setVisibility(item)}
            >
              {item === "public" ? "Public" : "Private"}
            </button>
          ))}
        </div>
        {visibility === "private" && (
          <input
            className="h-11 border border-black/15 bg-white px-3 text-sm outline-none focus:border-emerald-700"
            name="targetBuyerPiUsernames"
            placeholder="@buyer_username"
          />
        )}
        <textarea
          className="min-h-24 border border-black/15 bg-white p-3 text-sm outline-none focus:border-emerald-700"
          name="deliveryTerms"
          placeholder="Delivery terms and confirmation rules"
        />
        <div className="border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-950">
          PiScrow fee: {feePercentLabel()} of the listing price. Buyers pay the
          seller price plus the platform fee during funding.
        </div>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 bg-zinc-950 px-4 text-sm font-black text-white transition hover:bg-emerald-700"
          type="submit"
        >
          Post offer
          <ChevronDown className="h-4 w-4 -rotate-90" />
        </button>
      </form>
    </section>
  );
}

export function OfferFeed({
  trades,
  interests,
  currentUsername,
  expandedTradeId,
  onExpand,
  onSelect,
  onSubmitInterest,
  onDeclinePrivate,
  onFund,
  onConfirm,
}: {
  trades: Trade[];
  interests: TradeInterest[];
  currentUsername: string;
  expandedTradeId: string;
  onExpand: (tradeId: string) => void;
  onSelect: (tradeId: string) => void;
  onSubmitInterest: (trade: Trade, event: FormEvent<HTMLFormElement>) => void;
  onDeclinePrivate: (trade: Trade) => void;
  onFund: (trade: Trade) => void;
  onConfirm: (trade: Trade, event: FormEvent<HTMLFormElement>) => void;
}) {
  if (trades.length === 0) {
    return <EmptyState label="No buyer offers available yet." />;
  }

  return (
    <section className="grid gap-3">
      {trades.map((trade) => {
        const expanded = expandedTradeId === trade.id;
        const userInterest = interests.find(
          (interest) =>
            interest.tradeId === trade.id &&
            normalizeUsername(interest.buyerPiUsername) === currentUsername,
        );
        const selectedForUser =
          trade.buyerPiUsername &&
          normalizeUsername(trade.buyerPiUsername) === currentUsername;
        const isOwnOffer =
          normalizeUsername(trade.sellerPiUsername) === currentUsername;
        const isPrivateRequest =
          trade.visibility === "private" &&
          trade.targetBuyerPiUsernames.includes(currentUsername);

        return (
          <article
            key={trade.id}
            className="border border-black/10 bg-white p-4 transition hover:border-zinc-400"
          >
            <button
              className="grid w-full gap-3 text-left md:grid-cols-[1fr_auto]"
              type="button"
              onClick={() => {
                onExpand(expanded ? "" : trade.id);
                onSelect(trade.id);
              }}
            >
              <OfferSummary trade={trade} />
              <ChevronDown
                className={`h-5 w-5 text-zinc-500 transition ${expanded ? "rotate-180" : ""}`}
              />
            </button>

            {expanded && (
              <div className="mt-4 grid gap-4 border-t border-black/10 pt-4">
                <TradeEconomics trade={trade} />
                <LocationBlock trade={trade} />
                <TextBlock label="Description" value={trade.description} />
                <TextBlock label="Delivery terms" value={trade.deliveryTerms} />
                {isOwnOffer && (
                  <div className="border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                    This is your seller offer. Buyers can see it, but you cannot
                    show interest or buy your own listing.
                  </div>
                )}
                {isPrivateRequest && !userInterest && (
                  <div className="grid gap-3 border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-sm font-semibold leading-6 text-zinc-700">
                      Private requested trade from @{trade.sellerPiUsername}.
                    </p>
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 border border-zinc-950 px-3 text-sm font-black text-zinc-950 transition hover:bg-zinc-950 hover:text-white"
                      type="button"
                      onClick={() => onDeclinePrivate(trade)}
                    >
                      Decline request
                    </button>
                  </div>
                )}
                {trade.status === "Draft" && !userInterest && !isOwnOffer && (
                  <form
                    className="grid gap-3"
                    onSubmit={(event) => onSubmitInterest(trade, event)}
                  >
                    <textarea
                      className="min-h-24 border border-black/15 bg-white p-3 text-sm outline-none focus:border-emerald-700"
                      name="responseNote"
                      placeholder="Tell the seller why you are the right buyer"
                    />
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 bg-emerald-700 px-4 text-sm font-black text-white"
                      type="submit"
                    >
                      <Send className="h-4 w-4" />
                      Show interest
                    </button>
                  </form>
                )}
                {userInterest && (
                  <div className="border border-cyan-200 bg-cyan-50 p-3 text-sm leading-6 text-cyan-950">
                    Your response is {userInterest.status.toLowerCase()}.
                  </div>
                )}
                {selectedForUser && trade.status === "PendingFunding" && (
                  <div className="grid gap-2">
                    <div
                      className={`flex items-center gap-2 border p-3 text-sm font-bold ${
                        selectionExpired(trade)
                          ? "border-rose-200 bg-rose-50 text-rose-950"
                          : "border-emerald-200 bg-emerald-50 text-emerald-950"
                      }`}
                    >
                      <Clock className="h-4 w-4" />
                      {fundingWindowLabel(trade)}
                    </div>
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 bg-emerald-700 px-4 text-sm font-black text-white disabled:bg-zinc-400"
                      disabled={selectionExpired(trade)}
                      type="button"
                      onClick={() => onFund(trade)}
                    >
                      <HandCoins className="h-4 w-4" />
                      Fund {formatTestPi(calculateBuyerTotal(trade.amountTestPi))}
                    </button>
                  </div>
                )}
                {selectedForUser && trade.status === "DeliverySubmitted" && (
                  <form
                    className="grid gap-3 border border-emerald-200 bg-emerald-50 p-3"
                    onSubmit={(event) => onConfirm(trade, event)}
                  >
                    <textarea
                      className="min-h-24 border border-black/15 bg-white p-3 text-sm outline-none focus:border-emerald-700"
                      name="buyerReceiptNote"
                      placeholder="Confirm what you received"
                    />
                    <input
                      className="h-11 border border-black/15 bg-white px-3 text-sm outline-none focus:border-emerald-700"
                      name="buyerReceiptProofUrl"
                      placeholder="Optional receipt proof URL"
                      type="url"
                    />
                    <ProofFileInput
                      label="Receipt image"
                      name="buyerReceiptImage"
                    />
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 bg-zinc-950 px-4 text-sm font-black text-white"
                      type="submit"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Confirm receipt
                    </button>
                  </form>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

export function ProfileDesk({
  loading,
  profile,
  trades,
  username,
  onRefresh,
  onRequestVerifiedBadge,
}: {
  loading: boolean;
  profile: UserReputation | null;
  trades: Trade[];
  username: string;
  onRefresh: () => void;
  onRequestVerifiedBadge: () => void;
}) {
  if (!profile) {
    return <EmptyState label="Profile data is not ready yet." />;
  }

  const personalTrades = trades
    .filter(
      (trade) =>
        normalizeUsername(trade.sellerPiUsername) === username ||
        normalizeUsername(trade.buyerPiUsername ?? "") === username,
    )
    .slice(0, 8);
  const hasRequested = Boolean(profile.verificationRequestedAt);

  return (
    <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="grid content-start gap-4">
        <section className="border border-black/10 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-zinc-500">Profile</p>
              <h2 className="mt-2 text-2xl font-black text-zinc-950">
                @{profile.piUsername}
              </h2>
            </div>
            {profile.verifiedBadge ? (
              <BadgeCheck className="h-8 w-8 text-emerald-700" />
            ) : (
              <UserCircle className="h-8 w-8 text-zinc-400" />
            )}
          </div>
          <div className="mt-5 border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
            <p className="text-sm font-bold uppercase">Trust score</p>
            <p className="mt-2 text-4xl font-black">{profile.trustScore}%</p>
            <p className="mt-2 text-sm leading-6">
              Based on completed trades, dispute history, cancellation history,
              marketplace volume, and admin verification.
            </p>
          </div>
          <div className="mt-4 grid gap-2">
            <button
              className="inline-flex h-11 items-center justify-center gap-2 border border-zinc-950 bg-white px-4 text-sm font-black text-zinc-950 transition hover:bg-zinc-50"
              type="button"
              onClick={onRefresh}
            >
              <RefreshCcw className="h-4 w-4" />
              {loading ? "Refreshing" : "Refresh profile"}
            </button>
            <button
              className="inline-flex h-11 items-center justify-center gap-2 bg-zinc-950 px-4 text-sm font-black text-white transition hover:bg-emerald-700 disabled:bg-zinc-400"
              disabled={loading || profile.verifiedBadge || hasRequested}
              type="button"
              onClick={onRequestVerifiedBadge}
            >
              <BadgeCheck className="h-4 w-4" />
              {profile.verifiedBadge
                ? "Verified"
                : hasRequested
                  ? "Request pending"
                  : "Request verified badge"}
            </button>
          </div>
        </section>
      </aside>
      <div className="grid gap-4">
        <section className="grid gap-3 md:grid-cols-3">
          <Metric
            icon={<CheckCircle2 className="h-5 w-5" />}
            label="Successful"
            value={profile.successfulTrades}
          />
          <Metric
            icon={<AlertTriangle className="h-5 w-5" />}
            label="Disputed"
            value={profile.disputedTrades}
          />
          <Metric
            icon={<X className="h-5 w-5" />}
            label="Cancelled"
            value={profile.cancelledTrades}
          />
          <Metric
            icon={<HandCoins className="h-5 w-5" />}
            label="Buys"
            value={profile.buyCount}
          />
          <Metric
            icon={<Megaphone className="h-5 w-5" />}
            label="Sells"
            value={profile.sellCount}
          />
          <Metric
            icon={<BadgeCheck className="h-5 w-5" />}
            label="Badge"
            value={profile.verifiedBadge ? "Verified" : hasRequested ? "Pending" : "Open"}
          />
        </section>
        <section className="border border-black/10 bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <History className="h-4 w-4 text-zinc-500" />
            <h2 className="font-black text-zinc-950">Your Recent Trade History</h2>
          </div>
          {personalTrades.length === 0 ? (
            <p className="text-sm font-semibold text-zinc-500">
              No trades connected to this profile yet.
            </p>
          ) : (
            <div className="grid gap-3">
              {personalTrades.map((trade) => (
                <article key={trade.id} className="border border-black/10 bg-zinc-50 p-3">
                  <OfferSummary trade={trade} />
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

export function SellerDesk({
  trades,
  interests,
  events,
  currentUsername,
  selectedTrade,
  onSelect,
  onSelectInterest,
  onDeleteOffer,
  onSubmitDelivery,
  onOpenDispute,
  onSubmitDisputeUpdate,
}: {
  trades: Trade[];
  interests: TradeInterest[];
  events: TradeEvent[];
  currentUsername: string;
  selectedTrade?: Trade;
  onSelect: (tradeId: string) => void;
  onSelectInterest: (trade: Trade, interest: TradeInterest) => void;
  onDeleteOffer: (trade: Trade) => void;
  onSubmitDelivery: (event: FormEvent<HTMLFormElement>) => void;
  onOpenDispute: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitDisputeUpdate: (trade: Trade, event: FormEvent<HTMLFormElement>) => void;
}) {
  if (trades.length === 0) {
    return <EmptyState label="No seller offers yet. Post one to begin." />;
  }

  const activeTrade =
    trades.find((trade) => trade.id === selectedTrade?.id) ?? trades[0];

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-3">
        {trades.map((trade) => {
          const tradeInterests = interests.filter(
            (interest) => interest.tradeId === trade.id,
          );

          return (
            <article
              key={trade.id}
              className={`border bg-white p-4 ${
                selectedTrade?.id === trade.id
                  ? "border-zinc-950 shadow-[6px_6px_0_#111827]"
                  : "border-black/10"
              }`}
            >
              <button
                className="w-full text-left"
                type="button"
                onClick={() => onSelect(trade.id)}
              >
                <OfferSummary trade={trade} />
              </button>
              <div className="mt-4 grid gap-3 border-t border-black/10 pt-4">
                {trade.status === "Draft" && (
                  <button
                    className="inline-flex h-10 w-fit items-center justify-center gap-2 border border-rose-700 px-3 text-sm font-black text-rose-800 transition hover:bg-rose-700 hover:text-white"
                    type="button"
                    onClick={() => onDeleteOffer(trade)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete offer
                  </button>
                )}
                {tradeInterests.length === 0 ? (
                  <p className="text-sm font-semibold text-zinc-500">
                    No buyer responses yet.
                  </p>
                ) : (
                  tradeInterests.map((interest) => (
                    <div
                      key={interest.id}
                      className="grid gap-3 border border-black/10 bg-zinc-50 p-3 md:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-zinc-950">
                            @{interest.buyerPiUsername}
                          </p>
                          {interest.buyerProfile && (
                            <TrustChip profile={interest.buyerProfile} />
                          )}
                        </div>
                        <p className="mt-1 text-sm leading-6 text-zinc-600">
                          {interest.responseNote}
                        </p>
                        <p className="mt-2 text-xs font-bold uppercase text-zinc-500">
                          {interest.status}
                          {trade.selectedInterestId === interest.id
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
                          className="inline-flex h-10 items-center justify-center gap-2 bg-zinc-950 px-3 text-sm font-black text-white"
                          type="button"
                          onClick={() => onSelectInterest(trade, interest)}
                        >
                          {trade.status === "PendingFunding"
                            ? "Change buyer"
                            : "Select buyer"}
                        </button>
                      )}
                      {trade.status === "PendingFunding" &&
                        selectionExpired(trade) &&
                        trade.selectedInterestId !== interest.id &&
                        interest.status !== "Withdrawn" && (
                          <button
                            className="inline-flex h-10 items-center justify-center gap-2 bg-zinc-950 px-3 text-sm font-black text-white"
                            type="button"
                            onClick={() => onSelectInterest(trade, interest)}
                          >
                            Reselect buyer
                          </button>
                        )}
                    </div>
                  ))
                )}
              </div>
            </article>
          );
        })}
      </div>
      <SideRail
        trade={activeTrade}
        currentUsername={currentUsername}
        events={events}
        paymentState="Seller actions"
        onSubmitDelivery={onSubmitDelivery}
        onOpenDispute={onOpenDispute}
        onSubmitDisputeUpdate={onSubmitDisputeUpdate}
      />
    </section>
  );
}

export function SideRail({
  trade,
  currentUsername,
  events,
  paymentState,
  onSubmitDelivery,
  onOpenDispute,
  onSubmitDisputeUpdate,
}: {
  trade?: Trade;
  currentUsername: string;
  events: TradeEvent[];
  paymentState: string;
  onSubmitDelivery?: (event: FormEvent<HTMLFormElement>) => void;
  onOpenDispute: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitDisputeUpdate?: (trade: Trade, event: FormEvent<HTMLFormElement>) => void;
}) {
  const tradeEvents = events.filter((event) => event.tradeId === trade?.id);
  const isTradeParty = Boolean(
    trade &&
      (normalizeUsername(trade.sellerPiUsername) === currentUsername ||
        normalizeUsername(trade.buyerPiUsername ?? "") === currentUsername),
  );
  const canOpenDispute =
    isTradeParty &&
    trade?.status !== undefined &&
    ["Funded", "DeliverySubmitted"].includes(trade.status);
  const canRespondToDispute = trade?.status === "Disputed" && isTradeParty;

  return (
    <aside className="grid content-start gap-4">
      <section className="border border-black/10 bg-white p-4">
        {trade ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-zinc-500">
                  Trade detail
                </p>
                <h2 className="mt-2 text-xl font-black text-zinc-950">
                  {trade.title}
                </h2>
              </div>
              <StatusBadge status={trade.status} />
            </div>
            <div className="mt-4">
              <TradeEconomics trade={trade} />
            </div>
            <div className="mt-4 grid gap-3">
              <TextBlock label="Seller" value={`@${trade.sellerPiUsername}`} />
              {(trade.locationLabel || trade.locationArea) && (
                <LocationBlock trade={trade} />
              )}
              {trade.buyerPiUsername && (
                <TextBlock label="Selected buyer" value={`@${trade.buyerPiUsername}`} />
              )}
              {trade.deliveryProofNote && (
                <TextBlock
                  label="Seller package proof"
                  value={trade.deliveryProofNote}
                />
              )}
              {trade.deliveryProofUrl && (
                <ProofLink label="Seller proof image / link" url={trade.deliveryProofUrl} />
              )}
              {trade.buyerReceiptNote && (
                <TextBlock
                  label="Buyer receipt proof"
                  value={trade.buyerReceiptNote}
                />
              )}
              {trade.buyerReceiptProofUrl && (
                <ProofLink
                  label="Buyer receipt image / link"
                  url={trade.buyerReceiptProofUrl}
                />
              )}
            </div>
          </>
        ) : (
          <p className="text-sm font-semibold text-zinc-500">
            Select a trade to see details.
          </p>
        )}
      </section>

      {trade && onSubmitDelivery && trade.status === "Funded" && (
        <ActionPanel title="Package Sent Proof" icon={<ClipboardCheck className="h-4 w-4" />}>
          <form className="grid gap-3" onSubmit={onSubmitDelivery}>
            <textarea
              className="min-h-24 border border-black/15 bg-white p-3 text-sm outline-none focus:border-emerald-700"
              name="deliveryProofNote"
              placeholder="Package sent note or proof details"
            />
            <input
              className="h-11 border border-black/15 bg-white px-3 text-sm outline-none focus:border-emerald-700"
              name="deliveryProofUrl"
              placeholder="Optional proof URL"
              type="url"
            />
            <ProofFileInput label="Package proof image" name="deliveryProofImage" />
            <button
              className="inline-flex h-11 items-center justify-center gap-2 bg-emerald-700 px-4 text-sm font-black text-white"
              type="submit"
            >
              Submit proof
            </button>
          </form>
        </ActionPanel>
      )}

      {trade && canOpenDispute && (
        <ActionPanel title="Report This Trade" icon={<AlertTriangle className="h-4 w-4" />}>
          <div className="mb-3 border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-950">
            Reporting freezes only this selected trade and sends its proof,
            payment state, and timeline to admin review.
          </div>
          <form className="grid gap-3" onSubmit={onOpenDispute}>
            <input name="tradeId" type="hidden" value={trade.id} />
            <textarea
              className="min-h-24 border border-black/15 bg-white p-3 text-sm outline-none focus:border-rose-700"
              name="reason"
              placeholder={`Why should ${trade.title} be reviewed?`}
            />
            <input
              className="h-11 border border-black/15 bg-white px-3 text-sm outline-none focus:border-rose-700"
              name="evidenceNote"
              placeholder="Optional evidence note"
            />
            <button
              className="inline-flex h-11 items-center justify-center gap-2 bg-rose-700 px-4 text-sm font-black text-white"
              type="submit"
            >
              Freeze and report trade
            </button>
          </form>
        </ActionPanel>
      )}

      {trade && canRespondToDispute && onSubmitDisputeUpdate && (
        <ActionPanel title="Dispute Follow-up" icon={<FileWarning className="h-4 w-4" />}>
          <form
            className="grid gap-3"
            onSubmit={(event) => onSubmitDisputeUpdate(trade, event)}
          >
            <textarea
              className="min-h-24 border border-black/15 bg-white p-3 text-sm outline-none focus:border-rose-700"
              name="followUpNote"
              placeholder="Respond to admin or add new dispute evidence"
            />
            <button
              className="inline-flex h-11 items-center justify-center gap-2 bg-zinc-950 px-4 text-sm font-black text-white transition hover:bg-rose-700"
              type="submit"
            >
              Send dispute update
            </button>
          </form>
        </ActionPanel>
      )}

      <ActionPanel title="Payment Status" icon={<RefreshCcw className="h-4 w-4" />}>
        <p className="text-sm leading-6 text-zinc-700">{paymentState}</p>
      </ActionPanel>

      <Timeline events={tradeEvents} />
    </aside>
  );
}

export function PublicLedger({
  trades,
  events,
  loading,
  onRefresh,
}: {
  trades: Trade[];
  events: TradeEvent[];
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid gap-3">
        <div className="flex flex-col gap-3 border border-black/10 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-zinc-950">Transparent Activity</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Public view of listings, selected buyers, funding, completion, and disputes.
            </p>
          </div>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 border border-zinc-950 px-3 text-sm font-black text-zinc-950"
            type="button"
            onClick={onRefresh}
          >
            <RefreshCcw className="h-4 w-4" />
            {loading ? "Refreshing" : "Refresh"}
          </button>
        </div>
        {trades.map((trade) => (
          <article key={trade.id} className="border border-black/10 bg-white p-4">
            <OfferSummary trade={trade} />
            <div className="mt-3">
              <LedgerEconomics trade={trade} />
            </div>
          </article>
        ))}
      </div>
      <Timeline events={events.slice(0, 30)} />
    </section>
  );
}

export function AdminDesk({
  trades,
  events,
  reviewLoadingTradeId,
  reviewRecommendations,
  verificationLoading,
  verificationRequests,
  onApproveVerification,
  onRefreshVerifications,
  onRequestFollowUp,
  onRunReview,
  onResolve,
}: {
  trades: Trade[];
  events: TradeEvent[];
  reviewLoadingTradeId: string;
  reviewRecommendations: TradeReviewRecommendation[];
  verificationLoading: boolean;
  verificationRequests: UserReputation[];
  onApproveVerification: (request: UserReputation) => void;
  onRefreshVerifications: () => void;
  onRequestFollowUp: (
    trade: Trade,
    action: "request_buyer_followup" | "request_seller_followup",
    event: FormEvent<HTMLFormElement>,
  ) => void;
  onRunReview: (trade: Trade) => void;
  onResolve: (trade: Trade, status: "Completed" | "Cancelled") => void;
}) {
  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid gap-3">
        <VerificationQueue
          loading={verificationLoading}
          requests={verificationRequests}
          onApprove={onApproveVerification}
          onRefresh={onRefreshVerifications}
        />
        {trades.length === 0 ? (
          <EmptyState label="No disputed trades waiting for admin review." />
        ) : (
          trades.map((trade) => {
            const recommendation = reviewRecommendations.find(
              (item) => item.tradeId === trade.id,
            );

            return (
              <article key={trade.id} className="border border-rose-200 bg-white p-4">
                <OfferSummary trade={trade} />
                <div className="mt-4">
                  <TradeEconomics trade={trade} />
                </div>
                <ReviewRecommendationPanel
                  loading={reviewLoadingTradeId === trade.id}
                  recommendation={recommendation}
                  trade={trade}
                  onRunReview={onRunReview}
                />
                <div className="mt-4 grid gap-3 border-t border-black/10 pt-3">
                  <LocationBlock trade={trade} />
                  {trade.buyerPiUsername && (
                    <TextBlock label="Buyer under review" value={`@${trade.buyerPiUsername}`} />
                  )}
                  {trade.deliveryProofNote && (
                    <TextBlock
                      label="Seller package proof"
                      value={trade.deliveryProofNote}
                    />
                  )}
                  {trade.deliveryProofUrl && (
                    <ProofLink label="Seller proof image / link" url={trade.deliveryProofUrl} />
                  )}
                  {trade.buyerReceiptNote && (
                    <TextBlock
                      label="Buyer receipt proof"
                      value={trade.buyerReceiptNote}
                    />
                  )}
                  {trade.buyerReceiptProofUrl && (
                    <ProofLink
                      label="Buyer receipt image / link"
                      url={trade.buyerReceiptProofUrl}
                    />
                  )}
                </div>
                <div className="mt-4 grid gap-3 border-t border-black/10 pt-3 lg:grid-cols-2">
                  <AdminFollowUpForm
                    action="request_buyer_followup"
                    label="Request buyer update"
                    placeholder="Ask the buyer what they received, what is missing, or what proof they can add."
                    trade={trade}
                    onSubmit={onRequestFollowUp}
                  />
                  <AdminFollowUpForm
                    action="request_seller_followup"
                    label="Request seller update"
                    placeholder="Ask the seller for delivery proof, tracking details, or a response to the buyer claim."
                    trade={trade}
                    onSubmit={onRequestFollowUp}
                  />
                </div>
                <div className="mt-4 grid gap-3 border-t border-black/10 pt-3 sm:grid-cols-2">
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 bg-emerald-700 px-3 py-2 text-sm font-black text-white"
                    type="button"
                    onClick={() => onResolve(trade, "Completed")}
                  >
                    Approve seller release
                  </button>
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 bg-zinc-800 px-3 py-2 text-sm font-black text-white"
                    type="button"
                    onClick={() => onResolve(trade, "Cancelled")}
                  >
                    Approve buyer refund
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
      <Timeline events={events.filter((event) => trades.some((trade) => trade.id === event.tradeId))} />
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="border border-black/10 bg-white p-4">
      <div className="flex items-center gap-3 text-zinc-500">
        {icon}
        <p className="text-xs font-bold uppercase">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-black text-zinc-950">{value}</p>
    </div>
  );
}

function OfferSummary({ trade }: { trade: Trade }) {
  const location = [trade.locationLabel, trade.locationArea]
    .filter(Boolean)
    .join(" / ");

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={trade.status} />
        <Chip>{tradeVisibilityLabels[trade.visibility]}</Chip>
        <Chip>{trade.interestCount ?? 0} interest</Chip>
        {trade.status === "PendingFunding" && (
          <Chip>{fundingWindowLabel(trade)}</Chip>
        )}
        {trade.sellerProfile && <TrustChip profile={trade.sellerProfile} />}
      </div>
      <div>
        <h3 className="text-lg font-black leading-snug text-zinc-950">
          {trade.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-600">
          {trade.description}
        </p>
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <RecordField label="Seller" value={`@${trade.sellerPiUsername}`} />
        <RecordField
          label="Buyer"
          value={trade.buyerPiUsername ? `@${trade.buyerPiUsername}` : "Not selected"}
        />
        <RecordField label="Location" value={location || "Not provided"} />
      </div>
      <p className="text-xs font-bold uppercase text-zinc-500">
        Buyer funds {formatTestPi(calculateBuyerTotal(trade.amountTestPi))}
      </p>
    </div>
  );
}

function TrustChip({ profile }: { profile: UserReputation }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-black text-emerald-950">
      {profile.verifiedBadge ? (
        <BadgeCheck className="h-3.5 w-3.5" />
      ) : (
        <Star className="h-3.5 w-3.5" />
      )}
      {profile.trustScore}% trust
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center border border-black/10 bg-zinc-50 px-2.5 text-xs font-semibold text-zinc-700">
      {children}
    </span>
  );
}

function RecordField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase text-zinc-400">{label}</p>
      <p className="truncate font-semibold text-zinc-700">{value}</p>
    </div>
  );
}

function TradeEconomics({ trade }: { trade: Trade }) {
  const fee = calculatePlatformFee(trade.amountTestPi);

  return (
    <dl className="grid gap-2 border border-black/10 bg-zinc-50 p-3 text-sm sm:grid-cols-3">
      <div>
        <dt className="font-bold text-zinc-500">Seller receives</dt>
        <dd className="mt-1 font-black text-zinc-950">
          {formatTestPi(calculateSellerReceivable(trade.amountTestPi))}
        </dd>
      </div>
      <div>
        <dt className="font-bold text-zinc-500">PiScrow fee</dt>
        <dd className="mt-1 font-black text-zinc-950">{formatTestPi(fee)}</dd>
      </div>
      <div>
        <dt className="font-bold text-zinc-500">Buyer funds</dt>
        <dd className="mt-1 font-black text-zinc-950">
          {formatTestPi(calculateBuyerTotal(trade.amountTestPi))}
        </dd>
      </div>
    </dl>
  );
}

function LedgerEconomics({ trade }: { trade: Trade }) {
  return (
    <dl className="grid gap-2 border border-black/10 bg-zinc-50 p-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="font-bold text-zinc-500">Seller price</dt>
        <dd className="mt-1 font-black text-zinc-950">
          {formatTestPi(trade.amountTestPi)}
        </dd>
      </div>
      <div>
        <dt className="font-bold text-zinc-500">Location</dt>
        <dd className="mt-1 font-black text-zinc-950">
          {trade.locationLabel ?? "Not provided"}
        </dd>
      </div>
    </dl>
  );
}

function LocationBlock({ trade }: { trade: Trade }) {
  if (!trade.locationLabel && !trade.locationArea) {
    return null;
  }

  return (
    <div className="grid gap-2 border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 sm:grid-cols-2">
      {trade.locationLabel && (
        <TextBlock label="Trade location" value={trade.locationLabel} />
      )}
      {trade.locationArea && (
        <TextBlock label="Area / pickup zone" value={trade.locationArea} />
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
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-black/10 bg-white p-4">
      <div className="mb-4 flex items-center gap-2 text-zinc-500">
        {icon}
        <h2 className="font-black text-zinc-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
      <p className="mt-1 text-sm leading-6 text-zinc-700">{value}</p>
    </div>
  );
}

function ProofFileInput({ label, name }: { label: string; name: string }) {
  return (
    <label className="grid gap-2 border border-dashed border-black/20 bg-white p-3">
      <span className="text-xs font-bold uppercase text-zinc-500">{label}</span>
      <input
        accept="image/jpeg,image/png,image/webp"
        className="text-sm font-semibold text-zinc-700 file:mr-3 file:h-10 file:border-0 file:bg-zinc-950 file:px-3 file:text-sm file:font-black file:text-white"
        name={name}
        type="file"
      />
      <span className="text-xs leading-5 text-zinc-500">
        JPEG, PNG, or WebP. Max 5 MB. Stored privately for trade review.
      </span>
    </label>
  );
}

function ProofLink({ label, url }: { label: string; url: string }) {
  return (
    <div className="grid gap-2">
      <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
      {isImageUrl(url) && (
        <a href={url} rel="noreferrer" target="_blank">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={label}
            className="aspect-[4/3] w-full border border-black/10 object-cover"
            src={url}
          />
        </a>
      )}
      <a
        className="mt-1 block break-all text-sm font-semibold leading-6 text-emerald-800 underline-offset-4 hover:underline"
        href={url}
        rel="noreferrer"
        target="_blank"
      >
        {url}
      </a>
    </div>
  );
}

function Timeline({ events }: { events: TradeEvent[] }) {
  return (
    <section className="border border-black/10 bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <Eye className="h-4 w-4 text-zinc-500" />
        <h2 className="font-black text-zinc-950">Live Activity</h2>
      </div>
      <div className="grid max-h-[560px] gap-2 overflow-auto pr-1">
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">No events yet.</p>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="border-l-4 border-emerald-700 bg-zinc-50 px-3 py-2"
            >
              <p className="text-sm font-black text-zinc-900">{event.eventType}</p>
              <p className="text-xs leading-5 text-zinc-600">{event.notes}</p>
              <p className="mt-1 text-[11px] font-bold uppercase text-zinc-400">
                @{event.actor} · {dateLabel(event.createdAt)}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function VerificationQueue({
  loading,
  requests,
  onApprove,
  onRefresh,
}: {
  loading: boolean;
  requests: UserReputation[];
  onApprove: (request: UserReputation) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="border border-emerald-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-black text-zinc-950">Verified Badge Requests</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            Review profile history before granting public trust badges.
          </p>
        </div>
        <button
          className="inline-flex h-10 items-center justify-center gap-2 border border-zinc-950 px-3 text-sm font-black text-zinc-950"
          type="button"
          onClick={onRefresh}
        >
          <RefreshCcw className="h-4 w-4" />
          {loading ? "Refreshing" : "Refresh"}
        </button>
      </div>
      <div className="mt-4 grid gap-3">
        {requests.length === 0 ? (
          <p className="text-sm font-semibold text-zinc-500">
            No badge requests waiting.
          </p>
        ) : (
          requests.map((request) => (
            <article
              key={request.userId}
              className="grid gap-3 border border-black/10 bg-zinc-50 p-3 md:grid-cols-[1fr_auto]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-black text-zinc-950">@{request.piUsername}</p>
                  <TrustChip profile={request} />
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  {request.successfulTrades} successful / {request.disputedTrades} disputed / {request.cancelledTrades} cancelled
                </p>
                {request.verificationRequestedAt && (
                  <p className="mt-1 text-xs font-bold uppercase text-zinc-400">
                    Requested {dateLabel(request.verificationRequestedAt)}
                  </p>
                )}
              </div>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 bg-emerald-700 px-3 text-sm font-black text-white"
                type="button"
                onClick={() => onApprove(request)}
              >
                <BadgeCheck className="h-4 w-4" />
                Approve badge
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function ReviewRecommendationPanel({
  loading,
  recommendation,
  trade,
  onRunReview,
}: {
  loading: boolean;
  recommendation?: TradeReviewRecommendation;
  trade: Trade;
  onRunReview: (trade: Trade) => void;
}) {
  return (
    <section className="mt-4 border border-amber-200 bg-amber-50 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-amber-900">
            <Lightbulb className="h-4 w-4" />
            <h3 className="text-sm font-black text-zinc-950">
              Review Copilot
            </h3>
            <Chip>Recommend-only</Chip>
          </div>
          <p className="mt-2 text-sm leading-6 text-zinc-700">
            Admin-only evidence review. It never releases funds or resolves a
            trade by itself.
          </p>
        </div>
        <button
          className="inline-flex min-h-10 items-center justify-center gap-2 bg-zinc-950 px-3 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
          type="button"
          disabled={loading}
          onClick={() => onRunReview(trade)}
        >
          {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
          {recommendation ? "Rerun review" : "Run review"}
        </button>
      </div>

      {recommendation ? (
        <div className="mt-3 grid gap-3 border-t border-amber-200 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 items-center border border-amber-300 bg-white px-3 text-xs font-black uppercase text-amber-950">
              {reviewActionLabel(recommendation.recommendedAction)}
            </span>
            <span className="inline-flex h-8 items-center border border-black/10 bg-white px-3 text-xs font-black text-zinc-800">
              {recommendation.confidence}% confidence
            </span>
            <span className="text-xs font-bold uppercase text-zinc-500">
              {dateLabel(recommendation.createdAt)}
            </span>
          </div>
          <p className="text-sm leading-6 text-zinc-700">
            {recommendation.summary}
          </p>
          <EvidenceList
            label="Missing evidence"
            items={recommendation.missingEvidence}
            emptyLabel="No missing evidence flagged."
          />
          <EvidenceList
            label="Risk flags"
            items={recommendation.riskFlags}
            emptyLabel="No risk flags detected."
          />
        </div>
      ) : (
        <p className="mt-3 border-t border-amber-200 pt-3 text-sm font-semibold text-zinc-600">
          No recommendation has been generated for this dispute yet.
        </p>
      )}
    </section>
  );
}

function EvidenceList({
  label,
  items,
  emptyLabel,
}: {
  label: string;
  items: string[];
  emptyLabel: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase text-zinc-500">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.length === 0 ? (
          <span className="text-xs font-semibold text-zinc-500">{emptyLabel}</span>
        ) : (
          items.map((item) => (
            <span
              key={item}
              className="inline-flex min-h-7 items-center border border-black/10 bg-white px-2.5 py-1 text-xs font-bold text-zinc-700"
            >
              {humanizeUnderscore(item)}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function AdminFollowUpForm({
  action,
  label,
  placeholder,
  trade,
  onSubmit,
}: {
  action: "request_buyer_followup" | "request_seller_followup";
  label: string;
  placeholder: string;
  trade: Trade;
  onSubmit: (
    trade: Trade,
    action: "request_buyer_followup" | "request_seller_followup",
    event: FormEvent<HTMLFormElement>,
  ) => void;
}) {
  return (
    <form
      className="grid gap-2 border border-black/10 bg-zinc-50 p-3"
      onSubmit={(event) => onSubmit(trade, action, event)}
    >
      <p className="text-sm font-black text-zinc-950">{label}</p>
      <textarea
        className="min-h-20 border border-black/15 bg-white p-3 text-sm outline-none focus:border-rose-700"
        name="notes"
        placeholder={placeholder}
      />
      <button
        className="inline-flex h-10 items-center justify-center bg-zinc-950 px-3 text-sm font-black text-white transition hover:bg-rose-700"
        type="submit"
      >
        Send request
      </button>
    </form>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <section className="border border-dashed border-black/20 bg-white p-8 text-center">
      <Users className="mx-auto h-8 w-8 text-zinc-400" />
      <p className="mt-3 text-sm font-bold text-zinc-600">{label}</p>
    </section>
  );
}
