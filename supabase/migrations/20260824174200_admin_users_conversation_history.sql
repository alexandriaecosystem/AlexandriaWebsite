create table if not exists public.inbound_message_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  platform_account_id uuid references public.platform_accounts(id) on delete set null,
  session_id uuid references public.conversation_sessions(id) on delete set null,
  platform public.platform_name not null,
  platform_message_id text not null,
  text text not null check (length(text) between 1 and 10000),
  correlation_id text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(platform, platform_message_id)
);

create index if not exists inbound_message_logs_user_occurred_idx
  on public.inbound_message_logs(user_id, occurred_at desc);

alter table public.inbound_message_logs enable row level security;
revoke all on public.inbound_message_logs from anon, authenticated;

create or replace function public.process_incoming_dm(
  p_platform text,
  p_platform_user_id text,
  p_message_id text,
  p_name text,
  p_username text,
  p_phone_number text,
  p_text text,
  p_timestamp timestamptz,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid;
  v_account uuid;
  v_session uuid;
  v_message uuid;
  v_result jsonb;
  v_profile_id uuid;
  v_preferred_language text;
begin
  if p_platform not in ('telegram','discord','whatsapp')
     or coalesce(length(p_platform_user_id),0)=0
     or coalesce(length(p_message_id),0)=0
     or coalesce(length(p_correlation_id),0)=0
     or coalesce(length(p_text),0)>10000 then
    raise exception 'validation_error' using errcode='22023';
  end if;

  select pa.user_id, pa.id into v_user, v_account
  from public.platform_accounts pa
  where pa.platform::text=p_platform::text and pa.platform_user_id=p_platform_user_id;

  if v_user is null then
    insert into public.users(name) values(nullif(p_name,'')) returning id into v_user;
    insert into public.platform_accounts(user_id,platform,platform_user_id,username,phone_number)
    values(v_user,p_platform,p_platform_user_id,nullif(p_username,''),nullif(p_phone_number,''))
    returning id into v_account;
  end if;

  insert into public.processed_messages(platform,message_id,user_id)
  values(p_platform,p_message_id,v_user)
  on conflict(platform,message_id) do nothing
  returning id into v_message;

  insert into public.conversation_sessions(user_id,platform,state,last_message_at)
  values(v_user,p_platform,'NORMAL_CHAT',coalesce(p_timestamp,now()))
  on conflict(user_id,platform) do update
    set last_message_at=excluded.last_message_at,updated_at=now()
  returning id into v_session;

  if v_message is not null then
    insert into public.inbound_message_logs(
      user_id,platform_account_id,session_id,platform,platform_message_id,text,correlation_id,occurred_at
    ) values (
      v_user,v_account,v_session,p_platform::public.platform_name,p_message_id,p_text,p_correlation_id,coalesce(p_timestamp,now())
    )
    on conflict(platform,platform_message_id) do nothing;
  end if;

  select id into v_profile_id
  from public.qualification_profiles
  where user_id=v_user
  order by updated_at desc
  limit 1;

  select preferred_language into v_preferred_language from public.users where id=v_user;

  if v_message is null then
    v_result:=public.persist_dm_evidence_eligibility(
      v_user,v_account,v_session,p_platform,p_message_id,p_correlation_id,
      'DUPLICATE',null,null,0,'processed_message_exists'
    );
    return jsonb_build_object(
      'duplicate',true,'user_id',v_user,'platform_account_id',v_account,'session_id',v_session,
      'eligibility',v_result,'profile_id',v_profile_id,'preferred_language',coalesce(v_preferred_language,'en')
    );
  end if;

  return jsonb_build_object(
    'duplicate',false,'user_id',v_user,'platform_account_id',v_account,'session_id',v_session,
    'processed_message_id',v_message,'text',p_text,'profile_id',v_profile_id,
    'preferred_language',coalesce(v_preferred_language,'en')
  );
end;
$function$;

create or replace function public.admin_list_users(
  p_limit integer default 100,
  p_offset integer default 0,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
         where pa.user_id=u.id and (
           pa.username ilike '%'||v_search||'%'
           or pa.phone_number ilike '%'||v_search||'%'
           or pa.platform_user_id ilike '%'||v_search||'%'
         )
       )
  ), enriched as (
    select u.*,
      coalesce((select jsonb_agg(distinct pa.platform order by pa.platform) from public.platform_accounts pa where pa.user_id=u.id), '[]'::jsonb) as platforms,
      ((select count(*) from public.inbound_message_logs im where im.user_id=u.id)
       +(select count(*) from public.conversation_evidence ce where ce.user_id=u.id and ce.deleted_at is null and coalesce(ce.redacted_excerpt,'')<>'' and not exists (
          select 1 from public.inbound_message_logs im where im.user_id=ce.user_id and im.platform::text=ce.platform::text and im.platform_message_id=ce.source_message_id
        ))
       +(select count(*) from public.outbound_message_logs om where om.user_id=u.id))::int as message_count,
      (select max(x.ts) from (
        select im.occurred_at as ts from public.inbound_message_logs im where im.user_id=u.id
        union all select ce.observed_at from public.conversation_evidence ce where ce.user_id=u.id and ce.deleted_at is null
        union all select om.created_at from public.outbound_message_logs om where om.user_id=u.id
      ) x) as last_message_at,
      app.status::text as application_status,
      app.final_score,
      app.recommendation::text as recommendation
    from filtered u
    left join lateral (
      select ca.status,ca.final_score,ca.recommendation
      from public.community_applications ca
      where ca.user_id=u.id
      order by ca.created_at desc limit 1
    ) app on true
  ), paged as (
    select * from enriched
    order by coalesce(last_message_at,created_at) desc, created_at desc
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.name,'country',p.country,'region',p.region,
      'preferred_language',p.preferred_language,'status',p.status,'created_at',p.created_at,'updated_at',p.updated_at,
      'platforms',p.platforms,'message_count',p.message_count,'last_message_at',p.last_message_at,
      'application_status',p.application_status,'final_score',p.final_score,'recommendation',p.recommendation
    ) order by coalesce(p.last_message_at,p.created_at) desc,p.created_at desc) from paged p),'[]'::jsonb),
    'total',(select count(*) from filtered)
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function public.admin_get_user_conversation(
  p_user_id uuid,
  p_limit integer default 500,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user public.users%rowtype;
  v_limit integer := least(greatest(coalesce(p_limit,500),1),1000);
  v_accounts jsonb;
  v_messages jsonb;
  v_application jsonb;
  v_total bigint;
begin
  if auth.uid() is null or not public.is_community_admin(auth.uid()) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  select * into v_user from public.users where id=p_user_id;
  if v_user.id is null then raise exception 'USER_NOT_FOUND'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',pa.id,'platform',pa.platform,'platform_user_id',pa.platform_user_id,
    'username',pa.username,'phone_number',pa.phone_number,'created_at',pa.created_at
  ) order by pa.created_at),'[]'::jsonb)
  into v_accounts from public.platform_accounts pa where pa.user_id=p_user_id;

  with all_messages as (
    select im.id::text as id,im.platform::text as platform,'USER'::text as direction,im.text,
      im.occurred_at,false as historical_excerpt,im.platform_message_id,im.correlation_id
    from public.inbound_message_logs im
    where im.user_id=p_user_id and (p_before is null or im.occurred_at<p_before)
    union all
    select ce.id::text,ce.platform::text,'USER'::text,ce.redacted_excerpt,ce.observed_at,true,
      ce.source_message_id,ce.correlation_id
    from public.conversation_evidence ce
    where ce.user_id=p_user_id and ce.deleted_at is null and coalesce(ce.redacted_excerpt,'')<>''
      and (p_before is null or ce.observed_at<p_before)
      and not exists (
        select 1 from public.inbound_message_logs im
        where im.user_id=ce.user_id and im.platform::text=ce.platform::text and im.platform_message_id=ce.source_message_id
      )
    union all
    select om.id::text,om.platform::text,'ASSISTANT'::text,om.text,om.created_at,false,
      om.platform_message_id,om.correlation_id
    from public.outbound_message_logs om
    where om.user_id=p_user_id and (p_before is null or om.created_at<p_before)
  ), selected as (
    select * from all_messages order by occurred_at desc,id desc limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'platform',s.platform,'direction',s.direction,'text',s.text,'occurred_at',s.occurred_at,
    'historical_excerpt',s.historical_excerpt,'platform_message_id',s.platform_message_id,'correlation_id',s.correlation_id
  ) order by s.occurred_at asc,s.id asc),'[]'::jsonb)
  into v_messages from selected s;

  select count(*) into v_total from (
    select 1 from public.inbound_message_logs im where im.user_id=p_user_id
    union all
    select 1 from public.conversation_evidence ce where ce.user_id=p_user_id and ce.deleted_at is null and coalesce(ce.redacted_excerpt,'')<>'' and not exists (
      select 1 from public.inbound_message_logs im where im.user_id=ce.user_id and im.platform::text=ce.platform::text and im.platform_message_id=ce.source_message_id
    )
    union all
    select 1 from public.outbound_message_logs om where om.user_id=p_user_id
  ) q;

  select to_jsonb(app) into v_application from (
    select ca.id,ca.status::text as status,ca.final_score,ca.recommendation::text as recommendation,
      ca.evaluation_summary,ca.started_at,ca.submitted_at,ca.reviewed_at
    from public.community_applications ca
    where ca.user_id=p_user_id order by ca.created_at desc limit 1
  ) app;

  return jsonb_build_object(
    'user',jsonb_build_object(
      'id',v_user.id,'name',v_user.name,'country',v_user.country,'region',v_user.region,
      'preferred_language',v_user.preferred_language,'status',v_user.status,
      'created_at',v_user.created_at,'updated_at',v_user.updated_at
    ),
    'platform_accounts',v_accounts,'application',v_application,'messages',v_messages,'message_count',v_total
  );
end;
$function$;

revoke all on function public.admin_list_users(integer,integer,text) from public;
revoke all on function public.admin_get_user_conversation(uuid,integer,timestamptz) from public;
grant execute on function public.admin_list_users(integer,integer,text) to authenticated;
grant execute on function public.admin_get_user_conversation(uuid,integer,timestamptz) to authenticated;
