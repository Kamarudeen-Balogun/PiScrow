create extension if not exists pgcrypto;

create type trade_status as enum (
  'Draft',
  'PendingFunding',
  'Funded',
  'DeliverySubmitted',
  'Completed',
  'Disputed',
  'Cancelled'
);

create type payment_status as enum (
  'Pending',
  'Approved',
  'Completed',
  'Failed',
  'Cancelled'
);

create type dispute_status as enum (
  'Open',
  'Resolved',
  'Cancelled'
);

create table public.users (
  id uuid primary key default gen_random_uuid(),
  pi_uid text not null unique,
  pi_username text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid references public.users(id) on delete restrict,
  seller_pi_username text not null,
  seller_user_id uuid references public.users(id) on delete set null,
  title text not null,
  description text not null,
  amount_test_pi numeric(18, 8) not null check (amount_test_pi > 0),
  status trade_status not null default 'PendingFunding',
  delivery_terms text not null,
  delivery_proof_note text,
  delivery_proof_url text,
  completed_at timestamptz,
  disputed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  pi_payment_id text not null unique,
  amount_test_pi numeric(18, 8) not null check (amount_test_pi > 0),
  status payment_status not null default 'Pending',
  raw_provider_status jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trade_events (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  event_type text not null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  opened_by_user_id uuid references public.users(id) on delete set null,
  reason text not null,
  evidence_note text,
  status dispute_status not null default 'Open',
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid references public.trades(id) on delete set null,
  admin_pi_username text not null,
  action_type text not null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index trades_buyer_user_id_idx on public.trades (buyer_user_id);
create index trades_seller_pi_username_idx on public.trades (seller_pi_username);
create index trades_status_idx on public.trades (status);
create index trades_created_at_idx on public.trades (created_at desc);
create index payments_trade_id_idx on public.payments (trade_id);
create index trade_events_trade_id_idx on public.trade_events (trade_id, created_at desc);
create index disputes_trade_id_idx on public.disputes (trade_id);
create index disputes_status_idx on public.disputes (status);

alter table public.users enable row level security;
alter table public.trades enable row level security;
alter table public.payments enable row level security;
alter table public.trade_events enable row level security;
alter table public.disputes enable row level security;
alter table public.admin_actions enable row level security;

-- MVP policies are intentionally conservative. Server routes should use the
-- service role key after validating Pi identity and trade permissions.
create policy "users can read public profiles"
on public.users for select
using (true);

create policy "trades are readable to authenticated app users"
on public.trades for select
using (true);

create policy "trade events are readable to authenticated app users"
on public.trade_events for select
using (true);

create policy "payments are readable to authenticated app users"
on public.payments for select
using (true);

create policy "disputes are readable to authenticated app users"
on public.disputes for select
using (true);
