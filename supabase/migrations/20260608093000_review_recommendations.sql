create table if not exists public.trade_review_recommendations (
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

create index if not exists trade_review_recommendations_trade_created_idx
  on public.trade_review_recommendations (trade_id, created_at desc);

create index if not exists trade_review_recommendations_action_idx
  on public.trade_review_recommendations (recommended_action, created_at desc);

alter table public.trade_review_recommendations enable row level security;

-- Review recommendations are created through admin-only server routes. They are
-- intentionally advisory and must not be treated as automatic fund release.
