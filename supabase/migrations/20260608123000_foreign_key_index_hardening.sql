create index if not exists admin_actions_trade_id_idx
  on public.admin_actions (trade_id);

create index if not exists disputes_opened_by_user_id_idx
  on public.disputes (opened_by_user_id);

create index if not exists trade_events_actor_user_id_idx
  on public.trade_events (actor_user_id);
