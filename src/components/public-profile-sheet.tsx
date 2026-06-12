"use client";

import { useEffect } from "react";
import { BadgeCheck, CheckCircle2, ShieldCheck, X } from "lucide-react";

import {
  buildReputationBadges,
  reputationBadgeLabel,
  totalTradeCount,
} from "@/lib/reputation";
import type { UserReputation } from "@/types/profile";

type PublicProfileSheetProps = {
  profile: UserReputation;
  onClose: () => void;
};

export function PublicProfileSheet({
  profile,
  onClose,
}: PublicProfileSheetProps) {
  const badges = buildReputationBadges(profile);

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
    <div className="pf-wrap" role="dialog" aria-modal="true">
      <button
        aria-label="Close public profile"
        className="pf-bg"
        type="button"
        onClick={onClose}
      />
      <section className="pf-card grid gap-4">
        <button
          aria-label="Close"
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/6 text-slate-300"
          type="button"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>

        <section className="grid gap-3 pr-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bdg bo">Public profile</span>
            {profile.verifiedBadge && (
              <span className="bdg border border-emerald-400/20 bg-emerald-500/10 text-emerald-100">
                Verified
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--purple),var(--gold))] text-xl font-black text-white">
              {profile.piUsername.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-2xl font-black text-white">
                  @{profile.piUsername}
                </h2>
                {profile.verifiedBadge && (
                  <BadgeCheck className="h-5 w-5 shrink-0 text-emerald-300" />
                )}
              </div>
              <p className="mt-1 text-sm text-slate-400">
                Trust score {profile.trustScore}%
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ProfileStat label="Trades" value={totalTradeCount(profile)} />
          <ProfileStat label="Completed" value={profile.successfulTrades} />
          <ProfileStat label="Disputes" value={profile.disputedTrades} />
          <ProfileStat label="Cancelled" value={profile.cancelledTrades} />
        </section>

        <section className="grid gap-3 rounded-2xl border border-white/10 bg-black/14 p-3">
          <div className="flex items-center gap-2 text-slate-400">
            <ShieldCheck className="h-4 w-4" />
            <h3 className="font-black text-white">Activity mix</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ProfileStat label="Buys" value={profile.buyCount} />
            <ProfileStat label="Sales" value={profile.sellCount} />
          </div>
        </section>

        <section className="grid gap-3 rounded-2xl border border-white/10 bg-black/14 p-3">
          <div className="flex items-center gap-2 text-slate-400">
            <CheckCircle2 className="h-4 w-4" />
            <h3 className="font-black text-white">Badges</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => (
              <span
                key={badge.id}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${
                  badge.earned
                    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                    : "border-white/10 bg-white/[0.04] text-slate-500"
                }`}
              >
                {badge.earned ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-current opacity-60" />
                )}
                {reputationBadgeLabel(badge.id)}
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] opacity-80">
                  {badge.progress}/{badge.target}
                </span>
              </span>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}

function ProfileStat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/16 p-3 text-center">
      <div className="text-lg font-black text-white">{value}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </div>
    </div>
  );
}
