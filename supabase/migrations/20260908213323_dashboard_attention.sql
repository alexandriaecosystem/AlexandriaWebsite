create or replace function public.admin_get_dashboard_attention()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_community_admin(auth.uid()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'knowledge_conflicts', (
      select count(*)
      from public.knowledge_conflicts
      where status in ('OPEN', 'REVIEW_REQUIRED')
    ),
    'failed_announcements', (
      select count(*)
      from public.outbox_events
      where event_type = 'ANNOUNCEMENT_DELIVERY_REQUESTED'
        and status::text = 'DEAD_LETTER'
    )
  );
end;
$$;

revoke all on function public.admin_get_dashboard_attention() from public, anon;
grant execute on function public.admin_get_dashboard_attention() to authenticated, service_role;
