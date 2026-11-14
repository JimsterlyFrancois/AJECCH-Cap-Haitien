create table if not exists public.ajecch_notification_subscribers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  is_active boolean not null default true,
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ajecch_notification_subscribers enable row level security;
revoke all on table public.ajecch_notification_subscribers from anon, public;
grant select, insert, update, delete on table public.ajecch_notification_subscribers to authenticated;

drop policy if exists "AJECCH users manage own notification subscription" on public.ajecch_notification_subscribers;
create policy "AJECCH users manage own notification subscription"
on public.ajecch_notification_subscribers
for all to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and lower(email) = lower(coalesce((select auth.jwt()->>'email'), ''))
);

create index if not exists ajecch_notification_subscribers_active_idx
on public.ajecch_notification_subscribers(is_active) where is_active = true;
