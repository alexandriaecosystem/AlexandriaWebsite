create or replace function public.admin_get_whatsapp_quiz_preview(p_limit integer default 10)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  caller_id uuid := auth.uid();
  active_admin boolean;
  requested_limit integer := least(greatest(coalesce(p_limit, 10), 1), 20);
  total_questions integer;
  active_questions integer;
  preview_questions jsonb;
begin
  if caller_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  select true into active_admin
  from public.community_admins ca
  where ca.user_id = caller_id
    and ca.is_active
  limit 1;

  if not coalesce(active_admin, false) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select
    count(*)::integer,
    count(*) filter (where q.is_active)::integer
  into total_questions, active_questions
  from public.whatsapp_quiz_questions q;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'source_question_no', q.source_question_no,
        'prompt', q.prompt,
        'options', q.options,
        'reward_credits', q.reward_credits
      )
      order by q.source_question_no
    ),
    '[]'::jsonb
  )
  into preview_questions
  from (
    select id, source_question_no, prompt, options, reward_credits
    from public.whatsapp_quiz_questions
    where is_active
    order by random()
    limit requested_limit
  ) q;

  return jsonb_build_object(
    'questions', preview_questions,
    'question_stats', jsonb_build_object(
      'total', total_questions,
      'active', active_questions,
      'excluded', greatest(total_questions - active_questions, 0)
    ),
    'question_preview_status', 'READY'
  );
end;
$function$;

revoke all on function public.admin_get_whatsapp_quiz_preview(integer) from public;
revoke all on function public.admin_get_whatsapp_quiz_preview(integer) from anon;
grant execute on function public.admin_get_whatsapp_quiz_preview(integer) to authenticated;

comment on function public.admin_get_whatsapp_quiz_preview(integer)
is 'Returns an admin-only, read-only sample of active WhatsApp quiz questions without correct answers.';
