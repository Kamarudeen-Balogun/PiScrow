create table if not exists public.trade_chat_rooms (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null unique references public.trades(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'disputed', 'closed')),
  claimed_admin_user_id uuid references public.users(id) on delete set null,
  claimed_admin_pi_username text,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trade_chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.trade_chat_rooms(id) on delete cascade,
  trade_id uuid not null references public.trades(id) on delete cascade,
  sender_user_id uuid references public.users(id) on delete set null,
  sender_pi_username text not null,
  sender_role text not null
    check (sender_role in ('buyer', 'seller', 'admin', 'system')),
  message_type text not null default 'text'
    check (message_type in ('text', 'proof', 'system')),
  body text not null default '',
  attachment_url text,
  created_at timestamptz not null default now()
);

create index if not exists trade_chat_rooms_trade_id_idx
  on public.trade_chat_rooms (trade_id);

create index if not exists trade_chat_rooms_dispute_claim_idx
  on public.trade_chat_rooms (status, claimed_admin_user_id)
  where status = 'disputed';

create index if not exists trade_chat_messages_room_created_idx
  on public.trade_chat_messages (room_id, created_at asc);

create index if not exists trade_chat_messages_trade_created_idx
  on public.trade_chat_messages (trade_id, created_at desc);

alter table public.trade_chat_rooms enable row level security;
alter table public.trade_chat_messages enable row level security;

drop policy if exists "trade chat rooms direct access denied"
  on public.trade_chat_rooms;

create policy "trade chat rooms direct access denied"
on public.trade_chat_rooms
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "trade chat messages direct access denied"
  on public.trade_chat_messages;

create policy "trade chat messages direct access denied"
on public.trade_chat_messages
for all
to anon, authenticated
using (false)
with check (false);
