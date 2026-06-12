alter table public.trades
  add column if not exists buyer_deleted_at timestamptz,
  add column if not exists seller_deleted_at timestamptz;
