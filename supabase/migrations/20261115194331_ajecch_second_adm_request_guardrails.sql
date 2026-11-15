-- Tighten the second-ADM request path against self-application and NULL role bypasses.
create or replace function private.ajecch_submit_admin_access_request()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  current_email text;
  current_name text;
  existing_status text;
begin
  if current_user_id is null then
    raise exception 'Connectez-vous pour transmettre une demande.';
  end if;

  if exists (
    select 1 from public.ajecch_admins
    where user_id = current_user_id and is_active = true
  ) then
    raise exception 'Un compte administrateur actif ne peut pas déposer une nouvelle candidature.';
  end if;

  select lower(trim(u.email)),
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
      split_part(u.email, '@', 1)
    )
  into current_email, current_name
  from auth.users u
  where u.id = current_user_id
    and u.email_confirmed_at is not null;

  if coalesce(current_email, '') = '' then
    raise exception 'Confirmez votre adresse e-mail avant de transmettre la demande.';
  end if;

  perform pg_advisory_xact_lock(hashtext('ajecch-admin-seat-2'));

  if not exists (
    select 1 from public.ajecch_admins
    where role = 'super_admin' and seat = 1 and is_active = true
  ) then
    raise exception 'Les demandes d’accès ne sont pas ouvertes.';
  end if;

  if exists (
    select 1 from public.ajecch_admins
    where role = 'super_admin' and seat = 2 and is_active = true
  ) then
    raise exception 'Le poste ADM est déjà attribué.';
  end if;

  if exists (
    select 1 from public.ajecch_admin_access_requests
    where status = 'pending' and user_id <> current_user_id
  ) then
    raise exception 'Une demande d’accès est déjà en cours de traitement.';
  end if;

  select status into existing_status
  from public.ajecch_admin_access_requests
  where user_id = current_user_id
  for update;

  if existing_status = 'pending' then
    return;
  end if;

  insert into public.ajecch_admin_access_requests(user_id, email, display_name, status, requested_at, reviewed_at, reviewed_by)
  values(current_user_id, current_email, trim(current_name), 'pending', now(), null, null)
  on conflict (user_id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        status = 'pending',
        requested_at = now(),
        reviewed_at = null,
        reviewed_by = null;
end;
$function$;
revoke all on function private.ajecch_submit_admin_access_request() from public, anon;
grant execute on function private.ajecch_submit_admin_access_request() to authenticated;

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
  applicant_confirmed boolean;
begin
  if current_user_id is null
    or not (select private.ajecch_is_primary_admin()) then
    raise exception 'Action réservée à la gestion des accès.';
  end if;

  if p_role is distinct from 'super_admin' then
    raise exception 'Cette demande concerne exclusivement le poste ADM.';
  end if;

  perform pg_advisory_xact_lock(hashtext('ajecch-admin-seat-2'));

  select * into pending_request
  from public.ajecch_admin_access_requests
  where id = p_request_id and status = 'pending'
  for update;

  if not found then
    raise exception 'Cette demande n’est plus en attente.';
  end if;

  if exists (
    select 1 from public.ajecch_admins
    where role = 'super_admin' and seat = 2 and is_active = true
  ) then
    raise exception 'Le poste ADM est déjà attribué.';
  end if;

  select email_confirmed_at is not null into applicant_confirmed
  from auth.users where id = pending_request.user_id;

  if coalesce(applicant_confirmed, false) is not true then
    raise exception 'Le candidat doit confirmer son adresse e-mail.';
  end if;

  if exists (
    select 1 from public.ajecch_admins
    where user_id = pending_request.user_id and is_active = true
  ) then
    raise exception 'Ce compte possède déjà un accès actif.';
  end if;

  insert into public.ajecch_admins (
    user_id, display_name, email, role, seat, is_active, created_by
  )
  values (
    pending_request.user_id, pending_request.display_name, pending_request.email,
    'super_admin', 2, true, current_user_id
  )
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        email = excluded.email,
        role = 'super_admin',
        seat = 2,
        is_active = true,
        created_by = current_user_id;

  update public.ajecch_admin_access_requests
  set status = 'approved', reviewed_at = now(), reviewed_by = current_user_id
  where id = pending_request.id;
end;
$function$;
revoke all on function private.ajecch_approve_admin_access_request(uuid, text) from public, anon;
grant execute on function private.ajecch_approve_admin_access_request(uuid, text) to authenticated;