-- AJECCH: make seat 1 the sole account manager and add a private registered-user directory.
-- The directory exposes only names, e-mail addresses, confirmation state and registration date
-- through guarded RPCs. Auth users are never queried directly by the browser.

create or replace function private.ajecch_is_primary_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.ajecch_admins as admin
    where admin.user_id = (select auth.uid())
      and admin.role = 'super_admin'
      and admin.seat = 1
      and admin.is_active = true
  );
$function$;

revoke all on function private.ajecch_is_primary_admin() from public, anon;
grant execute on function private.ajecch_is_primary_admin() to authenticated;

create or replace function private.ajecch_list_registered_users()
returns table (
  user_id uuid,
  display_name text,
  email text,
  email_confirmed boolean,
  created_at timestamptz,
  active_role text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or not (select private.ajecch_is_primary_admin()) then
    raise exception 'Seul le compte ADM peut consulter les comptes inscrits.';
  end if;

  return query
  select
    auth_user.id,
    coalesce(
      nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(auth_user.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(auth_user.raw_user_meta_data ->> 'user_name'), ''),
      nullif(trim(auth_user.raw_user_meta_data ->> 'display_name'), ''),
      split_part(auth_user.email, '@', 1)
    )::text,
    lower(trim(auth_user.email))::text,
    auth_user.email_confirmed_at is not null,
    auth_user.created_at,
    active_admin.role::text
  from auth.users as auth_user
  left join public.ajecch_admins as active_admin
    on active_admin.user_id = auth_user.id
   and active_admin.is_active = true
  where auth_user.email is not null
  order by auth_user.created_at desc, lower(auth_user.email);
end;
$function$;

revoke all on function private.ajecch_list_registered_users() from public, anon;
grant execute on function private.ajecch_list_registered_users() to authenticated;

create or replace function public.ajecch_list_registered_users()
returns table (
  user_id uuid,
  display_name text,
  email text,
  email_confirmed boolean,
  created_at timestamptz,
  active_role text
)
language sql
security invoker
set search_path = ''
as $function$
  select * from private.ajecch_list_registered_users();
$function$;

revoke all on function public.ajecch_list_registered_users() from public, anon;
grant execute on function public.ajecch_list_registered_users() to authenticated;

create or replace function private.ajecch_assign_media_manager(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  target_email text;
  target_display_name text;
  target_email_confirmed_at timestamptz;
begin
  if current_user_id is null
    or not (select private.ajecch_is_primary_admin()) then
    raise exception 'Seul le compte ADM peut désigner le responsable des médias.';
  end if;

  if p_user_id is null or p_user_id = current_user_id then
    raise exception 'Sélectionnez un autre compte inscrit.';
  end if;

  select
    lower(trim(auth_user.email)),
    auth_user.email_confirmed_at,
    coalesce(
      nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(auth_user.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(auth_user.raw_user_meta_data ->> 'user_name'), ''),
      nullif(trim(auth_user.raw_user_meta_data ->> 'display_name'), ''),
      split_part(auth_user.email, '@', 1)
    )
  into target_email, target_email_confirmed_at, target_display_name
  from auth.users as auth_user
  where auth_user.id = p_user_id
    and auth_user.email is not null
  for update;

  if not found then
    raise exception 'Ce compte inscrit est introuvable.';
  end if;

  if target_email_confirmed_at is null then
    raise exception 'L’adresse e-mail de ce compte doit être confirmée avant toute attribution.';
  end if;

  if exists (
    select 1
    from public.ajecch_admins as existing_admin
    where existing_admin.user_id = p_user_id
      and existing_admin.role = 'super_admin'
  ) then
    raise exception 'Un compte ADM ne peut pas être transformé en responsable des médias.';
  end if;

  if exists (
    select 1
    from public.ajecch_admins as existing_admin
    where existing_admin.user_id = p_user_id
      and existing_admin.role = 'publisher'
      and existing_admin.is_active = true
  ) then
    return;
  end if;

  if exists (
    select 1
    from public.ajecch_admins as existing_admin
    where existing_admin.role = 'publisher'
      and existing_admin.seat = 1
      and existing_admin.is_active = true
      and existing_admin.user_id <> p_user_id
  ) then
    raise exception 'Le poste de responsable des médias est déjà occupé. Révoquez d’abord son accès actuel.';
  end if;

  insert into public.ajecch_admins (
    user_id, display_name, email, role, seat, is_active, created_by
  )
  values (
    p_user_id, trim(target_display_name), target_email,
    'publisher', 1, true, current_user_id
  )
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        email = excluded.email,
        role = 'publisher',
        seat = 1,
        is_active = true,
        created_by = current_user_id
    where public.ajecch_admins.role = 'publisher';

exception
  when unique_violation then
    raise exception 'Le poste de responsable des médias est déjà attribué à un autre compte.';
end;
$function$;

revoke all on function private.ajecch_assign_media_manager(uuid) from public, anon;
grant execute on function private.ajecch_assign_media_manager(uuid) to authenticated;

create or replace function public.ajecch_assign_media_manager(p_user_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.ajecch_assign_media_manager(p_user_id);
$function$;

revoke all on function public.ajecch_assign_media_manager(uuid) from public, anon;
grant execute on function public.ajecch_assign_media_manager(uuid) to authenticated;

create or replace function private.ajecch_revoke_media_manager(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  revoked_user_id uuid;
begin
  if current_user_id is null
    or not (select private.ajecch_is_primary_admin()) then
    raise exception 'Seul le compte ADM peut révoquer le responsable des médias.';
  end if;

  update public.ajecch_admins
  set is_active = false
  where user_id = p_user_id
    and role = 'publisher'
    and seat = 1
    and is_active = true
  returning user_id into revoked_user_id;

  if revoked_user_id is null then
    raise exception 'Aucun responsable des médias actif ne correspond à ce compte.';
  end if;
end;
$function$;

revoke all on function private.ajecch_revoke_media_manager(uuid) from public, anon;
grant execute on function private.ajecch_revoke_media_manager(uuid) to authenticated;

create or replace function public.ajecch_revoke_media_manager(p_user_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.ajecch_revoke_media_manager(p_user_id);
$function$;

revoke all on function public.ajecch_revoke_media_manager(uuid) from public, anon;
grant execute on function public.ajecch_revoke_media_manager(uuid) to authenticated;

-- Only ADM 1 can inspect the registered accounts or manage administrative roles.
drop policy if exists "AJECCH admins can read their own record or all as super admin"
  on public.ajecch_admins;
create policy "AJECCH admins can read their own record or all as ADM"
  on public.ajecch_admins
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.ajecch_has_role(array['super_admin']))
  );

drop policy if exists "AJECCH super admins can add admins" on public.ajecch_admins;
create policy "AJECCH ADM can add admins" on public.ajecch_admins
  for insert to authenticated
  with check ((select private.ajecch_is_primary_admin()));

drop policy if exists "AJECCH super admins can update admins" on public.ajecch_admins;
create policy "AJECCH ADM can update admins" on public.ajecch_admins
  for update to authenticated
  using ((select private.ajecch_is_primary_admin()))
  with check ((select private.ajecch_is_primary_admin()));

drop policy if exists "AJECCH super admins can delete admin access" on public.ajecch_admins;
create policy "AJECCH ADM can delete admin access" on public.ajecch_admins
  for delete to authenticated
  using ((select private.ajecch_is_primary_admin()));

drop policy if exists "AJECCH users and Super Admins read access requests"
  on public.ajecch_admin_access_requests;
create policy "AJECCH users and ADM read access requests"
  on public.ajecch_admin_access_requests
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.ajecch_is_primary_admin())
  );

-- Keep the legacy request-approval path, but guard it with the same ADM 1 check.
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
    or not (select private.ajecch_is_primary_admin()) then
    raise exception 'Seul le compte ADM peut approuver une demande.';
  end if;

  if p_role is null or p_role not in ('super_admin', 'publisher') then
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
    or not (select private.ajecch_is_primary_admin()) then
    raise exception 'Seul le compte ADM peut refuser une demande.';
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
