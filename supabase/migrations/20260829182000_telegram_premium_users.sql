-- Track the latest Telegram Premium status observed from Telegram Bot API User.is_premium.
-- The trusted Telegram/n8n backend should call record_telegram_premium_status whenever
-- it receives a Telegram user object. The browser never receives the service-role key.

alter table public.platform_accounts
  add column if not exists is_premium boolean,
  add column if not exists premium_checked_at timestamptz;

create index if not exists platform_accounts_telegram_premium_idx
  on public.platform_accounts (is_premium)
  where upper(platform::text) = 'TELEGRAM';

create or replace function public.record_telegram_premium_status(
  p_platform_user_id text,
  p_is_premium boolean,
  p_checked_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_platform_user_id text := btrim(coalesce(p_platform_user_id, ''));
  v_account public.platform_accounts%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_platform_user_id = '' or length(v_platform_user_id) > 255 then
    raise exception 'INVALID_PLATFORM_USER_ID' using errcode = '22023';
  end if;

  if p_is_premium is null then
    raise exception 'PREMIUM_STATUS_REQUIRED' using errcode = '22023';
  end if;

  update public.platform_accounts
  set is_premium = p_is_premium,
      premium_checked_at = coalesce(p_checked_at, now())
  where upper(platform::text) = 'TELEGRAM'
    and platform_user_id = v_platform_user_id
  returning * into v_account;

  if v_account.id is null then
    raise exception 'TELEGRAM_PLATFORM_ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'platform_account_id', v_account.id,
    'user_id', v_account.user_id,
    'platform_user_id', v_account.platform_user_id,
    'is_premium', v_account.is_premium,
    'premium_checked_at', v_account.premium_checked_at
  );
end;
$$;

create or replace function public.admin_get_community_platform_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_community_admin(auth.uid()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if to_regclass('public.community_memberships') is not null then
    execute $stats$
      with platform_names(platform) as (
        values ('TELEGRAM'::text), ('DISCORD'::text), ('WHATSAPP'::text)
      ), platform_stats as (
        select
          p.platform,
          (
            select count(distinct pa.user_id)::int
            from public.platform_accounts pa
            where upper(pa.platform::text) = p.platform
          ) as known_users,
          (
            select count(distinct pa.user_id)::int
            from public.platform_accounts pa
            where p.platform = 'TELEGRAM'
              and upper(pa.platform::text) = 'TELEGRAM'
              and pa.is_premium is true
          ) as premium_users,
          (
            select count(*)::int
            from public.community_memberships cm
            where cm.platform = p.platform and cm.tier = 'GENERAL' and cm.membership_status = 'MEMBER'
          ) as general_members,
          (
            select count(*)::int
            from public.community_memberships cm
            where cm.platform = p.platform and cm.tier = 'VIP' and cm.membership_status = 'MEMBER'
          ) as vip_members,
          (
            select count(*)::int
            from public.community_memberships cm
            where cm.platform = p.platform and cm.membership_status = 'MEMBER'
          ) as verified_members,
          (
            select max(cm.last_verified_at)
            from public.community_memberships cm
            where cm.platform = p.platform
          ) as last_verified_at,
          exists (
            select 1 from public.community_memberships cm
            where cm.platform = p.platform and cm.last_verified_at is not null
          ) as verification_connected
        from platform_names p
      )
      select jsonb_build_object(
        'platforms', coalesce((
          select jsonb_agg(jsonb_build_object(
            'platform', ps.platform,
            'known_users', ps.known_users,
            'premium_users', ps.premium_users,
            'general_members', ps.general_members,
            'vip_members', ps.vip_members,
            'verified_members', ps.verified_members,
            'last_verified_at', ps.last_verified_at,
            'verification_connected', ps.verification_connected
          ) order by case ps.platform when 'TELEGRAM' then 1 when 'DISCORD' then 2 else 3 end)
          from platform_stats ps
        ), '[]'::jsonb),
        'overall', jsonb_build_object(
          'known_users', (select count(distinct pa.user_id)::int from public.platform_accounts pa where upper(pa.platform::text) in ('TELEGRAM','DISCORD','WHATSAPP')),
          'general_members', (select count(*)::int from public.community_memberships cm where cm.tier='GENERAL' and cm.membership_status='MEMBER'),
          'vip_members', (select count(*)::int from public.community_memberships cm where cm.tier='VIP' and cm.membership_status='MEMBER'),
          'verified_members', (select count(*)::int from public.community_memberships cm where cm.membership_status='MEMBER')
        )
      )
    $stats$ into v_result;
  else
    with platform_names(platform) as (
      values ('TELEGRAM'::text), ('DISCORD'::text), ('WHATSAPP'::text)
    ), platform_stats as (
      select
        p.platform,
        count(distinct pa.user_id)::int as known_users,
        count(distinct pa.user_id) filter (
          where p.platform = 'TELEGRAM' and pa.is_premium is true
        )::int as premium_users
      from platform_names p
      left join public.platform_accounts pa
        on upper(pa.platform::text) = p.platform
      group by p.platform
    )
    select jsonb_build_object(
      'platforms', coalesce(
        jsonb_agg(
          jsonb_build_object(
            'platform', ps.platform,
            'known_users', ps.known_users,
            'premium_users', ps.premium_users,
            'general_members', 0,
            'vip_members', 0,
            'verified_members', 0,
            'last_verified_at', null,
            'verification_connected', false
          )
          order by case ps.platform when 'TELEGRAM' then 1 when 'DISCORD' then 2 else 3 end
        ),
        '[]'::jsonb
      ),
      'overall', jsonb_build_object(
        'known_users', (
          select count(distinct pa.user_id)::int
          from public.platform_accounts pa
          where upper(pa.platform::text) in ('TELEGRAM','DISCORD','WHATSAPP')
        ),
        'general_members', 0,
        'vip_members', 0,
        'verified_members', 0
      )
    ) into v_result
    from platform_stats ps;
  end if;

  return v_result;
end;
$$;

revoke all on function public.record_telegram_premium_status(text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.record_telegram_premium_status(text, boolean, timestamptz) to service_role;

revoke all on function public.admin_get_community_platform_stats() from public, anon;
grant execute on function public.admin_get_community_platform_stats() to authenticated;
