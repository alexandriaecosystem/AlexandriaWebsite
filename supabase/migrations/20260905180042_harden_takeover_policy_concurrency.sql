-- Harden the canonical Human Takeover policy without changing the routing contract.
-- 1. Malformed/unauthorized policy lookups must fail closed instead of returning AUTO.
-- 2. Concurrent takeover creation for the same platform target must serialize before
--    the overlap check so two requests cannot create overlapping active windows.

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
  if auth.role() <> 'service_role' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_platform not in ('TELEGRAM', 'DISCORD', 'WHATSAPP') then
    raise exception 'INVALID_PLATFORM' using errcode = '22023';
  end if;

  if length(v_channel_id) < 1 or length(v_channel_id) > 255 then
    raise exception 'INVALID_CHANNEL_ID' using errcode = '22023';
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

  -- Serialize overlap checks per platform/target so two concurrent admin
  -- requests cannot both pass the check before either insert commits.
  perform pg_advisory_xact_lock(hashtext(v_platform), hashtext(v_channel_id));

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

notify pgrst, 'reload schema';
