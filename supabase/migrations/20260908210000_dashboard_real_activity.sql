create or replace function public.admin_get_dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_today timestamptz := date_trunc('day', now());
  v_ai_responses bigint;
  v_cached_responses bigint;
  v_total_outbound bigint;
  v_ai_usage_events bigint;
  v_ai_usage_last_recorded timestamptz;
begin
  if not exists(select 1 from public.community_admins where user_id = auth.uid() and is_active) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*) into v_ai_responses from public.outbound_message_logs where ai_used;
  select count(*) into v_cached_responses from public.outbound_message_logs where cache_hit;
  select count(*) into v_total_outbound from public.outbound_message_logs;
  select count(*), max(created_at) into v_ai_usage_events, v_ai_usage_last_recorded from public.ai_usage_events;

  return jsonb_build_object(
    'total_users', (select count(*) from public.users),
    'active_users', (select count(*) from public.users where status = 'ACTIVE'),
    'active_users_7_days', (
      select count(distinct user_id)
      from public.processed_messages
      where processed_at >= now() - interval '7 days'
    ),
    'approved_users', (select count(distinct user_id) from public.community_applications where status = 'APPROVED'),
    'pending_reviews', (select count(*) from public.community_applications where status = 'PENDING_REVIEW'),
    'blocked_users', (select count(*) from public.users where status = 'BLOCKED'),
    'total_messages', (select count(*) from public.processed_messages),
    'messages_today', (select count(*) from public.processed_messages where processed_at >= v_today),
    'messages_last_7_days', (select count(*) from public.processed_messages where processed_at >= now() - interval '7 days'),
    'messages_last_30_days', (select count(*) from public.processed_messages where processed_at >= now() - interval '30 days'),
    'ai_responses', v_ai_responses,
    'cached_responses', v_cached_responses,
    'cache_hit_rate', case when v_total_outbound > 0 then round(v_cached_responses::numeric / v_total_outbound, 4) else 0 end,
    'input_tokens', (select coalesce(sum(input_tokens), 0) from public.ai_usage_events),
    'output_tokens', (select coalesce(sum(output_tokens), 0) from public.ai_usage_events),
    'ai_cost_total', (select coalesce(sum(cost_usd), 0) from public.ai_usage_events),
    'ai_cost_today', (select coalesce(sum(cost_usd), 0) from public.ai_usage_events where created_at >= v_today),
    'ai_cost_7_days', (select coalesce(sum(cost_usd), 0) from public.ai_usage_events where created_at >= now() - interval '7 days'),
    'ai_cost_30_days', (select coalesce(sum(cost_usd), 0) from public.ai_usage_events where created_at >= now() - interval '30 days'),
    'ai_usage_events', v_ai_usage_events,
    'ai_usage_last_recorded_at', v_ai_usage_last_recorded,
    'ai_usage_tracking_missing', v_ai_responses > 0 and v_ai_usage_events = 0,
    'failed_operations', (select count(*) from public.outbox_events where status = 'DEAD_LETTER')
  );
end
$function$;
