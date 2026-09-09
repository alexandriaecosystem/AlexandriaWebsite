create or replace function public.store_response_cache(
  p_cache_key text,
  p_intent text,
  p_language text,
  p_answer text,
  p_knowledge_version integer,
  p_ttl_seconds integer default 2592000
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_language text := coalesce(nullif(trim(p_language), ''), 'en');
  v_question_hash text := nullif(split_part(coalesce(p_cache_key, ''), ':', 4), '');
  v_has_aqes boolean := false;
  v_pass boolean;
  v_overall_score smallint;
  v_relevance smallint;
  v_correctness smallint;
  v_grounding smallint;
  v_completeness smallint;
  v_naturalness smallint;
  v_context_awareness smallint;
  v_fallback_quality smallint;
  v_hallucination_risk smallint;
  v_language_quality smallint;
begin
  if p_ttl_seconds not between 60 and 2592000 then
    raise exception 'validation_error' using errcode='22023';
  end if;

  -- Sending and caching have different quality bars. A response may be safe
  -- enough to send once, while still being too weak to repeat for up to 30 days.
  -- Only gate when AQES evaluated this exact outbound answer; unevaluated answers
  -- retain the existing cache behavior.
  if v_question_hash is not null then
    select
      aq.pass,
      aq.overall_score,
      aq.relevance,
      aq.correctness,
      aq.grounding,
      aq.completeness,
      aq.naturalness,
      aq.context_awareness,
      aq.fallback_quality,
      aq.hallucination_risk,
      aq.language_quality
    into
      v_pass,
      v_overall_score,
      v_relevance,
      v_correctness,
      v_grounding,
      v_completeness,
      v_naturalness,
      v_context_awareness,
      v_fallback_quality,
      v_hallucination_risk,
      v_language_quality
    from public.ai_answer_quality_events aq
    join public.outbound_message_logs o
      on o.correlation_id = aq.correlation_id
     and o.text = p_answer
    where aq.question_hash = v_question_hash
      and aq.intent = p_intent
      and aq.language = v_language
    order by aq.created_at desc
    limit 1;

    v_has_aqes := found;
  end if;

  if v_has_aqes and (
       v_pass is distinct from true
       or coalesce(v_overall_score, 0) < 4
       or coalesce(v_relevance, 0) < 4
       or coalesce(v_correctness, 0) < 4
       or coalesce(v_grounding, 0) < 4
       or coalesce(v_completeness, 0) < 4
       or coalesce(v_naturalness, 0) < 4
       or coalesce(v_context_awareness, 0) < 4
       or coalesce(v_fallback_quality, 0) < 4
       or coalesce(v_language_quality, 0) < 4
       or coalesce(v_hallucination_risk, 5) > 2
     ) then
    return jsonb_build_object(
      'stored', false,
      'cache_key', p_cache_key,
      'ttl_seconds', p_ttl_seconds,
      'reason', 'aqes_quality_gate',
      'aqes_overall_score', v_overall_score,
      'aqes_completeness', v_completeness,
      'aqes_context_awareness', v_context_awareness
    );
  end if;

  insert into public.response_cache(
    cache_key,
    intent,
    language,
    answer,
    knowledge_version,
    expires_at
  )
  values (
    p_cache_key,
    p_intent,
    v_language,
    p_answer,
    p_knowledge_version,
    now() + make_interval(secs => p_ttl_seconds)
  )
  on conflict (cache_key) do update
    set intent = excluded.intent,
        language = excluded.language,
        answer = excluded.answer,
        knowledge_version = excluded.knowledge_version,
        created_at = now(),
        expires_at = excluded.expires_at;

  return jsonb_build_object(
    'stored', true,
    'cache_key', p_cache_key,
    'ttl_seconds', p_ttl_seconds
  );
end
$function$;
