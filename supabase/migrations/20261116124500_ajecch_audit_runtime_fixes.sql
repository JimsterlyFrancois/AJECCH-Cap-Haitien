-- AJECCH audit remediation:
-- - repair JSONB answer-key validation
-- - stop returning the correct answer index to participants
-- - enforce preservation of at least one active ADM
-- - hide unused media slots and identifiable stock-photo assets without deleting data

create or replace function private.ajecch_save_quiz(
  p_quiz_id uuid,
  p_title text,
  p_description text,
  p_questions jsonb,
  p_answer_keys jsonb,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  question jsonb;
  question_id text;
  option_index integer;
  answer_index integer;
  option_text text;
  seen_ids text[] := array[]::text[];
  question_count integer;
  answer_key_count integer;
  current_quiz public.ajecch_quizzes%rowtype;
  saved_id uuid;
begin
  if current_user_id is null
    or not (select private.ajecch_has_role(array['super_admin'])) then
    raise exception 'Accès réservé à l’administration.';
  end if;

  if p_title is null or char_length(trim(p_title)) not between 3 and 140 then
    raise exception 'Le titre doit contenir entre 3 et 140 caractères.';
  end if;
  if char_length(coalesce(p_description, '')) > 500 then
    raise exception 'La description est limitée à 500 caractères.';
  end if;
  if p_status is null or p_status not in ('draft', 'published') then
    raise exception 'Statut de quiz invalide.';
  end if;

  if coalesce(jsonb_typeof(p_questions), '') <> 'array' then
    raise exception 'Les questions du quiz doivent être une liste valide.';
  end if;
  if jsonb_array_length(p_questions) not between 1 and 12 then
    raise exception 'Un quiz doit contenir de 1 à 12 questions.';
  end if;
  if coalesce(jsonb_typeof(p_answer_keys), '') <> 'object' then
    raise exception 'Les réponses correctes doivent être définies pour chaque question.';
  end if;

  question_count := jsonb_array_length(p_questions);
  select count(*)::integer
  into answer_key_count
  from pg_catalog.jsonb_object_keys(p_answer_keys) as answer_key(question_id);

  if answer_key_count <> question_count then
    raise exception 'Chaque question doit avoir une seule réponse correcte.';
  end if;

  for question in
    select value from jsonb_array_elements(p_questions) as item(value)
  loop
    if jsonb_typeof(question) is distinct from 'object' then
      raise exception 'Chaque question doit être un objet valide.';
    end if;

    question_id := nullif(trim(question ->> 'id'), '');
    if question_id is null or question_id = any(seen_ids) then
      raise exception 'Identifiant de question manquant ou dupliqué.';
    end if;
    seen_ids := array_append(seen_ids, question_id);

    if char_length(trim(coalesce(question ->> 'prompt', ''))) not between 3 and 500 then
      raise exception 'Chaque question doit avoir un énoncé de 3 à 500 caractères.';
    end if;
    if coalesce(jsonb_typeof(question -> 'options'), '') <> 'array' then
      raise exception 'Chaque question doit proposer une liste de réponses.';
    end if;
    if jsonb_array_length(question -> 'options') not between 2 and 5 then
      raise exception 'Chaque question doit proposer de 2 à 5 choix.';
    end if;

    for option_index in 0..jsonb_array_length(question -> 'options') - 1 loop
      if jsonb_typeof(question -> 'options' -> option_index) is distinct from 'string' then
        raise exception 'Chaque choix doit être un texte valide.';
      end if;

      option_text := question -> 'options' ->> option_index;
      if option_text is null or char_length(trim(option_text)) not between 1 and 240 then
        raise exception 'Chaque choix doit contenir de 1 à 240 caractères.';
      end if;
    end loop;

    if coalesce(p_answer_keys ->> question_id, '') !~ '^[0-4]$' then
      raise exception 'Désignez une réponse correcte pour chaque question.';
    end if;
    answer_index := (p_answer_keys ->> question_id)::integer;
    if answer_index >= jsonb_array_length(question -> 'options') then
      raise exception 'La réponse correcte sélectionnée ne correspond pas aux choix.';
    end if;
  end loop;

  if p_quiz_id is not null then
    select *
    into current_quiz
    from public.ajecch_quizzes
    where id = p_quiz_id
    for update;

    if not found then
      raise exception 'Quiz introuvable.';
    end if;

    if exists (
      select 1
      from public.ajecch_quiz_responses
      where quiz_id = p_quiz_id
    ) and current_quiz.questions is distinct from p_questions then
      raise exception 'Ce quiz a déjà reçu des réponses. Créez un nouveau quiz pour modifier les questions.';
    end if;

    if exists (
      select 1
      from public.ajecch_quiz_responses
      where quiz_id = p_quiz_id
    ) and exists (
      select 1
      from private.ajecch_quiz_answer_keys as answer_key
      where answer_key.quiz_id = p_quiz_id
        and (p_answer_keys ->> answer_key.question_id) is distinct from answer_key.correct_index::text
    ) then
      raise exception 'Les réponses ne peuvent plus être modifiées après la première participation.';
    end if;

    update public.ajecch_quizzes
    set title = trim(p_title),
        description = coalesce(trim(p_description), ''),
        questions = p_questions,
        status = p_status,
        published_at = case
          when p_status = 'published' then coalesce(current_quiz.published_at, now())
          else null
        end,
        updated_by = current_user_id,
        updated_at = now()
    where id = p_quiz_id
    returning id into saved_id;
  else
    insert into public.ajecch_quizzes(
      title, description, questions, status, published_at, created_by, updated_by
    )
    values(
      trim(p_title),
      coalesce(trim(p_description), ''),
      p_questions,
      p_status,
      case when p_status = 'published' then now() else null end,
      current_user_id,
      current_user_id
    )
    returning id into saved_id;
  end if;

  delete from private.ajecch_quiz_answer_keys
  where quiz_id = saved_id;

  for question in
    select value from jsonb_array_elements(p_questions) as item(value)
  loop
    insert into private.ajecch_quiz_answer_keys(quiz_id, question_id, correct_index)
    values(
      saved_id,
      question ->> 'id',
      (p_answer_keys ->> (question ->> 'id'))::smallint
    );
  end loop;

  return saved_id;
end;
$function$;

revoke all on function private.ajecch_save_quiz(uuid,text,text,jsonb,jsonb,text) from public, anon;
grant execute on function private.ajecch_save_quiz(uuid,text,text,jsonb,jsonb,text) to authenticated;

-- Drop the public wrapper first because it depends on the private function.
-- The return table is deliberately changed so the answer key index is never returned.
drop function if exists public.ajecch_submit_quiz_answer(uuid,text,integer);
drop function if exists private.ajecch_submit_quiz_answer(uuid,text,integer);

create function private.ajecch_submit_quiz_answer(
  p_quiz_id uuid,
  p_question_id text,
  p_selected_index integer
)
returns table (
  is_correct boolean,
  points_awarded integer,
  total_score integer,
  already_answered boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  question jsonb;
  question_options jsonb;
  correct_index integer;
  submitted_correctly boolean;
  saved_response public.ajecch_quiz_responses%rowtype;
  inserted_rows integer;
begin
  if current_user_id is null then
    raise exception 'Connectez-vous pour participer aux quiz.';
  end if;

  select item.value
  into question
  from public.ajecch_quizzes as quiz,
       jsonb_array_elements(quiz.questions) as item(value)
  where quiz.id = p_quiz_id
    and quiz.status = 'published'
    and item.value ->> 'id' = p_question_id;

  if question is null then
    raise exception 'Question introuvable ou quiz non publié.';
  end if;

  question_options := question -> 'options';
  if coalesce(jsonb_typeof(question_options), '') <> 'array'
    or p_selected_index is null
    or p_selected_index < 0
    or p_selected_index >= jsonb_array_length(question_options) then
    raise exception 'Sélection de réponse invalide.';
  end if;

  select answer_key.correct_index
  into correct_index
  from private.ajecch_quiz_answer_keys as answer_key
  where answer_key.quiz_id = p_quiz_id
    and answer_key.question_id = p_question_id;

  if correct_index is null then
    raise exception 'La correction de cette question est indisponible.';
  end if;

  submitted_correctly := p_selected_index = correct_index;

  insert into public.ajecch_quiz_responses(
    user_id, quiz_id, question_id, selected_index, is_correct, points_awarded
  )
  values(
    current_user_id,
    p_quiz_id,
    p_question_id,
    p_selected_index,
    submitted_correctly,
    case when submitted_correctly then 1 else 0 end
  )
  on conflict (user_id, quiz_id, question_id) do nothing;

  get diagnostics inserted_rows = row_count;

  if inserted_rows = 0 then
    select *
    into saved_response
    from public.ajecch_quiz_responses
    where user_id = current_user_id
      and quiz_id = p_quiz_id
      and question_id = p_question_id;

    submitted_correctly := saved_response.is_correct;
  end if;

  return query
  select
    submitted_correctly,
    case when submitted_correctly then 1 else 0 end,
    coalesce((
      select sum(response.points_awarded)::integer
      from public.ajecch_quiz_responses as response
      where response.user_id = current_user_id
    ), 0),
    inserted_rows = 0;
end;
$function$;

revoke all on function private.ajecch_submit_quiz_answer(uuid,text,integer) from public, anon;
grant execute on function private.ajecch_submit_quiz_answer(uuid,text,integer) to authenticated;

create function public.ajecch_submit_quiz_answer(
  p_quiz_id uuid,
  p_question_id text,
  p_selected_index integer
)
returns table (
  is_correct boolean,
  points_awarded integer,
  total_score integer,
  already_answered boolean
)
language sql
security invoker
set search_path = ''
as $function$
  select *
  from private.ajecch_submit_quiz_answer(p_quiz_id,p_question_id,p_selected_index);
$function$;

revoke all on function public.ajecch_submit_quiz_answer(uuid,text,integer) from public, anon;
grant execute on function public.ajecch_submit_quiz_answer(uuid,text,integer) to authenticated;

-- The last active ADM must not be removable by DELETE or UPDATE.
-- The advisory lock serializes concurrent changes to the ADM seats.
create or replace function private.ajecch_guard_active_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  remaining_super_admins integer;
begin
  if tg_op = 'DELETE' then
    if old.role = 'super_admin' and old.is_active is true then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('ajecch-admin-bootstrap'));

      select count(*)::integer
      into remaining_super_admins
      from public.ajecch_admins as admin
      where admin.role = 'super_admin'
        and admin.is_active is true
        and admin.user_id <> old.user_id;

      if remaining_super_admins < 1 then
        raise exception 'Au moins un compte ADM actif doit être conservé.';
      end if;
    end if;
    return old;
  end if;

  if old.role = 'super_admin'
    and old.is_active is true
    and (
      new.role is distinct from 'super_admin'
      or new.is_active is distinct from true
    ) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('ajecch-admin-bootstrap'));

    select count(*)::integer
    into remaining_super_admins
    from public.ajecch_admins as admin
    where admin.role = 'super_admin'
      and admin.is_active is true
      and admin.user_id <> old.user_id;

    if remaining_super_admins < 1 then
      raise exception 'Au moins un compte ADM actif doit être conservé.';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.ajecch_guard_active_super_admin() from public, anon, authenticated;

drop trigger if exists ajecch_admins_guard_last_super_admin on public.ajecch_admins;
create trigger ajecch_admins_guard_last_super_admin
before update or delete on public.ajecch_admins
for each row
execute function private.ajecch_guard_active_super_admin();

-- Keep existing records for recovery, but hide media placements that the public
-- site no longer renders and identifiable Pexels stock assets.
update public.ajecch_media
set is_visible = false
where is_visible is true
  and (
    slot in ('home.hero', 'home.gallery', 'home.contact')
    or coalesce(source_url, '') ilike '%pexels.com%'
    or coalesce(storage_path, '') ilike '%pexels-photo-%'
  );

notify pgrst, 'reload schema';
