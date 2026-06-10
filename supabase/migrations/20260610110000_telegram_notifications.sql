create table if not exists public.telegram_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  pi_uid text not null,
  pi_username text not null,
  telegram_chat_id text unique,
  telegram_username text,
  status text not null default 'linked'
    check (status in ('linked', 'unlinked')),
  notifications_enabled boolean not null default true,
  linked_at timestamptz,
  unlinked_at timestamptz,
  last_delivery_at timestamptz,
  last_delivery_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  channel text not null check (channel in ('telegram')),
  status text not null check (status in ('sent', 'failed', 'skipped')),
  response_code integer,
  error_message text,
  payload_snapshot jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists telegram_links_status_idx
  on public.telegram_links (status, notifications_enabled, updated_at desc);

create index if not exists telegram_links_pi_username_idx
  on public.telegram_links (pi_username);

create index if not exists notification_deliveries_notification_idx
  on public.notification_deliveries (notification_id, created_at desc);

create index if not exists notification_deliveries_user_idx
  on public.notification_deliveries (user_id, created_at desc);

create index if not exists notification_deliveries_channel_status_idx
  on public.notification_deliveries (channel, status, created_at desc);

alter table public.telegram_links enable row level security;
alter table public.notification_deliveries enable row level security;

drop policy if exists "telegram links direct access denied"
  on public.telegram_links;

create policy "telegram links direct access denied"
on public.telegram_links
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "notification deliveries direct access denied"
  on public.notification_deliveries;

create policy "notification deliveries direct access denied"
on public.notification_deliveries
for all
to anon, authenticated
using (false)
with check (false);
