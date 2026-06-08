drop policy if exists "admin actions direct access denied"
  on public.admin_actions;

create policy "admin actions direct access denied"
on public.admin_actions
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "notifications direct access denied"
  on public.notifications;

create policy "notifications direct access denied"
on public.notifications
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "feedback messages direct access denied"
  on public.feedback_messages;

create policy "feedback messages direct access denied"
on public.feedback_messages
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "trade review recommendations direct access denied"
  on public.trade_review_recommendations;

create policy "trade review recommendations direct access denied"
on public.trade_review_recommendations
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.prevent_funded_trade_identity_changes()
returns trigger
language plpgsql
set search_path = public
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

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public';
    execute 'revoke execute on function public.rls_auto_enable() from anon';
    execute 'revoke execute on function public.rls_auto_enable() from authenticated';
    execute 'alter function public.rls_auto_enable() set search_path = public';
  end if;
end;
$$;
