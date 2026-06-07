create table if not exists public.notifications (
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

create index if not exists notifications_user_created_at_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_trade_id_idx
  on public.notifications (trade_id);

alter table public.notifications enable row level security;

-- PiScrow currently authenticates users with Pi access tokens in server routes,
-- so notification reads/writes stay service-role only until Supabase Auth is added.
