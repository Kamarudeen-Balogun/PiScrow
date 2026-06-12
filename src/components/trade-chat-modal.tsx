"use client";

import {
  ChevronLeft,
  ImageUp,
  LoaderCircle,
  RefreshCcw,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

import { PublicProfileSheet } from "@/components/public-profile-sheet";
import { StatusBadge } from "@/components/status-badge";
import { VerifiedUsername } from "@/components/verified-username";
import { dateLabel, isImageUrl, normalizeUsername } from "@/lib/piscrow-ui-helpers";
import type { UserReputation } from "@/types/profile";
import type { Trade, TradeChatMessage, TradeChatRoom } from "@/types/trade";

type TradeChatModalProps = {
  currentUserId?: string;
  currentUsername: string;
  isAdmin: boolean;
  loading: boolean;
  messages: TradeChatMessage[];
  room?: TradeChatRoom;
  sending: boolean;
  trade: Trade;
  onClaim?: (trade: Trade) => void;
  onClose: () => void;
  onRefresh: (trade: Trade) => void;
  onSend: (trade: Trade, event: FormEvent<HTMLFormElement>) => void;
};

export function TradeChatModal({
  currentUserId,
  currentUsername,
  isAdmin,
  loading,
  messages,
  room,
  sending,
  trade,
  onClaim,
  onClose,
  onRefresh,
  onSend,
}: TradeChatModalProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<UserReputation | null>(null);
  const isSeller = normalizeUsername(trade.sellerPiUsername) === currentUsername;
  const isBuyer = normalizeUsername(trade.buyerPiUsername ?? "") === currentUsername;
  const isTradeParty = isSeller || isBuyer;
  const claimedByMe = Boolean(
    room?.claimedAdminUserId && currentUserId && room.claimedAdminUserId === currentUserId,
  );
  const claimedByOther = Boolean(
    room?.claimedAdminUserId && (!currentUserId || room.claimedAdminUserId !== currentUserId),
  );
  const adminNeedsClaim =
    isAdmin && !isTradeParty && ["Disputed", "AwaitingRelease"].includes(trade.status);
  const canClaim = adminNeedsClaim && !claimedByMe && !claimedByOther && Boolean(onClaim);
  const canSend =
    !["Completed", "Cancelled"].includes(trade.status) &&
    (!adminNeedsClaim || claimedByMe);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  function roleLabelFor(role: TradeChatMessage["senderRole"]) {
    switch (role) {
      case "buyer":
        return "Buyer";
      case "seller":
        return "Seller";
      case "admin":
        return "Admin";
      default:
        return "System";
    }
  }

  function roleBadgeClassFor(role: TradeChatMessage["senderRole"], ownMessage: boolean) {
    if (ownMessage) {
      return "border-black/10 bg-black/10 text-slate-900";
    }

    switch (role) {
      case "buyer":
        return "border-sky-400/20 bg-sky-500/10 text-sky-100";
      case "seller":
        return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
      case "admin":
        return "border-violet-400/20 bg-violet-500/12 text-violet-100";
      default:
        return "border-white/10 bg-white/8 text-slate-200";
    }
  }

  function profileForUsername(username?: string) {
    const normalized = normalizeUsername(username ?? "");

    if (!normalized) {
      return undefined;
    }

    if (normalized === normalizeUsername(trade.sellerPiUsername)) {
      return trade.sellerProfile;
    }

    if (
      trade.buyerPiUsername &&
      normalized === normalizeUsername(trade.buyerPiUsername)
    ) {
      return trade.buyerProfile;
    }

    return undefined;
  }

  function renderParticipant(role: "Buyer" | "Seller", username?: string) {
    const profile = profileForUsername(username);

    return (
      <span className="inline-flex items-center gap-1">
        <span>{role}</span>
        {username ? (
          <VerifiedUsername
            className="text-slate-300"
            onClick={profile ? () => setSelectedProfile(profile) : undefined}
            profile={profile}
            username={username}
          />
        ) : (
          <span className="text-slate-500">unselected</span>
        )}
      </span>
    );
  }

  return (
    <>
      <section
        aria-label="Trade chat"
        aria-modal="true"
        className="fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm"
        role="dialog"
      >
        <div className="mx-auto flex h-full w-full max-w-[430px] flex-col bg-[var(--background-elevated)]">
          <header className="border-b border-white/8 bg-[rgba(6,12,24,0.96)] px-3 py-3">
            <div className="flex items-start gap-2">
              <button
                aria-label="Close chat"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/6 text-slate-200"
                type="button"
                onClick={onClose}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-base font-black text-white">{trade.title}</p>
                  <StatusBadge status={trade.status} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-slate-400">
                  {adminNeedsClaim ? (
                    <>
                      {renderParticipant("Buyer", trade.buyerPiUsername)}
                      {renderParticipant("Seller", trade.sellerPiUsername)}
                    </>
                  ) : isSeller ? (
                    trade.buyerPiUsername ? (
                      renderParticipant("Buyer", trade.buyerPiUsername)
                    ) : (
                      <span>Waiting for buyer</span>
                    )
                  ) : (
                    renderParticipant("Seller", trade.sellerPiUsername)
                  )}
                </div>
              </div>
              <button
                aria-label="Close chat"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/6 text-slate-300"
                type="button"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                className="btn-gh flex-1"
                disabled={loading}
                type="button"
                onClick={() => onRefresh(trade)}
              >
                {loading ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                {room ? "Refresh" : "Load room"}
              </button>
              {canClaim && (
                <button className="btn-p flex-1" type="button" onClick={() => onClaim?.(trade)}>
                  <ShieldCheck className="h-4 w-4" />
                  {trade.status === "AwaitingRelease" ? "Join review" : "Join dispute"}
                </button>
              )}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            {adminNeedsClaim && claimedByOther && (
              <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm leading-6 text-amber-100">
                {trade.status === "AwaitingRelease"
                  ? "Another admin has this release review room. You can read the conversation, but only that admin can reply here."
                  : "Another admin has this dispute room. You can read the conversation, but only that admin can reply here."}
              </div>
            )}

            {!room && loading && (
              <div className="grid min-h-[180px] place-items-center">
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-300">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Opening chat...
                </div>
              </div>
            )}

            {!loading && messages.length === 0 && (
              <div className="grid min-h-[180px] place-items-center">
                <div className="max-w-[260px] rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-4 text-center text-sm leading-6 text-slate-400">
                  The trade room is ready. Use it for delivery updates, proof, and dispute evidence.
                </div>
              </div>
            )}

            <div className="grid gap-3">
              {messages.map((message) => {
                const ownMessage =
                  normalizeUsername(message.senderPiUsername) === currentUsername &&
                  message.senderRole !== "system";
                const systemMessage = message.senderRole === "system";
                const adminMessage = message.senderRole === "admin";
                const roleLabel = roleLabelFor(message.senderRole);
                const senderProfile =
                  message.senderProfile ?? profileForUsername(message.senderPiUsername);

                if (systemMessage) {
                  return (
                    <div
                      key={message.id}
                      className="mx-auto max-w-[280px] rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-center text-xs font-semibold leading-6 text-slate-300"
                    >
                      {message.body}
                    </div>
                  );
                }

                return (
                  <div
                    key={message.id}
                    className={`flex ${ownMessage ? "justify-end" : "justify-start"}`}
                  >
                    <article
                      className={`max-w-[85%] rounded-[22px] px-4 py-3 shadow-[0_16px_36px_rgba(0,0,0,0.24)] ${
                        ownMessage
                          ? "bg-[linear-gradient(135deg,var(--gold),var(--gold-strong))] text-slate-950"
                          : adminMessage
                            ? "border border-violet-400/20 bg-violet-500/10 text-violet-50"
                            : "border border-white/8 bg-white/[0.05] text-slate-100"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <VerifiedUsername
                          className={ownMessage ? "text-slate-900/70" : "text-slate-400"}
                          onClick={
                            senderProfile ? () => setSelectedProfile(senderProfile) : undefined
                          }
                          profile={senderProfile}
                          username={message.senderPiUsername}
                        />
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${roleBadgeClassFor(
                            message.senderRole,
                            ownMessage,
                          )}`}
                        >
                          {roleLabel}
                        </span>
                      </div>
                      {message.body && (
                        <p className="mt-1 text-sm leading-6">{message.body}</p>
                      )}
                      {message.attachmentUrl && (
                        <div className="mt-2 overflow-hidden rounded-2xl border border-black/8 bg-black/10">
                          {isImageUrl(message.attachmentUrl) ? (
                            <a
                              aria-label="Open chat proof"
                              href={message.attachmentUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                alt="Chat proof"
                                className="aspect-[4/3] w-full object-cover"
                                src={message.attachmentUrl}
                              />
                            </a>
                          ) : (
                            <a
                              className="flex items-center gap-2 px-3 py-3 text-sm font-semibold underline-offset-4 hover:underline"
                              href={message.attachmentUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <ImageUp className="h-4 w-4" />
                              Open proof
                            </a>
                          )}
                        </div>
                      )}
                      <p
                        className={`mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                          ownMessage ? "text-slate-900/60" : "text-slate-500"
                        }`}
                      >
                        {dateLabel(message.createdAt)}
                      </p>
                    </article>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          </div>

          <footer className="border-t border-white/8 bg-[rgba(6,12,24,0.96)] px-3 py-3">
            {!canSend ? (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-400">
                {trade.status === "Completed" || trade.status === "Cancelled"
                  ? "This trade chat is now read-only."
                  : trade.status === "AwaitingRelease"
                    ? "Join the release review room before you reply."
                    : "Join the dispute room before you reply."}
              </div>
            ) : (
              <form className="grid gap-2" onSubmit={(event) => onSend(trade, event)}>
                <textarea
                  className="ta min-h-[88px]"
                  maxLength={1000}
                  name="body"
                  placeholder="Write a message, delivery update, or dispute note"
                />
                <label className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-white/12 bg-white/[0.03] px-3 py-3 text-sm text-slate-300">
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <ImageUp className="h-4 w-4 text-[var(--gold)]" />
                    Attach proof image
                  </span>
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    className="max-w-[170px] text-xs font-semibold text-slate-400 file:mr-2 file:rounded-xl file:border-0 file:bg-[rgba(245,166,35,0.14)] file:px-3 file:py-2 file:text-xs file:font-black file:text-[var(--gold)]"
                    name="attachment"
                    type="file"
                  />
                </label>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs leading-5 text-slate-500">
                    JPEG, PNG, or WebP proof. Max 5 MB.
                  </p>
                  <button className="btn-g w-auto px-5" disabled={sending} type="submit">
                    {sending ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {sending ? "Sending" : "Send"}
                  </button>
                </div>
              </form>
            )}
          </footer>
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
