-- Allow the first-admin signup page to read only whether initial setup is still available.
-- This exposes a boolean state, never the bootstrap token or admin records.
grant usage on schema private to anon;
grant execute on function private.ajecch_setup_available() to anon;
grant execute on function public.ajecch_setup_available() to anon;

-- Require a confirmed email before the one-time bootstrap code can create the first admin.
create or replace function private.ajecch_bootstrap_super_admin(p_token text, p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  supplied_token text;
  current_user_id uuid := (select auth.uid());
  current_email text;
begin
  if current_user_id is null then
    raise exception 'Connexion requise.';
  end if;

  select u.email
  into current_email
  from auth.users as u
  where u.id = current_user_id
    and u.email_confirmed_at is not null;

  if coalesce(current_email, '') = '' then
    raise exception 'Confirmez votre adresse e-mail avant d’activer le compte administrateur.';
  end if;

  if p_display_name is null or length(trim(p_display_name)) < 2 or length(trim(p_display_name)) > 120 then
    raise exception 'Indiquez un nom valide (2 à 120 caractères).';
  end if;

  perform pg_advisory_xact_lock(hashtext('ajecch-admin-bootstrap'));

  select token
  into supplied_token
  from private.ajecch_bootstrap_tokens
  where token = p_token and used_at is null
  for update;

  if supplied_token is null then
    raise exception 'Code d’initialisation invalide ou déjà utilisé.';
  end if;

  if exists (select 1 from public.ajecch_admins where is_active = true) then
    raise exception 'La configuration initiale est déjà terminée.';
  end if;

  insert into public.ajecch_admins(user_id, display_name, email, role, seat, is_active, created_by)
  values(current_user_id, trim(p_display_name), current_email, 'super_admin', 1, true, current_user_id);

  update private.ajecch_bootstrap_tokens
  set used_at = now()
  where token = supplied_token and used_at is null;
end;
$function$;

revoke all on function private.ajecch_bootstrap_super_admin(text, text) from public, anon;
grant execute on function private.ajecch_bootstrap_super_admin(text, text) to authenticated;
