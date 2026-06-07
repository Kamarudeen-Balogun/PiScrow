alter table public.trades
  add column if not exists selected_at timestamptz,
  add column if not exists selection_expires_at timestamptz;

alter table public.users
  add column if not exists profile_bio text,
  add column if not exists verified_badge boolean not null default false,
  add column if not exists verification_requested_at timestamptz,
  add column if not exists verification_reviewed_at timestamptz,
  add column if not exists verification_reviewed_by text;

create index if not exists trades_active_selection_idx
  on public.trades (status, selection_expires_at)
  where status = 'PendingFunding';

create index if not exists trades_selected_interest_id_idx
  on public.trades (selected_interest_id)
  where selected_interest_id is not null;

create index if not exists users_verification_requested_idx
  on public.users (verification_requested_at desc)
  where verification_requested_at is not null
    and verified_badge = false;

create index if not exists users_verified_badge_idx
  on public.users (verified_badge, pi_username);
