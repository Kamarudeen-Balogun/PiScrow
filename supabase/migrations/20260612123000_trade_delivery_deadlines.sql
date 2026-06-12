alter table public.trades
  add column if not exists delivery_due_at timestamptz,
  add column if not exists delivery_expired_at timestamptz;

create index if not exists trades_delivery_due_idx
  on public.trades (status, delivery_due_at);
