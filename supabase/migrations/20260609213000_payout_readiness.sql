alter table public.users
  add column if not exists payout_ready boolean not null default false,
  add column if not exists payout_readiness_confirmed_at timestamptz;

create index if not exists users_payout_ready_idx
  on public.users (payout_ready, pi_username);
