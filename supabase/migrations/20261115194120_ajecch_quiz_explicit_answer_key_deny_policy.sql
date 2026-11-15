-- Explicitly deny direct client access to the quiz answer key table.
-- Privileged SECURITY DEFINER quiz functions remain the only path to these rows.
drop policy if exists "No direct client access to quiz answer keys"
  on private.ajecch_quiz_answer_keys;
create policy "No direct client access to quiz answer keys"
  on private.ajecch_quiz_answer_keys
  for all to anon, authenticated
  using (false)
  with check (false);