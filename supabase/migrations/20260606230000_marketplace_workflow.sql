alter table public.trades
  add column if not exists visibility text not null default 'public',
  add column if not exists target_buyer_pi_usernames text[] not null default '{}'::text[],
  add column if not exists selected_interest_id uuid;

alter table public.trades
  alter column buyer_user_id drop not null;

update public.trades
set seller_user_id = users.id
from public.users
where public.trades.seller_user_id is null
  and users.pi_username = public.trades.seller_pi_username;

alter table public.trades
  alter column status set default 'Draft';

alter table public.trades
  add constraint trades_visibility_check
  check (visibility in ('public', 'private')) not valid;

alter table public.trades
  validate constraint trades_visibility_check;

create table if not exists public.trade_interests (
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

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trades_selected_interest_id_fkey'
  ) then
    alter table public.trades
      add constraint trades_selected_interest_id_fkey
      foreign key (selected_interest_id)
      references public.trade_interests(id)
      on delete set null;
  end if;
end $$;

alter table public.trade_interests enable row level security;

create policy "trade interests are readable to authenticated app users"
on public.trade_interests for select
using (true);

create index if not exists trades_seller_user_id_idx on public.trades (seller_user_id);
create index if not exists trades_visibility_idx on public.trades (visibility);
create index if not exists trades_target_buyer_pi_usernames_idx
  on public.trades using gin (target_buyer_pi_usernames);
create index if not exists trade_interests_trade_id_idx
  on public.trade_interests (trade_id, created_at desc);
create index if not exists trade_interests_buyer_user_id_idx
  on public.trade_interests (buyer_user_id);
create index if not exists trade_interests_status_idx
  on public.trade_interests (status);

alter table public.payments
  add column if not exists seller_amount_test_pi numeric(18, 8),
  add column if not exists platform_fee_test_pi numeric(18, 8),
  add column if not exists buyer_total_test_pi numeric(18, 8);
