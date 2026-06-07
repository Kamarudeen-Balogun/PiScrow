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

drop trigger if exists prevent_funded_trade_identity_changes_trigger
  on public.trades;

create trigger prevent_funded_trade_identity_changes_trigger
before update on public.trades
for each row
execute function public.prevent_funded_trade_identity_changes();

create unique index if not exists payments_one_completed_per_trade_idx
  on public.payments (trade_id)
  where status = 'Completed';
