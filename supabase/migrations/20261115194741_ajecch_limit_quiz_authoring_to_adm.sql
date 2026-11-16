-- Restrict quiz authoring and answer-key access to ADM 1 and ADM 2.
drop policy if exists "AJECCH signed-in users read published quizzes and ADM reads all" on public.ajecch_quizzes;
create policy "AJECCH signed-in ADM reads drafts and published quizzes"
  on public.ajecch_quizzes for select to authenticated
  using (status = 'published' or (select private.ajecch_has_role(array['super_admin'])));

drop policy if exists "AJECCH ADM saves quizzes" on public.ajecch_quizzes;
create policy "AJECCH ADM 1 and ADM 2 save quizzes"
  on public.ajecch_quizzes for insert to authenticated
  with check ((select private.ajecch_has_role(array['super_admin'])));

drop policy if exists "AJECCH ADM updates quizzes" on public.ajecch_quizzes;
create policy "AJECCH ADM 1 and ADM 2 update quizzes"
  on public.ajecch_quizzes for update to authenticated
  using ((select private.ajecch_has_role(array['super_admin'])))
  with check ((select private.ajecch_has_role(array['super_admin'])));

drop policy if exists "AJECCH ADM deletes quizzes" on public.ajecch_quizzes;
create policy "AJECCH ADM 1 and ADM 2 delete quizzes"
  on public.ajecch_quizzes for delete to authenticated
  using ((select private.ajecch_has_role(array['super_admin'])));

CREATE OR REPLACE FUNCTION private.ajecch_delete_quiz(p_quiz_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null
    or not (select private.ajecch_has_role(array['super_admin'])) then
    raise exception 'Accès réservé à l’administration.';
  end if;

  if exists (select 1 from public.ajecch_quiz_responses where quiz_id = p_quiz_id) then
    raise exception 'Ce quiz contient déjà des participations et ne peut pas être supprimé.';
  end if;

  delete from public.ajecch_quizzes where id = p_quiz_id;
  if not found then raise exception 'Quiz introuvable.'; end if;
end;
$function$;

revoke all on function private.ajecch_delete_quiz (uuid) from public, anon;
grant execute on function private.ajecch_delete_quiz (uuid) to authenticated;

CREATE OR REPLACE FUNCTION private.ajecch_list_quizzes_admin()
 RETURNS TABLE(id uuid, title text, description text, questions jsonb, answer_keys jsonb, status text, published_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null
    or not (select private.ajecch_has_role(array['super_admin'])) then
    raise exception 'Accès réservé à l’administration.';
  end if;

  return query
  select q.id, q.title, q.description, q.questions,
    coalesce(
      (select jsonb_object_agg(k.question_id, k.correct_index)
       from private.ajecch_quiz_answer_keys k where k.quiz_id = q.id),
      '{}'::jsonb
    ),
    q.status, q.published_at, q.created_at
  from public.ajecch_quizzes q
  order by q.created_at desc;
end;
$function$;

revoke all on function private.ajecch_list_quizzes_admin () from public, anon;
grant execute on function private.ajecch_list_quizzes_admin () to authenticated;

CREATE OR REPLACE FUNCTION private.ajecch_save_quiz(p_quiz_id uuid, p_title text, p_description text, p_questions jsonb, p_answer_keys jsonb, p_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  question jsonb;
  question_id text;
  option_index integer;
  answer_index integer;
  option_text text;
  seen_ids text[] := array[]::text[];
  question_count integer;
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
  if p_status not in ('draft', 'published') then
    raise exception 'Statut de quiz invalide.';
  end if;
  if jsonb_typeof(p_questions) <> 'array'
    or jsonb_array_length(p_questions) not between 1 and 12
    or jsonb_typeof(p_answer_keys) <> 'object' then
    raise exception 'Un quiz doit contenir de 1 à 12 questions.';
  end if;

  question_count := jsonb_array_length(p_questions);
  if jsonb_object_length(p_answer_keys) <> question_count then
    raise exception 'Chaque question doit avoir une seule réponse correcte.';
  end if;

  for question in select value from jsonb_array_elements(p_questions) as item(value) loop
    question_id := nullif(trim(question ->> 'id'), '');
    if question_id is null or question_id = any(seen_ids) then
      raise exception 'Identifiant de question manquant ou dupliqué.';
    end if;
    seen_ids := array_append(seen_ids, question_id);

    if char_length(trim(coalesce(question ->> 'prompt', ''))) not between 3 and 500
      or jsonb_typeof(question -> 'options') <> 'array'
      or jsonb_array_length(question -> 'options') not between 2 and 5 then
      raise exception 'Chaque question doit avoir un énoncé et 2 à 5 choix.';
    end if;

    for option_index in 0..jsonb_array_length(question -> 'options') - 1 loop
      option_text := trim(question -> 'options' ->> option_index);
      if option_text is null or char_length(option_text) not between 1 and 240 then
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
    select * into current_quiz from public.ajecch_quizzes
    where id = p_quiz_id for update;
    if not found then
      raise exception 'Quiz introuvable.';
    end if;

    if exists (select 1 from public.ajecch_quiz_responses where quiz_id = p_quiz_id)
      and current_quiz.questions is distinct from p_questions then
      raise exception 'Ce quiz a déjà reçu des réponses. Créez un nouveau quiz pour modifier les questions.';
    end if;

    if exists (select 1 from public.ajecch_quiz_responses where quiz_id = p_quiz_id)
      and exists (
        select 1 from private.ajecch_quiz_answer_keys k
        where k.quiz_id = p_quiz_id
          and (p_answer_keys ->> k.question_id) is distinct from k.correct_index::text
      ) then
      raise exception 'Les réponses ne peuvent plus être modifiées après la première participation.';
    end if;

    update public.ajecch_quizzes
    set title = trim(p_title),
        description = coalesce(trim(p_description), ''),
        questions = p_questions,
        status = p_status,
        published_at = case when p_status = 'published' then coalesce(current_quiz.published_at, now()) else null end,
        updated_by = current_user_id,
        updated_at = now()
    where id = p_quiz_id
    returning id into saved_id;
  else
    insert into public.ajecch_quizzes(title, description, questions, status, published_at, created_by, updated_by)
    values(trim(p_title), coalesce(trim(p_description), ''), p_questions, p_status,
      case when p_status = 'published' then now() else null end, current_user_id, current_user_id)
    returning id into saved_id;
  end if;

  delete from private.ajecch_quiz_answer_keys where quiz_id = saved_id;
  for question in select value from jsonb_array_elements(p_questions) as item(value) loop
    insert into private.ajecch_quiz_answer_keys(quiz_id, question_id, correct_index)
    values(saved_id, question ->> 'id', (p_answer_keys ->> (question ->> 'id'))::smallint);
  end loop;

  return saved_id;
end;
$function$;

revoke all on function private.ajecch_save_quiz (uuid,text,text,jsonb,jsonb,text) from public, anon;
grant execute on function private.ajecch_save_quiz (uuid,text,text,jsonb,jsonb,text) to authenticated;

