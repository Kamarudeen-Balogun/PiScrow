alter table public.trades
  add column if not exists location_label text,
  add column if not exists location_area text,
  add column if not exists buyer_receipt_note text,
  add column if not exists buyer_receipt_proof_url text,
  add column if not exists cancelled_at timestamptz;

create index if not exists trades_location_area_idx on public.trades (location_area);
