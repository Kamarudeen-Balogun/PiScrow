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
  profile_bio text,
  verified_badge boolean not null default false,
  verification_requested_at timestamptz,
  verification_reviewed_at timestamptz,
  verification_reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid references public.users(id) on delete restrict,
  seller_pi_username text not null,
  seller_user_id uuid references public.users(id) on delete set null,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  target_buyer_pi_usernames text[] not null default '{}'::text[],
  selected_interest_id uuid,
  title text not null,
  description text not null,
  amount_test_pi numeric(18, 8) not null check (amount_test_pi > 0),
  status trade_status not null default 'Draft',
  location_label text,
  location_area text,
  delivery_terms text not null,
  delivery_proof_note text,
  delivery_proof_url text,
  buyer_receipt_note text,
  buyer_receipt_proof_url text,
  selected_at timestamptz,
  selection_expires_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  disputed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trade_interests (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  buyer_user_id uuid not null references public.users(id) on delete cascade,
  buyer_pi_username text not null,
  response_note text not null,
  status text not null default 'Open' check (status in ('Open', 'Selected', 'Declined', 'Withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trade_id, buyer_user_id)
);

alter table public.trades
  add constraint trades_selected_interest_id_fkey
  foreign key (selected_interest_id)
  references public.trade_interests(id)
  on delete set null;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  pi_payment_id text not null unique,
  amount_test_pi numeric(18, 8) not null check (amount_test_pi > 0),
  seller_amount_test_pi numeric(18, 8),
  platform_fee_test_pi numeric(18, 8),
  buyer_total_test_pi numeric(18, 8),
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

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  trade_id uuid references public.trades(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  pi_uid text,
  pi_username text,
  contact_email text,
  category text not null default 'suggestion'
    check (category in ('suggestion', 'improvement', 'issue', 'other')),
  message text not null check (char_length(message) between 10 and 1500),
  page_url text,
  user_agent text,
  webhook_status text not null default 'not_configured'
    check (webhook_status in ('not_configured', 'sent', 'failed')),
  webhook_error text,
  created_at timestamptz not null default now()
);

create table public.trade_review_recommendations (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  reviewed_by_pi_username text not null,
  recommended_action text not null
    check (recommended_action in ('release', 'refund', 'request_more_info', 'admin_review')),
  confidence integer not null check (confidence between 0 and 100),
  summary text not null,
  missing_evidence text[] not null default '{}'::text[],
  risk_flags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index trades_buyer_user_id_idx on public.trades (buyer_user_id);
create index trades_seller_pi_username_idx on public.trades (seller_pi_username);
create index trades_seller_user_id_idx on public.trades (seller_user_id);
create index trades_visibility_idx on public.trades (visibility);
create index trades_target_buyer_pi_usernames_idx
  on public.trades using gin (target_buyer_pi_usernames);
create index trades_status_idx on public.trades (status);
create index trades_created_at_idx on public.trades (created_at desc);
create index trades_location_area_idx on public.trades (location_area);
create index trades_active_selection_idx
  on public.trades (status, selection_expires_at)
  where status = 'PendingFunding';
create index trades_selected_interest_id_idx
  on public.trades (selected_interest_id)
  where selected_interest_id is not null;
create index trade_interests_trade_id_idx
  on public.trade_interests (trade_id, created_at desc);
create index trade_interests_buyer_user_id_idx
  on public.trade_interests (buyer_user_id);
create index trade_interests_status_idx
  on public.trade_interests (status);
create index payments_trade_id_idx on public.payments (trade_id);
create unique index payments_one_completed_per_trade_idx
  on public.payments (trade_id)
  where status = 'Completed';
create index trade_events_trade_id_idx on public.trade_events (trade_id, created_at desc);
create index disputes_trade_id_idx on public.disputes (trade_id);
create index disputes_status_idx on public.disputes (status);
create index notifications_user_created_at_idx
  on public.notifications (user_id, created_at desc);
create index notifications_trade_id_idx on public.notifications (trade_id);
create index feedback_messages_created_at_idx
  on public.feedback_messages (created_at desc);
create index feedback_messages_user_id_idx
  on public.feedback_messages (user_id, created_at desc)
  where user_id is not null;
create index trade_review_recommendations_trade_created_idx
  on public.trade_review_recommendations (trade_id, created_at desc);
create index trade_review_recommendations_action_idx
  on public.trade_review_recommendations (recommended_action, created_at desc);
create index users_verification_requested_idx
  on public.users (verification_requested_at desc)
  where verification_requested_at is not null
    and verified_badge = false;
create index users_verified_badge_idx on public.users (verified_badge, pi_username);

alter table public.users enable row level security;
alter table public.trades enable row level security;
alter table public.trade_interests enable row level security;
alter table public.payments enable row level security;
alter table public.trade_events enable row level security;
alter table public.disputes enable row level security;
alter table public.admin_actions enable row level security;
alter table public.notifications enable row level security;
alter table public.feedback_messages enable row level security;
alter table public.trade_review_recommendations enable row level security;

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

create policy "trade interests are readable to authenticated app users"
on public.trade_interests for select
using (true);

create policy "payments are readable to authenticated app users"
on public.payments for select
using (true);

create policy "disputes are readable to authenticated app users"
on public.disputes for select
using (true);

create or replace function public.prevent_funded_trade_identity_changes()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('Funded', 'DeliverySubmitted', 'Completed', 'Disputed')
    and (
      old.amount_test_pi is distinct from new.amount_test_pi
      or old.buyer_user_id is distinct from new.buyer_user_id
      or old.seller_user_id is distinct from new.seller_user_id
      or old.seller_pi_username is distinct from new.seller_pi_username
      or old.title is distinct from new.title
      or old.description is distinct from new.description
      or old.delivery_terms is distinct from new.delivery_terms
    )
  then
    raise exception 'Funded trade identity fields cannot be changed.';
  end if;

  return new;
end;
$$;

create trigger prevent_funded_trade_identity_changes_trigger
before update on public.trades
for each row
execute function public.prevent_funded_trade_identity_changes();
