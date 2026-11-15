-- Google-backed requests for AJECCH site administration.
-- Authenticated users can request access for their own account only.
-- Only an existing active Super Admin can approve or reject a request.

create table if not exists public.ajecch_admin_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create index if not exists ajecch_admin_access_requests_status_idx
  on public.ajecch_admin_access_requests(status, requested_at desc);

alter table public.ajecch_admin_access_requests enable row level security;
revoke all on table public.ajecch_admin_access_requests from public, anon, authenticated;
grant select on table public.ajecch_admin_access_requests to authenticated;

drop policy if exists "AJECCH users and Super Admins read access requests"
  on public.ajecch_admin_access_requests;
create policy "AJECCH users and Super Admins read access requests"
  on public.ajecch_admin_access_requests
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.ajecch_has_role(array['super_admin']))
  );

-- The request identity and email are derived from the authenticated Auth user.
-- User-editable profile metadata is used only for the display label, never for authorization.
create or replace function private.ajecch_request_admin_access()
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  current_email text;
  current_display_name text;
  current_email_confirmed_at timestamptz;
  request_id uuid;
begin
  if current_user_id is null then
    raise exception 'Connectez-vous avec Google avant de demander un accès.';
  end if;

  select
    lower(trim(auth_user.email)),
    auth_user.email_confirmed_at,
    coalesce(
      nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(auth_user.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(auth_user.raw_user_meta_data ->> 'user_name'), ''),
      split_part(auth_user.email, '@', 1)
    )
  into current_email, current_email_confirmed_at, current_display_name
  from auth.users as auth_user
  where auth_user.id = current_user_id;

  if current_email is null or current_email_confirmed_at is null then
    raise exception 'Votre adresse e-mail doit être confirmée par Google.';
  end if;

  if exists (
    select 1
    from public.ajecch_admins as admin
    where admin.user_id = current_user_id
      and admin.is_active = true
  ) then
    return null;
  end if;

  insert into public.ajecch_admin_access_requests (
    user_id, email, display_name, status, requested_at, reviewed_at, reviewed_by
  )
  values (
    current_user_id, current_email, current_display_name, 'pending', now(), null, null
  )
  on conflict (user_id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        status = 'pending',
        requested_at = now(),
        reviewed_at = null,
        reviewed_by = null
  returning id into request_id;

  return request_id;
end;
$function$;

revoke all on function private.ajecch_request_admin_access() from public, anon;
grant execute on function private.ajecch_request_admin_access() to authenticated;

create or replace function public.ajecch_request_admin_access()
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.ajecch_request_admin_access();
$function$;
revoke all on function public.ajecch_request_admin_access() from public, anon;
grant execute on function public.ajecch_request_admin_access() to authenticated;

-- Approval is atomic: an admin row is created and the request is marked approved
-- in the same transaction. The second Super Admin always receives seat 2.
create or replace function private.ajecch_approve_admin_access_request(
  p_request_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  pending_request public.ajecch_admin_access_requests%rowtype;
  assigned_seat smallint;
begin
  if current_user_id is null
    or not (select private.ajecch_has_role(array['super_admin'])) then
    raise exception 'Seul un Super Admin actif peut approuver une demande.';
  end if;

  if p_role not in ('super_admin', 'publisher') then
    raise exception 'Rôle administratif invalide.';
  end if;

  assigned_seat := case when p_role = 'super_admin' then 2 else 1 end;

  select *
  into pending_request
  from public.ajecch_admin_access_requests
  where id = p_request_id and status = 'pending'
  for update;

  if not found then
    raise exception 'Cette demande n’est plus en attente.';
  end if;

  if exists (
    select 1 from public.ajecch_admins
    where user_id = pending_request.user_id and is_active = true
  ) then
    raise exception 'Ce compte possède déjà un accès administratif actif.';
  end if;

  insert into public.ajecch_admins (
    user_id, display_name, email, role, seat, is_active, created_by
  )
  values (
    pending_request.user_id,
    pending_request.display_name,
    pending_request.email,
    p_role,
    assigned_seat,
    true,
    current_user_id
  )
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        email = excluded.email,
        role = excluded.role,
        seat = excluded.seat,
        is_active = true,
        created_by = current_user_id;

  update public.ajecch_admin_access_requests
  set status = 'approved',
      reviewed_at = now(),
      reviewed_by = current_user_id
  where id = pending_request.id;
end;
$function$;

revoke all on function private.ajecch_approve_admin_access_request(uuid, text) from public, anon;
grant execute on function private.ajecch_approve_admin_access_request(uuid, text) to authenticated;

create or replace function public.ajecch_approve_admin_access_request(
  p_request_id uuid,
  p_role text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.ajecch_approve_admin_access_request(p_request_id, p_role);
$function$;
revoke all on function public.ajecch_approve_admin_access_request(uuid, text) from public, anon;
grant execute on function public.ajecch_approve_admin_access_request(uuid, text) to authenticated;

create or replace function private.ajecch_reject_admin_access_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  affected_id uuid;
begin
  if current_user_id is null
    or not (select private.ajecch_has_role(array['super_admin'])) then
    raise exception 'Seul un Super Admin actif peut refuser une demande.';
  end if;

  update public.ajecch_admin_access_requests
  set status = 'rejected',
      reviewed_at = now(),
      reviewed_by = current_user_id
  where id = p_request_id
    and status = 'pending'
  returning id into affected_id;

  if affected_id is null then
    raise exception 'Cette demande n’est plus en attente.';
  end if;
end;
$function$;

revoke all on function private.ajecch_reject_admin_access_request(uuid) from public, anon;
grant execute on function private.ajecch_reject_admin_access_request(uuid) to authenticated;

create or replace function public.ajecch_reject_admin_access_request(p_request_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.ajecch_reject_admin_access_request(p_request_id);
$function$;
revoke all on function public.ajecch_reject_admin_access_request(uuid) from public, anon;
grant execute on function public.ajecch_reject_admin_access_request(uuid) to authenticated;
