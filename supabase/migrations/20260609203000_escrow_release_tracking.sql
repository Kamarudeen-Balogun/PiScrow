alter type trade_status add value if not exists 'AwaitingRelease';

alter table public.payments
  add column if not exists buyer_payment_txid text,
  add column if not exists buyer_payment_link text,
  add column if not exists escrow_status text not null default 'buyer_pending',
  add column if not exists release_type text,
  add column if not exists release_status text not null default 'NotStarted',
  add column if not exists release_pi_payment_id text,
  add column if not exists release_txid text,
  add column if not exists release_transaction_link text,
  add column if not exists release_amount_test_pi numeric(18, 8),
  add column if not exists release_target_user_id uuid references public.users(id) on delete set null,
  add column if not exists release_target_pi_username text,
  add column if not exists release_requested_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists release_requested_at timestamptz,
  add column if not exists release_completed_at timestamptz,
  add column if not exists release_failure text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_escrow_status_check'
  ) then
    alter table public.payments
      add constraint payments_escrow_status_check
      check (
        escrow_status is null or escrow_status in (
          'buyer_pending',
          'held_in_app',
          'release_pending',
          'released_to_seller',
          'refund_pending',
          'refunded_to_buyer',
          'release_failed',
          'refund_failed'
        )
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_release_type_check'
  ) then
    alter table public.payments
      add constraint payments_release_type_check
      check (
        release_type is null or release_type in ('seller_release', 'buyer_refund')
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_release_status_check'
  ) then
    alter table public.payments
      add constraint payments_release_status_check
      check (
        release_status is null or release_status in (
          'NotStarted',
          'Created',
          'Submitted',
          'Completed',
          'Failed',
          'Cancelled'
        )
      ) not valid;
  end if;
end $$;

alter table public.payments validate constraint payments_escrow_status_check;
alter table public.payments validate constraint payments_release_type_check;
alter table public.payments validate constraint payments_release_status_check;

update public.payments
set escrow_status = case
  when release_status = 'Completed' and release_type = 'seller_release'
    then 'released_to_seller'
  when release_status = 'Completed' and release_type = 'buyer_refund'
    then 'refunded_to_buyer'
  when status = 'Completed'
    then 'held_in_app'
  else escrow_status
end
where escrow_status is null
  or escrow_status = 'buyer_pending';

create unique index if not exists payments_release_pi_payment_id_idx
  on public.payments (release_pi_payment_id)
  where release_pi_payment_id is not null;

create index if not exists payments_escrow_status_idx
  on public.payments (escrow_status, updated_at desc);

create index if not exists payments_release_status_idx
  on public.payments (release_status, updated_at desc);

create index if not exists payments_buyer_payment_txid_idx
  on public.payments (buyer_payment_txid)
  where buyer_payment_txid is not null;

create index if not exists payments_release_txid_idx
  on public.payments (release_txid)
  where release_txid is not null;
