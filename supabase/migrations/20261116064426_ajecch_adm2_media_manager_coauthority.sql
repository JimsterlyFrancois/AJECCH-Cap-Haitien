
-- AJECCH: grant ADM 2 the same editorial, media and media-manager powers as ADM 1,
-- without exposing the ADM 1 identity or other ADM account records.

create or replace function private.ajecch_is_secondary_admin()
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
      and admin.seat = 2
      and admin.is_active = true
  );
$function$;

revoke all on function private.ajecch_is_secondary_admin() from public, anon;
grant execute on function private.ajecch_is_secondary_admin() to authenticated;

-- ADM 1 continues to see all administrative records. ADM 2 sees only their own
-- row and media-manager records, never ADM 1 or another ADM account.
drop policy if exists "AJECCH admins read own record or all as ADM 1"
  on public.ajecch_admins;
create policy "AJECCH ADM reads own record and delegated media access"
  on public.ajecch_admins
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.ajecch_is_primary_admin())
    or (
      (select private.ajecch_is_secondary_admin())
      and role = 'publisher'
      and seat = 1
    )
  );

-- The registered-account directory is shared with ADM 2 for media-manager
-- appointment, while every ADM account is omitted from ADM 2's results.
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
declare
  can_see_all_accounts boolean := (select private.ajecch_is_primary_admin());
  can_manage_media boolean := (select private.ajecch_is_secondary_admin());
begin
  if (select auth.uid()) is null
    or not (can_see_all_accounts or can_manage_media) then
    raise exception 'Accès réservé aux comptes ADM.';
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
    and (
      can_see_all_accounts
      or not exists (
        select 1
        from public.ajecch_admins as protected_admin
        where protected_admin.user_id = auth_user.id
          and protected_admin.role = 'super_admin'
      )
    )
  order by auth_user.created_at desc, lower(auth_user.email);
end;
$function$;

revoke all on function private.ajecch_list_registered_users() from public, anon;
grant execute on function private.ajecch_list_registered_users() to authenticated;

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
  has_primary_authority boolean := (select private.ajecch_is_primary_admin());
  has_secondary_authority boolean := (select private.ajecch_is_secondary_admin());
begin
  if current_user_id is null
    or not (has_primary_authority or has_secondary_authority) then
    raise exception 'Action réservée aux comptes ADM.';
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

create or replace function private.ajecch_revoke_media_manager(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  revoked_user_id uuid;
  has_primary_authority boolean := (select private.ajecch_is_primary_admin());
  has_secondary_authority boolean := (select private.ajecch_is_secondary_admin());
begin
  if current_user_id is null
    or not (has_primary_authority or has_secondary_authority) then
    raise exception 'Action réservée aux comptes ADM.';
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
