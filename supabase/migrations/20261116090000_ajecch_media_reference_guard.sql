-- Keep publication cover references intact. A media row cannot be deleted while
-- any publication uses it, and a live cover cannot be hidden by direct API calls.
create or replace function private.ajecch_guard_media_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1
      from public.ajecch_posts as post
      where post.cover_media_id = old.id
    ) then
      raise exception using
        errcode = '23503',
        message = 'Ce visuel est encore utilisé par une publication. Remplacez ou retirez sa couverture avant de le supprimer.';
    end if;
    return old;
  end if;

  if old.is_visible = true and new.is_visible = false then
    if exists (
      select 1
      from public.ajecch_posts as post
      where post.cover_media_id = old.id
        and post.status = 'published'
    ) then
      raise exception using
        errcode = '23514',
        message = 'Ce visuel est la couverture d’une publication en ligne. Remplacez sa couverture avant de le masquer.';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.ajecch_guard_media_references() from public, anon, authenticated;

drop trigger if exists ajecch_media_reference_guard on public.ajecch_media;
create trigger ajecch_media_reference_guard
before delete or update of is_visible on public.ajecch_media
for each row
execute function private.ajecch_guard_media_references();
