"use client";

import { BadgeCheck } from "lucide-react";

import type { UserReputation } from "@/types/profile";

type VerifiedUsernameProps = {
  username: string;
  profile?: UserReputation;
  className?: string;
  onClick?: () => void;
};

export function VerifiedUsername({
  username,
  profile,
  className = "",
  onClick,
}: VerifiedUsernameProps) {
  const verified = Boolean(profile?.verifiedBadge);
  const content = (
    <span className={`inline-flex items-center gap-1 ${className}`.trim()}>
      <span>@{username}</span>
      {verified && (
        <BadgeCheck
          aria-label="Verified user"
          className="h-3.5 w-3.5 shrink-0 text-emerald-300"
        />
      )}
    </span>
  );

  if (!onClick) {
    return content;
  }

  return (
    <button
      className="inline-flex items-center text-left transition hover:opacity-90"
      type="button"
      onClick={onClick}
    >
      {content}
    </button>
  );
}
