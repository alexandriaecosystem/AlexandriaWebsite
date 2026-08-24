create table if not exists public.admin_conversation_reads (
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (admin_user_id, user_id)
);

alter table public.admin_conversation_reads enable row level security;
revoke all on table public.admin_conversation_reads from anon, authenticated;

create or replace function public.admin_mark_conversation_read(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_community_admin(auth.uid()) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if not exists (select 1 from public.users where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;
  insert into public.admin_conversation_reads(admin_user_id, user_id, last_read_at)
  values (auth.uid(), p_user_id, now())
  on conflict (admin_user_id, user_id)
  do update set last_read_at = excluded.last_read_at;
end;
$$;
revoke all on function public.admin_mark_conversation_read(uuid) from public;
grant execute on function public.admin_mark_conversation_read(uuid) to authenticated;

create or replace function public.admin_list_users(p_limit integer default 100, p_offset integer default 0, p_search text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit,100),1),200);
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_search text := nullif(trim(coalesce(p_search,'')), '');
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_community_admin(auth.uid()) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;

  with filtered as (
    select u.*
    from public.users u
    where v_search is null
       or u.name ilike '%'||v_search||'%'
       or u.id::text ilike '%'||v_search||'%'
       or exists (
         select 1 from public.platform_accounts pa
         where pa.user_id=u.id
           and (pa.username ilike '%'||v_search||'%' or pa.phone_number ilike '%'||v_search||'%' or pa.platform_user_id ilike '%'||v_search||'%')
       )
  ), enriched as (
    select
      u.*,
      coalesce((select jsonb_agg(distinct pa.platform order by pa.platform) from public.platform_accounts pa where pa.user_id=u.id), '[]'::jsonb) as platforms,
      (
        (select count(*) from public.inbound_message_logs im where im.user_id=u.id)
        + (select count(*) from public.conversation_evidence ce
          where ce.user_id=u.id and ce.deleted_at is null and coalesce(ce.redacted_excerpt,'')<>''
            and not exists (select 1 from public.inbound_message_logs im where im.user_id=ce.user_id and im.platform::text=ce.platform::text and im.platform_message_id=ce.source_message_id))
        + (select count(*) from public.outbound_message_logs om where om.user_id=u.id)
      )::int as message_count,
      latest.occurred_at as last_message_at,
      latest.text as latest_message_text,
      latest.direction as latest_message_direction,
      latest.platform as latest_message_platform,
      case when latest_user.occurred_at is null then false when reads.last_read_at is null then true else latest_user.occurred_at > reads.last_read_at end as has_unread,
      app.status::text as application_status,
      app.final_score,
      app.recommendation::text as recommendation
    from filtered u
    left join lateral (
      select m.text, m.direction, m.platform, m.occurred_at
      from (
        select im.text, 'USER'::text as direction, im.platform::text as platform, im.occurred_at from public.inbound_message_logs im where im.user_id=u.id
        union all
        select ce.redacted_excerpt, 'USER'::text, ce.platform::text, ce.observed_at from public.conversation_evidence ce
        where ce.user_id=u.id and ce.deleted_at is null and coalesce(ce.redacted_excerpt,'')<>''
          and not exists (select 1 from public.inbound_message_logs im where im.user_id=ce.user_id and im.platform::text=ce.platform::text and im.platform_message_id=ce.source_message_id)
        union all
        select om.text, 'ASSISTANT'::text, om.platform::text, om.created_at from public.outbound_message_logs om where om.user_id=u.id
      ) m order by m.occurred_at desc limit 1
    ) latest on true
    left join lateral (
      select m.occurred_at
      from (
        select im.occurred_at from public.inbound_message_logs im where im.user_id=u.id
        union all
        select ce.observed_at from public.conversation_evidence ce
        where ce.user_id=u.id and ce.deleted_at is null and coalesce(ce.redacted_excerpt,'')<>''
          and not exists (select 1 from public.inbound_message_logs im where im.user_id=ce.user_id and im.platform::text=ce.platform::text and im.platform_message_id=ce.source_message_id)
      ) m order by m.occurred_at desc limit 1
    ) latest_user on true
    left join public.admin_conversation_reads reads on reads.admin_user_id = auth.uid() and reads.user_id = u.id
    left join lateral (
      select ca.status, ca.final_score, ca.recommendation from public.community_applications ca where ca.user_id=u.id order by ca.created_at desc limit 1
    ) app on true
  ), paged as (
    select * from enriched order by coalesce(last_message_at, created_at) desc, created_at desc limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.name,'country',p.country,'region',p.region,'preferred_language',p.preferred_language,
      'status',p.status,'created_at',p.created_at,'updated_at',p.updated_at,'platforms',p.platforms,
      'message_count',p.message_count,'last_message_at',p.last_message_at,'latest_message_text',p.latest_message_text,
      'latest_message_direction',p.latest_message_direction,'latest_message_platform',p.latest_message_platform,'has_unread',p.has_unread,
      'application_status',p.application_status,'final_score',p.final_score,'recommendation',p.recommendation
    ) order by coalesce(p.last_message_at,p.created_at) desc, p.created_at desc) from paged p), '[]'::jsonb),
    'total', (select count(*) from filtered)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.admin_get_user_conversation(p_user_id uuid, p_limit integer default 500, p_before timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users%rowtype;
  v_limit integer := least(greatest(coalesce(p_limit,500),1),1000);
  v_accounts jsonb;
  v_messages jsonb;
  v_application jsonb;
  v_access jsonb;
  v_total bigint;
begin
  if auth.uid() is null or not public.is_community_admin(auth.uid()) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into v_user from public.users where id=p_user_id;
  if v_user.id is null then raise exception 'USER_NOT_FOUND'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',pa.id,'platform',pa.platform,'platform_user_id',pa.platform_user_id,'username',pa.username,'phone_number',pa.phone_number,'created_at',pa.created_at) order by pa.created_at), '[]'::jsonb)
  into v_accounts from public.platform_accounts pa where pa.user_id=p_user_id;

  with all_messages as (
    select im.id::text as id, im.platform::text as platform, 'USER'::text as direction, im.text, im.occurred_at, false as historical_excerpt, im.platform_message_id, im.correlation_id
    from public.inbound_message_logs im where im.user_id=p_user_id and (p_before is null or im.occurred_at < p_before)
    union all
    select ce.id::text, ce.platform::text, 'USER'::text, ce.redacted_excerpt, ce.observed_at, true, ce.source_message_id, ce.correlation_id
    from public.conversation_evidence ce where ce.user_id=p_user_id and ce.deleted_at is null and coalesce(ce.redacted_excerpt,'')<>'' and (p_before is null or ce.observed_at < p_before)
      and not exists (select 1 from public.inbound_message_logs im where im.user_id=ce.user_id and im.platform::text=ce.platform::text and im.platform_message_id=ce.source_message_id)
    union all
    select om.id::text, om.platform::text, 'ASSISTANT'::text, om.text, om.created_at, false, om.platform_message_id, om.correlation_id
    from public.outbound_message_logs om where om.user_id=p_user_id and (p_before is null or om.created_at < p_before)
  ), selected as (select * from all_messages order by occurred_at desc, id desc limit v_limit)
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'platform',s.platform,'direction',s.direction,'text',s.text,'occurred_at',s.occurred_at,'historical_excerpt',s.historical_excerpt,'platform_message_id',s.platform_message_id,'correlation_id',s.correlation_id) order by s.occurred_at asc, s.id asc), '[]'::jsonb)
  into v_messages from selected s;

  select count(*) into v_total from (
    select 1 from public.inbound_message_logs im where im.user_id=p_user_id
    union all select 1 from public.conversation_evidence ce where ce.user_id=p_user_id and ce.deleted_at is null and coalesce(ce.redacted_excerpt,'')<>'' and not exists (select 1 from public.inbound_message_logs im where im.user_id=ce.user_id and im.platform::text=ce.platform::text and im.platform_message_id=ce.source_message_id)
    union all select 1 from public.outbound_message_logs om where om.user_id=p_user_id
  ) q;

  select to_jsonb(app) into v_application from (
    select ca.id, ca.status::text as status, ca.final_score, ca.recommendation::text as recommendation, ca.strengths, ca.concerns, ca.evidence, ca.evaluation_summary, ca.behavior_signals, ca.started_at, ca.submitted_at, ca.reviewed_at
    from public.community_applications ca where ca.user_id=p_user_id order by ca.created_at desc limit 1
  ) app;

  select to_jsonb(acc) into v_access from (
    select ca.state::text as state, ca.invite_sent_at, ca.join_requested_at, ca.activated_at, ca.left_at, ca.removed_at, ca.last_verified_at, ca.last_error, ca.updated_at
    from public.community_access ca where ca.user_id=p_user_id order by ca.updated_at desc limit 1
  ) acc;

  return jsonb_build_object(
    'user', jsonb_build_object('id',v_user.id,'name',v_user.name,'country',v_user.country,'region',v_user.region,'preferred_language',v_user.preferred_language,'status',v_user.status,'created_at',v_user.created_at,'updated_at',v_user.updated_at),
    'platform_accounts',v_accounts,'application',v_application,'access',v_access,'messages',v_messages,'message_count',v_total
  );
end;
$$;

update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array[
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'application/octet-stream'
    ]::text[]
where id = 'knowledge-base';
