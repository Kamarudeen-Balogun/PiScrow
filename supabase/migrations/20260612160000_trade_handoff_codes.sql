create table if not exists public.trade_handoff_codes (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null unique references public.trades(id) on delete cascade,
  buyer_user_id uuid not null references public.users(id) on delete cascade,
  seller_user_id uuid not null references public.users(id) on delete cascade,
  code_hash text not null,
  code_last4 text not null,
  expires_at timestamptz not null,
  generated_at timestamptz not null default now(),
  last_revealed_at timestamptz,
  reveal_count integer not null default 0 check (reveal_count >= 0),
  verify_attempt_count integer not null default 0 check (verify_attempt_count >= 0),
  last_attempt_at timestamptz,
  used_at timestamptz,
  used_by_user_id uuid references public.users(id) on delete set null,
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trade_handoff_codes_buyer_idx
  on public.trade_handoff_codes (buyer_user_id, generated_at desc);

create index if not exists trade_handoff_codes_seller_idx
  on public.trade_handoff_codes (seller_user_id, generated_at desc);

create index if not exists trade_handoff_codes_expiry_idx
  on public.trade_handoff_codes (expires_at)
  where used_at is null and invalidated_at is null;

alter table public.trade_handoff_codes enable row level security;

create policy "trade handoff codes direct access denied"
on public.trade_handoff_codes
for all
to anon, authenticated
using (false)
with check (false);
