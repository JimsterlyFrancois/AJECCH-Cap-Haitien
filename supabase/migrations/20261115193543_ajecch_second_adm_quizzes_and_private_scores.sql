
-- AJECCH: second ADM self-registration/approval with identity isolation,
-- shared publishing powers, and private-answer quizzes with per-user scoring.

-- A second ADM can only read their own admin row; the existing ADM1 alone can
-- inspect the directory and other administration records.
drop policy if exists "AJECCH admins can read their own record or all as ADM"
  on public.ajecch_admins;
create policy "AJECCH admins read own record or all as ADM 1"
  on public.ajecch_admins
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.ajecch_is_primary_admin())
  );

-- Applicants must use guarded RPCs. Their own request is returned through a
-- projection that never discloses the reviewing administrator's user id.
drop policy if exists "AJECCH users and ADM read access requests"
  on public.ajecch_admin_access_requests;
create policy "AJECCH ADM 1 reads access requests"
  on public.ajecch_admin_access_requests
  for select to authenticated
  using ((select private.ajecch_is_primary_admin()));

create or replace function private.ajecch_second_admin_signup_available()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    exists (
      select 1 from public.ajecch_admins
      where role = 'super_admin' and seat = 1 and is_active = true
    )
    and not exists (
      select 1 from public.ajecch_admins
      where role = 'super_admin' and seat = 2 and is_active = true
    )
    and not exists (
      select 1 from public.ajecch_admin_access_requests
      where status = 'pending'
    );
$function$;
revoke all on function private.ajecch_second_admin_signup_available() from public, anon, authenticated;
grant execute on function private.ajecch_second_admin_signup_available() to anon, authenticated;

create or replace function public.ajecch_second_admin_signup_available()
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.ajecch_second_admin_signup_available();
$function$;
revoke all on function public.ajecch_second_admin_signup_available() from public, anon, authenticated;
grant execute on function public.ajecch_second_admin_signup_available() to anon, authenticated;

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

create or replace function public.ajecch_submit_admin_access_request()
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.ajecch_submit_admin_access_request();
$function$;
revoke all on function public.ajecch_submit_admin_access_request() from public, anon;
grant execute on function public.ajecch_submit_admin_access_request() to authenticated;

create or replace function private.ajecch_my_admin_access_request()
returns table (
  email text,
  display_name text,
  status text,
  requested_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select r.email, r.display_name, r.status, r.requested_at
  from public.ajecch_admin_access_requests r
  where r.user_id = (select auth.uid())
  limit 1;
$function$;
revoke all on function private.ajecch_my_admin_access_request() from public, anon;
grant execute on function private.ajecch_my_admin_access_request() to authenticated;

create or replace function public.ajecch_my_admin_access_request()
returns table (
  email text,
  display_name text,
  status text,
  requested_at timestamptz
)
language sql
security invoker
set search_path = ''
as $function$
  select * from private.ajecch_my_admin_access_request();
$function$;
revoke all on function public.ajecch_my_admin_access_request() from public, anon;
grant execute on function public.ajecch_my_admin_access_request() to authenticated;

-- Approval is now specifically for the one second ADM seat. The caller cannot
-- turn an application into a publisher role or assign another seat.
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

  if p_role <> 'super_admin' then
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

-- Quiz catalogue: published questions are readable, answer keys never are.
create table if not exists public.ajecch_quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 140),
  description text not null default '',
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.ajecch_quiz_answer_keys (
  quiz_id uuid not null references public.ajecch_quizzes(id) on delete cascade,
  question_id text not null,
  correct_index smallint not null check (correct_index between 0 and 4),
  primary key (quiz_id, question_id)
);

create table if not exists public.ajecch_quiz_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references public.ajecch_quizzes(id) on delete cascade,
  question_id text not null,
  selected_index smallint not null check (selected_index between 0 and 4),
  is_correct boolean not null,
  points_awarded integer not null default 0 check (points_awarded in (0, 1)),
  answered_at timestamptz not null default now(),
  unique (user_id, quiz_id, question_id)
);

create index if not exists ajecch_quizzes_status_published_idx
  on public.ajecch_quizzes(status, published_at desc);
create index if not exists ajecch_quiz_responses_user_score_idx
  on public.ajecch_quiz_responses(user_id, points_awarded);

alter table public.ajecch_quizzes enable row level security;
alter table private.ajecch_quiz_answer_keys enable row level security;
alter table public.ajecch_quiz_responses enable row level security;

drop policy if exists "AJECCH public reads published quizzes" on public.ajecch_quizzes;
create policy "AJECCH public reads published quizzes"
  on public.ajecch_quizzes for select to anon
  using (status = 'published');

drop policy if exists "AJECCH signed-in users read published quizzes and ADM reads all" on public.ajecch_quizzes;
create policy "AJECCH signed-in users read published quizzes and ADM reads all"
  on public.ajecch_quizzes for select to authenticated
  using (status = 'published' or (select private.ajecch_has_role(array['super_admin','publisher'])));

drop policy if exists "AJECCH ADM saves quizzes" on public.ajecch_quizzes;
create policy "AJECCH ADM saves quizzes" on public.ajecch_quizzes
  for insert to authenticated
  with check ((select private.ajecch_has_role(array['super_admin','publisher'])));

drop policy if exists "AJECCH ADM updates quizzes" on public.ajecch_quizzes;
create policy "AJECCH ADM updates quizzes" on public.ajecch_quizzes
  for update to authenticated
  using ((select private.ajecch_has_role(array['super_admin','publisher'])))
  with check ((select private.ajecch_has_role(array['super_admin','publisher'])));

drop policy if exists "AJECCH ADM deletes quizzes" on public.ajecch_quizzes;
create policy "AJECCH ADM deletes quizzes" on public.ajecch_quizzes
  for delete to authenticated
  using ((select private.ajecch_has_role(array['super_admin','publisher'])));

drop policy if exists "AJECCH users read only their quiz responses" on public.ajecch_quiz_responses;
create policy "AJECCH users read only their quiz responses"
  on public.ajecch_quiz_responses for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.ajecch_quizzes from anon, authenticated;
grant select on public.ajecch_quizzes to anon, authenticated;
grant insert, update, delete on public.ajecch_quizzes to authenticated;
revoke all on private.ajecch_quiz_answer_keys from public, anon, authenticated;
revoke all on public.ajecch_quiz_responses from public, anon, authenticated;
grant select on public.ajecch_quiz_responses to authenticated;

create or replace function private.ajecch_list_quizzes_admin()
returns table (
  id uuid,
  title text,
  description text,
  questions jsonb,
  answer_keys jsonb,
  status text,
  published_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or not (select private.ajecch_has_role(array['super_admin','publisher'])) then
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
revoke all on function private.ajecch_list_quizzes_admin() from public, anon;
grant execute on function private.ajecch_list_quizzes_admin() to authenticated;

create or replace function public.ajecch_list_quizzes_admin()
returns table (
  id uuid,
  title text,
  description text,
  questions jsonb,
  answer_keys jsonb,
  status text,
  published_at timestamptz,
  created_at timestamptz
)
language sql
security invoker
set search_path = ''
as $function$
  select * from private.ajecch_list_quizzes_admin();
$function$;
revoke all on function public.ajecch_list_quizzes_admin() from public, anon;
grant execute on function public.ajecch_list_quizzes_admin() to authenticated;

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
  current_quiz public.ajecch_quizzes%rowtype;
  saved_id uuid;
begin
  if current_user_id is null
    or not (select private.ajecch_has_role(array['super_admin','publisher'])) then
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
revoke all on function private.ajecch_save_quiz(uuid,text,text,jsonb,jsonb,text) from public, anon;
grant execute on function private.ajecch_save_quiz(uuid,text,text,jsonb,jsonb,text) to authenticated;

create or replace function public.ajecch_save_quiz(
  p_quiz_id uuid,
  p_title text,
  p_description text,
  p_questions jsonb,
  p_answer_keys jsonb,
  p_status text
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.ajecch_save_quiz(p_quiz_id,p_title,p_description,p_questions,p_answer_keys,p_status);
$function$;
revoke all on function public.ajecch_save_quiz(uuid,text,text,jsonb,jsonb,text) from public, anon;
grant execute on function public.ajecch_save_quiz(uuid,text,text,jsonb,jsonb,text) to authenticated;

create or replace function private.ajecch_delete_quiz(p_quiz_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or not (select private.ajecch_has_role(array['super_admin','publisher'])) then
    raise exception 'Accès réservé à l’administration.';
  end if;

  if exists (select 1 from public.ajecch_quiz_responses where quiz_id = p_quiz_id) then
    raise exception 'Ce quiz contient déjà des participations et ne peut pas être supprimé.';
  end if;

  delete from public.ajecch_quizzes where id = p_quiz_id;
  if not found then raise exception 'Quiz introuvable.'; end if;
end;
$function$;
revoke all on function private.ajecch_delete_quiz(uuid) from public, anon;
grant execute on function private.ajecch_delete_quiz(uuid) to authenticated;

create or replace function public.ajecch_delete_quiz(p_quiz_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.ajecch_delete_quiz(p_quiz_id);
$function$;
revoke all on function public.ajecch_delete_quiz(uuid) from public, anon;
grant execute on function public.ajecch_delete_quiz(uuid) to authenticated;

create or replace function private.ajecch_submit_quiz_answer(
  p_quiz_id uuid,
  p_question_id text,
  p_selected_index integer
)
returns table (
  is_correct boolean,
  points_awarded integer,
  total_score integer,
  correct_option_index integer,
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

  select item.value into question
  from public.ajecch_quizzes quiz,
       jsonb_array_elements(quiz.questions) as item(value)
  where quiz.id = p_quiz_id
    and quiz.status = 'published'
    and item.value ->> 'id' = p_question_id;

  if question is null then
    raise exception 'Question introuvable ou quiz non publié.';
  end if;

  question_options := question -> 'options';
  if p_selected_index is null or p_selected_index < 0
    or p_selected_index >= jsonb_array_length(question_options) then
    raise exception 'Sélection de réponse invalide.';
  end if;

  select answer.correct_index into correct_index
  from private.ajecch_quiz_answer_keys answer
  where answer.quiz_id = p_quiz_id
    and answer.question_id = p_question_id;

  if correct_index is null then
    raise exception 'La correction de cette question est indisponible.';
  end if;

  submitted_correctly := p_selected_index = correct_index;

  insert into public.ajecch_quiz_responses(
    user_id, quiz_id, question_id, selected_index, is_correct, points_awarded
  )
  values(
    current_user_id, p_quiz_id, p_question_id, p_selected_index,
    submitted_correctly, case when submitted_correctly then 1 else 0 end
  )
  on conflict (user_id, quiz_id, question_id) do nothing;

  get diagnostics inserted_rows = row_count;
  if inserted_rows = 0 then
    select * into saved_response
    from public.ajecch_quiz_responses
    where user_id = current_user_id and quiz_id = p_quiz_id and question_id = p_question_id;
    submitted_correctly := saved_response.is_correct;
    p_selected_index := saved_response.selected_index;
  end if;

  return query
  select submitted_correctly,
         case when submitted_correctly then 1 else 0 end,
         coalesce((
           select sum(response.points_awarded)::integer
           from public.ajecch_quiz_responses response
           where response.user_id = current_user_id
         ), 0),
         correct_index,
         inserted_rows = 0;
end;
$function$;
revoke all on function private.ajecch_submit_quiz_answer(uuid,text,integer) from public, anon;
grant execute on function private.ajecch_submit_quiz_answer(uuid,text,integer) to authenticated;

create or replace function public.ajecch_submit_quiz_answer(
  p_quiz_id uuid,
  p_question_id text,
  p_selected_index integer
)
returns table (
  is_correct boolean,
  points_awarded integer,
  total_score integer,
  correct_option_index integer,
  already_answered boolean
)
language sql
security invoker
set search_path = ''
as $function$
  select * from private.ajecch_submit_quiz_answer(p_quiz_id,p_question_id,p_selected_index);
$function$;
revoke all on function public.ajecch_submit_quiz_answer(uuid,text,integer) from public, anon;
grant execute on function public.ajecch_submit_quiz_answer(uuid,text,integer) to authenticated;

create or replace function private.ajecch_my_quiz_score()
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(sum(response.points_awarded)::integer, 0)
  from public.ajecch_quiz_responses response
  where response.user_id = (select auth.uid());
$function$;
revoke all on function private.ajecch_my_quiz_score() from public, anon;
grant execute on function private.ajecch_my_quiz_score() to authenticated;

create or replace function public.ajecch_my_quiz_score()
returns integer
language sql
security invoker
set search_path = ''
as $function$
  select private.ajecch_my_quiz_score();
$function$;
revoke all on function public.ajecch_my_quiz_score() from public, anon;
grant execute on function public.ajecch_my_quiz_score() to authenticated;
