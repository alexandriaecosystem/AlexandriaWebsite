create or replace function public.admin_list_takeover_targets()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_items jsonb;
begin
  if auth.uid() is null or not public.is_community_admin(auth.uid()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'community_id', c.id,
        'platform', upper(c.platform::text),
        'name', c.name,
        'community_level', c.community_level
      )
      order by
        case c.platform::text when 'telegram' then 1 when 'whatsapp' then 2 when 'discord' then 3 else 4 end,
        case c.community_level when 'APPROVED' then 1 when 'GENERAL' then 2 else 3 end,
        c.name
    ),
    '[]'::jsonb
  )
  into v_items
  from public.communities c
  where c.is_active
    and c.platform::text in ('telegram', 'discord', 'whatsapp')
    and nullif(btrim(coalesce(c.external_target_id, '')), '') is not null;

  return v_items;
end;
$$;

revoke all on function public.admin_list_takeover_targets() from public, anon;
grant execute on function public.admin_list_takeover_targets() to authenticated, service_role;

create or replace function public.admin_create_community_takeover(
  p_community_id uuid,
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
  v_community public.communities%rowtype;
begin
  if auth.uid() is null or not public.is_community_admin(auth.uid()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_community_id is null then
    raise exception 'COMMUNITY_REQUIRED' using errcode = '22023';
  end if;

  select *
  into v_community
  from public.communities c
  where c.id = p_community_id
    and c.is_active
    and c.platform::text in ('telegram', 'discord', 'whatsapp')
    and nullif(btrim(coalesce(c.external_target_id, '')), '') is not null
  limit 1;

  if not found then
    raise exception 'TAKEOVER_TARGET_NOT_FOUND' using errcode = 'P0002';
  end if;

  return public.admin_create_ai_sleep_window(
    upper(v_community.platform::text),
    v_community.external_target_id,
    v_community.name,
    p_starts_at,
    p_ends_at,
    p_reason
  );
end;
$$;

revoke all on function public.admin_create_community_takeover(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_create_community_takeover(uuid, timestamptz, timestamptz, text) to authenticated, service_role;

create or replace function public.get_ai_reply_policy(
  p_platform text,
  p_external_channel_id text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_platform text := upper(btrim(coalesce(p_platform, '')));
  v_channel_id text := btrim(coalesce(p_external_channel_id, ''));
  v_row public.ai_sleep_windows%rowtype;
begin
  if v_platform not in ('TELEGRAM', 'DISCORD', 'WHATSAPP') or v_channel_id = '' then
    return jsonb_build_object(
      'mode', 'AUTO',
      'sleep_until', null,
      'platform', v_platform,
      'target_id', v_channel_id
    );
  end if;

  select *
  into v_row
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
      'mode', 'AUTO',
      'sleep_until', null,
      'platform', v_platform,
      'target_id', v_channel_id
    );
  end if;

  return jsonb_build_object(
    'mode', 'SLEEP',
    'sleep_until', v_row.ends_at,
    'platform', v_platform,
    'target_id', v_channel_id,
    'takeover_id', v_row.id,
    'target_name', v_row.external_channel_name,
    'reason', v_row.reason
  );
end;
$$;

revoke all on function public.get_ai_reply_policy(text, text) from public, anon, authenticated;
grant execute on function public.get_ai_reply_policy(text, text) to service_role;