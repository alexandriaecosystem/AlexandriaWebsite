-- Keep the target row reference explicit inside ON CONFLICT.
create or replace function public.record_community_membership_event(
  p_platform text,
  p_platform_user_id text,
  p_tier text,
  p_external_group_id text,
  p_membership_status text,
  p_verification_source text default 'EVENT',
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_platform text := upper(btrim(coalesce(p_platform, '')));
  v_platform_user_id text := btrim(coalesce(p_platform_user_id, ''));
  v_tier text := upper(btrim(coalesce(p_tier, '')));
  v_group text := btrim(coalesce(p_external_group_id, ''));
  v_status text := upper(btrim(coalesce(p_membership_status, '')));
  v_source text := upper(btrim(coalesce(p_verification_source, 'EVENT')));
  v_user_id uuid;
  v_row public.community_memberships%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_platform not in ('TELEGRAM','DISCORD','WHATSAPP') then raise exception 'INVALID_PLATFORM' using errcode = '22023'; end if;
  if v_tier not in ('GENERAL','VIP') then raise exception 'INVALID_TIER' using errcode = '22023'; end if;
  if v_status not in ('MEMBER','LEFT','REMOVED','UNKNOWN') then raise exception 'INVALID_MEMBERSHIP_STATUS' using errcode = '22023'; end if;
  if v_source not in ('EVENT','API','ADMIN','IMPORT') then raise exception 'INVALID_VERIFICATION_SOURCE' using errcode = '22023'; end if;
  if v_platform_user_id = '' or v_group = '' then raise exception 'PLATFORM_USER_AND_GROUP_REQUIRED' using errcode = '22023'; end if;

  select pa.user_id into v_user_id
  from public.platform_accounts pa
  where upper(pa.platform::text) = v_platform and pa.platform_user_id = v_platform_user_id
  order by pa.created_at asc
  limit 1;

  if v_user_id is null then raise exception 'PLATFORM_ACCOUNT_NOT_FOUND' using errcode = 'P0002'; end if;

  insert into public.community_memberships as current_membership (
    user_id, platform, tier, external_group_id, membership_status, verification_source,
    joined_at, left_at, last_verified_at, updated_at
  ) values (
    v_user_id, v_platform, v_tier, v_group, v_status, v_source,
    case when v_status = 'MEMBER' then p_occurred_at else null end,
    case when v_status in ('LEFT','REMOVED') then p_occurred_at else null end,
    p_occurred_at, now()
  )
  on conflict (user_id, platform, tier, external_group_id)
  do update set
    membership_status = excluded.membership_status,
    verification_source = excluded.verification_source,
    joined_at = case
      when excluded.membership_status = 'MEMBER' then coalesce(current_membership.joined_at, excluded.joined_at)
      else current_membership.joined_at
    end,
    left_at = case
      when excluded.membership_status in ('LEFT','REMOVED') then excluded.left_at
      when excluded.membership_status = 'MEMBER' then null
      else current_membership.left_at
    end,
    last_verified_at = excluded.last_verified_at,
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'membership_id', v_row.id,
    'user_id', v_row.user_id,
    'platform', v_row.platform,
    'tier', v_row.tier,
    'membership_status', v_row.membership_status,
    'last_verified_at', v_row.last_verified_at
  );
end;
$$;

revoke all on function public.record_community_membership_event(text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_community_membership_event(text, text, text, text, text, text, timestamptz) to service_role;
