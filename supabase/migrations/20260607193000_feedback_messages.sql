create table if not exists public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  pi_uid text,
  pi_username text,
  contact_email text,
  category text not null default 'suggestion'
    check (category in ('suggestion', 'improvement', 'issue', 'other')),
  message text not null check (char_length(message) between 10 and 1500),
  page_url text,
  user_agent text,
  webhook_status text not null default 'not_configured'
    check (webhook_status in ('not_configured', 'sent', 'failed')),
  webhook_error text,
  created_at timestamptz not null default now()
);

create index if not exists feedback_messages_created_at_idx
  on public.feedback_messages (created_at desc);

create index if not exists feedback_messages_user_id_idx
  on public.feedback_messages (user_id, created_at desc)
  where user_id is not null;

alter table public.feedback_messages enable row level security;

-- Feedback writes and reads are service-role only. The app route validates input,
-- stores every submission, and optionally forwards it to the configured webhook.
