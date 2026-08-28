-- Scheduled AI sleep windows for exact external channels/groups.
-- Incoming workflows should log inbound messages first, then call
-- get_ai_reply_policy immediately before any model/RAG reply generation.

create table if not exists public.ai_sleep_windows (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('TELEGRAM', 'DISCORD', 'WHATSAPP')),
  external_channel_id text not null check (length(btrim(external_channel_id)) between 1 and 255),
  external_channel_name text null check (external_channel_name is null or length(btrim(external_channel_name)) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text null check (reason is null or length(btrim(reason)) between 1 and 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz null,
  cancelled_by uuid null references auth.users(id) on delete set null,
  constraint ai_sleep_windows_valid_range check (ends_at > starts_at),
  constraint ai_sleep_windows_max_duration check (ends_at <= starts_at + interval '30 days')
);

create index if not exists ai_sleep_windows_policy_idx
  on public.ai_sleep_windows (platform, external_channel_id, starts_at, ends_at)
  where cancelled_at is null;
create index if not exists ai_sleep_windows_created_idx
  on public.ai_sleep_windows (created_at desc);

alter table public.ai_sleep_windows enable row level security;
revoke all on table public.ai_sleep_windows from public, anon, authenticated;

create or replace function public.admin_list_ai_sleep_windows(
  p_platform text default null,
  p_status text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_platform text := nullif(upper(btrim(coalesce(p_platform, ''))), '');
  v_status text := nullif(upper(btrim(coalesce(p_status, ''))), '');
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_community_admin(auth.uid()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_platform is not null and v_platform not in ('TELEGRAM','DISCORD','WHATSAPP') then
    raise exception 'INVALID_PLATFORM' using errcode = '22023';
  end if;
  if v_status is not null and v_status not in ('ACTIVE','UPCOMING','ENDED','CANCELLED') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;

  with classified as (
    select
      w.*,
      case
        when w.cancelled_at is not null then 'CANCELLED'::text
        when w.ends_at <= now() then 'ENDED'::text
        when w.starts_at > now() then 'UPCOMING'::text
        else 'ACTIVE'::text
      end as status
    from public.ai_sleep_windows w
    where v_platform is null or w.platform = v_platform
  ), filtered as (
    select * from classified
    where v_status is null or status = v_status
  ), limited as (
    select * from filtered
    order by
      case status when 'ACTIVE' then 1 when 'UPCOMING' then 2 when 'ENDED' then 3 else 4 end,
      case when status in ('ACTIVE','UPCOMING') then starts_at end asc nulls last,
      created_at desc
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', l.id,
      'platform', l.platform,
      'external_channel_id', l.external_channel_id,
      'external_channel_name', l.external_channel_name,
      'starts_at', l.starts_at,
      'ends_at', l.ends_at,
      'reason', l.reason,
      'created_by', l.created_by,
      'created_at', l.created_at,
      'cancelled_at', l.cancelled_at,
      'cancelled_by', l.cancelled_by,
      'status', l.status
    )) from limited l), '[]'::jsonb),
    'total', (select count(*)::int from filtered)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.admin_create_ai_sleep_window(
  p_platform text,
  p_external_channel_id text,
  p_external_channel_name text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_platform text := upper(btrim(coalesce(p_platform, '')));
  v_channel_id text := btrim(coalesce(p_external_channel_id, ''));
  v_channel_name text := nullif(btrim(coalesce(p_external_channel_name, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_row public.ai_sleep_windows%rowtype;
  v_status text;
begin
  if auth.uid() is null or not public.is_community_admin(auth.uid()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_platform not in ('TELEGRAM','DISCORD','WHATSAPP') then
    raise exception 'INVALID_PLATFORM' using errcode = '22023';
  end if;
  if length(v_channel_id) < 1 or length(v_channel_id) > 255 then
    raise exception 'INVALID_CHANNEL_ID' using errcode = '22023';
  end if;
  if v_channel_name is not null and length(v_channel_name) > 160 then
    raise exception 'INVALID_CHANNEL_NAME' using errcode = '22023';
  end if;
  if v_reason is not null and length(v_reason) > 500 then
    raise exception 'INVALID_REASON' using errcode = '22023';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'INVALID_SLEEP_WINDOW' using errcode = '22023';
  end if;
  if p_ends_at <= now() then
    raise exception 'SLEEP_WINDOW_ALREADY_ENDED' using errcode = '22023';
  end if;
  if p_ends_at > p_starts_at + interval '30 days' then
    raise exception 'SLEEP_WINDOW_TOO_LONG' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.ai_sleep_windows w
    where w.platform = v_platform
      and w.external_channel_id = v_channel_id
      and w.cancelled_at is null
      and w.starts_at < p_ends_at
      and w.ends_at > p_starts_at
  ) then
    raise exception 'SLEEP_WINDOW_OVERLAP' using errcode = '23P01';
  end if;

  insert into public.ai_sleep_windows (
    platform, external_channel_id, external_channel_name, starts_at, ends_at,
    reason, created_by
  ) values (
    v_platform, v_channel_id, v_channel_name, p_starts_at, p_ends_at,
    v_reason, auth.uid()
  ) returning * into v_row;

  v_status := case when v_row.starts_at <= now() then 'ACTIVE' else 'UPCOMING' end;

  return jsonb_build_object(
    'id', v_row.id,
    'platform', v_row.platform,
    'external_channel_id', v_row.external_channel_id,
    'external_channel_name', v_row.external_channel_name,
    'starts_at', v_row.starts_at,
    'ends_at', v_row.ends_at,
    'reason', v_row.reason,
    'created_by', v_row.created_by,
    'created_at', v_row.created_at,
    'cancelled_at', v_row.cancelled_at,
    'cancelled_by', v_row.cancelled_by,
    'status', v_status
  );
end;
$$;

create or replace function public.admin_cancel_ai_sleep_window(p_window_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.ai_sleep_windows%rowtype;
begin
  if auth.uid() is null or not public.is_community_admin(auth.uid()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_window_id is null then
    raise exception 'INVALID_WINDOW_ID' using errcode = '22023';
  end if;

  select * into v_row from public.ai_sleep_windows where id = p_window_id for update;
  if not found then
    raise exception 'SLEEP_WINDOW_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_row.cancelled_at is null then
    update public.ai_sleep_windows
    set cancelled_at = now(), cancelled_by = auth.uid()
    where id = p_window_id
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'platform', v_row.platform,
    'external_channel_id', v_row.external_channel_id,
    'cancelled_at', v_row.cancelled_at,
    'cancelled_by', v_row.cancelled_by,
    'status', 'CANCELLED'
  );
end;
$$;

create or replace function public.admin_get_ai_sleep_status(
  p_platform text,
  p_external_channel_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_platform text := upper(btrim(coalesce(p_platform, '')));
  v_channel_id text := btrim(coalesce(p_external_channel_id, ''));
  v_row public.ai_sleep_windows%rowtype;
begin
  if auth.uid() is null or not public.is_community_admin(auth.uid()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_platform not in ('TELEGRAM','DISCORD','WHATSAPP') then
    raise exception 'INVALID_PLATFORM' using errcode = '22023';
  end if;
  if length(v_channel_id) < 1 or length(v_channel_id) > 255 then
    raise exception 'INVALID_CHANNEL_ID' using errcode = '22023';
  end if;

  select * into v_row
  from public.ai_sleep_windows w
  where w.platform = v_platform
    and w.external_channel_id = v_channel_id
    and w.cancelled_at is null
    and w.starts_at <= now()
    and now() < w.ends_at
  order by w.starts_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'policy', 'AI_ENABLED',
      'platform', v_platform,
      'external_channel_id', v_channel_id,
      'sleep_window_id', null,
      'starts_at', null,
      'ends_at', null
    );
  end if;

  return jsonb_build_object(
    'policy', 'SLEEPING',
    'platform', v_platform,
    'external_channel_id', v_channel_id,
    'external_channel_name', v_row.external_channel_name,
    'sleep_window_id', v_row.id,
    'starts_at', v_row.starts_at,
    'ends_at', v_row.ends_at,
    'reason', v_row.reason
  );
end;
$$;

create or replace function public.get_ai_reply_policy(
  p_platform text,
  p_external_channel_id text,
  p_checked_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_platform text := upper(btrim(coalesce(p_platform, '')));
  v_channel_id text := btrim(coalesce(p_external_channel_id, ''));
  v_checked_at timestamptz := coalesce(p_checked_at, now());
  v_row public.ai_sleep_windows%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_platform not in ('TELEGRAM','DISCORD','WHATSAPP') then
    raise exception 'INVALID_PLATFORM' using errcode = '22023';
  end if;
  if length(v_channel_id) < 1 or length(v_channel_id) > 255 then
    raise exception 'INVALID_CHANNEL_ID' using errcode = '22023';
  end if;

  select * into v_row
  from public.ai_sleep_windows w
  where w.platform = v_platform
    and w.external_channel_id = v_channel_id
    and w.cancelled_at is null
    and w.starts_at <= v_checked_at
    and v_checked_at < w.ends_at
  order by w.starts_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'policy', 'AI_ENABLED',
      'sleep_window_id', null,
      'starts_at', null,
      'ends_at', null
    );
  end if;

  return jsonb_build_object(
    'policy', 'SLEEPING',
    'sleep_window_id', v_row.id,
    'starts_at', v_row.starts_at,
    'ends_at', v_row.ends_at,
    'reason', v_row.reason
  );
end;
$$;

-- Extend the existing one-time confirmation allowlist to cover sleep writes.
alter table public.admin_agent_confirmation_nonces
  drop constraint if exists admin_agent_confirmation_nonces_tool_check;

alter table public.admin_agent_confirmation_nonces
  add constraint admin_agent_confirmation_nonces_tool_check
  check (tool in (
    'create_knowledge_record',
    'update_knowledge_record',
    'approve_document',
    'send_announcement',
    'schedule_ai_sleep',
    'cancel_ai_sleep'
  ));

create or replace function public.admin_consume_agent_confirmation(
  p_nonce uuid,
  p_tool text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tool text := btrim(coalesce(p_tool, ''));
begin
  if auth.uid() is null or not public.is_community_admin(auth.uid()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_tool not in (
    'create_knowledge_record',
    'update_knowledge_record',
    'approve_document',
    'send_announcement',
    'schedule_ai_sleep',
    'cancel_ai_sleep'
  ) then
    raise exception 'INVALID_TOOL' using errcode = '22023';
  end if;
  if p_expires_at is null or p_expires_at < now() or p_expires_at > now() + interval '6 minutes' then
    raise exception 'CONFIRMATION_EXPIRED' using errcode = '22023';
  end if;

  begin
    insert into public.admin_agent_confirmation_nonces(nonce, admin_user_id, tool, expires_at)
    values (p_nonce, auth.uid(), v_tool, p_expires_at);
  exception when unique_violation then
    raise exception 'CONFIRMATION_ALREADY_USED' using errcode = '23505';
  end;

  delete from public.admin_agent_confirmation_nonces
  where expires_at < now() - interval '1 day';
end;
$$;

revoke all on function public.admin_list_ai_sleep_windows(text, text, integer, integer) from public, anon;
revoke all on function public.admin_create_ai_sleep_window(text, text, text, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.admin_cancel_ai_sleep_window(uuid) from public, anon;
revoke all on function public.admin_get_ai_sleep_status(text, text) from public, anon;
revoke all on function public.get_ai_reply_policy(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_consume_agent_confirmation(uuid, text, timestamptz) from public, anon;

grant execute on function public.admin_list_ai_sleep_windows(text, text, integer, integer) to authenticated;
grant execute on function public.admin_create_ai_sleep_window(text, text, text, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.admin_cancel_ai_sleep_window(uuid) to authenticated;
grant execute on function public.admin_get_ai_sleep_status(text, text) to authenticated;
grant execute on function public.get_ai_reply_policy(text, text, timestamptz) to service_role;
grant execute on function public.admin_consume_agent_confirmation(uuid, text, timestamptz) to authenticated;
