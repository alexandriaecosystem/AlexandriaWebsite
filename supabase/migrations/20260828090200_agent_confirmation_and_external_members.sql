-- Harden AI write confirmations and allow verified external group membership
-- to be counted even before a person has an Alexandria platform account.

alter table public.community_memberships
  alter column user_id drop not null;

alter table public.community_memberships
  add column if not exists platform_user_id text;

update public.community_memberships cm
set platform_user_id = (
  select pa.platform_user_id
  from public.platform_accounts pa
  where pa.user_id = cm.user_id
    and upper(pa.platform::text) = cm.platform
  order by pa.created_at asc
  limit 1
)
where cm.platform_user_id is null;

-- The table is introduced by the immediately preceding migration, so new rows
-- should always have an external identity. Fail deployment rather than allow an
-- ambiguous membership record if an unexpected legacy row cannot be backfilled.
alter table public.community_memberships
  alter column platform_user_id set not null;

alter table public.community_memberships
  drop constraint if exists community_memberships_identity_unique;

alter table public.community_memberships
  add constraint community_memberships_external_identity_unique
  unique (platform, tier, external_group_id, platform_user_id);

create index if not exists community_memberships_platform_user_idx
  on public.community_memberships (platform, platform_user_id);

create table if not exists public.admin_agent_confirmation_nonces (
  nonce uuid primary key,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  tool text not null check (tool in ('create_knowledge_record', 'update_knowledge_record', 'approve_document', 'send_announcement')),
  expires_at timestamptz not null,
  consumed_at timestamptz not null default now()
);

create index if not exists admin_agent_confirmation_nonces_expiry_idx
  on public.admin_agent_confirmation_nonces (expires_at);

alter table public.admin_agent_confirmation_nonces enable row level security;
revoke all on table public.admin_agent_confirmation_nonces from anon, authenticated;

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
  if v_tool not in ('create_knowledge_record', 'update_knowledge_record', 'approve_document', 'send_announcement') then
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

  -- Keep the table bounded. This is opportunistic and not required for safety.
  delete from public.admin_agent_confirmation_nonces
  where expires_at < now() - interval '1 day';
end;
$$;

create or replace function public.admin_list_community_members(
  p_platform text default null,
  p_tier text default null,
  p_search text default null,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_platform text := nullif(upper(btrim(coalesce(p_platform, ''))), '');
  v_tier text := nullif(upper(btrim(coalesce(p_tier, ''))), '');
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 200);
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_community_admin(auth.uid()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_platform is not null and v_platform not in ('TELEGRAM','DISCORD','WHATSAPP') then
    raise exception 'INVALID_PLATFORM' using errcode = '22023';
  end if;
  if v_tier is not null and v_tier not in ('GENERAL','VIP') then
    raise exception 'INVALID_TIER' using errcode = '22023';
  end if;

  with filtered as (
    select
      cm.id,
      cm.user_id,
      u.name,
      u.preferred_language,
      u.status as user_status,
      cm.platform,
      cm.tier,
      cm.external_group_id,
      cm.platform_user_id,
      cm.membership_status,
      cm.verification_source,
      cm.joined_at,
      cm.left_at,
      cm.last_verified_at,
      pa.username,
      pa.phone_number
    from public.community_memberships cm
    left join public.users u on u.id = cm.user_id
    left join lateral (
      select p.username, p.phone_number
      from public.platform_accounts p
      where p.user_id = cm.user_id
        and upper(p.platform::text) = cm.platform
        and p.platform_user_id = cm.platform_user_id
      order by p.created_at asc
      limit 1
    ) pa on true
    where cm.membership_status = 'MEMBER'
      and (v_platform is null or cm.platform = v_platform)
      and (v_tier is null or cm.tier = v_tier)
      and (
        v_search is null
        or coalesce(u.name, '') ilike '%' || v_search || '%'
        or coalesce(pa.username, '') ilike '%' || v_search || '%'
        or coalesce(pa.phone_number, '') ilike '%' || v_search || '%'
        or cm.platform_user_id ilike '%' || v_search || '%'
        or coalesce(cm.user_id::text, '') ilike '%' || v_search || '%'
      )
  ), limited as (
    select * from filtered
    order by coalesce(last_verified_at, joined_at) desc nulls last, platform_user_id
    limit v_limit
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'membership_id', l.id,
      'user_id', l.user_id,
      'name', l.name,
      'preferred_language', l.preferred_language,
      'user_status', l.user_status,
      'platform', l.platform,
      'tier', l.tier,
      'external_group_id', l.external_group_id,
      'membership_status', l.membership_status,
      'verification_source', l.verification_source,
      'joined_at', l.joined_at,
      'left_at', l.left_at,
      'last_verified_at', l.last_verified_at,
      'username', l.username,
      'phone_number', l.phone_number,
      'platform_user_id', l.platform_user_id,
      'known_user', l.user_id is not null
    )) from limited l), '[]'::jsonb),
    'total', (select count(*)::int from filtered)
  ) into v_result;

  return v_result;
end;
$$;

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
  if v_platform_user_id = '' or length(v_platform_user_id) > 255 or v_group = '' or length(v_group) > 255 then
    raise exception 'INVALID_PLATFORM_USER_OR_GROUP' using errcode = '22023';
  end if;

  select pa.user_id into v_user_id
  from public.platform_accounts pa
  where upper(pa.platform::text) = v_platform
    and pa.platform_user_id = v_platform_user_id
  order by pa.created_at asc
  limit 1;

  insert into public.community_memberships as current_membership (
    user_id, platform, tier, external_group_id, platform_user_id,
    membership_status, verification_source, joined_at, left_at, last_verified_at, updated_at
  ) values (
    v_user_id, v_platform, v_tier, v_group, v_platform_user_id,
    v_status, v_source,
    case when v_status = 'MEMBER' then p_occurred_at else null end,
    case when v_status in ('LEFT','REMOVED') then p_occurred_at else null end,
    p_occurred_at, now()
  )
  on conflict (platform, tier, external_group_id, platform_user_id)
  do update set
    user_id = coalesce(excluded.user_id, current_membership.user_id),
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
    'platform_user_id', v_row.platform_user_id,
    'known_user', v_row.user_id is not null,
    'platform', v_row.platform,
    'tier', v_row.tier,
    'membership_status', v_row.membership_status,
    'last_verified_at', v_row.last_verified_at
  );
end;
$$;

revoke all on function public.admin_consume_agent_confirmation(uuid, text, timestamptz) from public, anon;
revoke all on function public.admin_list_community_members(text, text, text, integer) from public, anon;
revoke all on function public.record_community_membership_event(text, text, text, text, text, text, timestamptz) from public, anon, authenticated;

grant execute on function public.admin_consume_agent_confirmation(uuid, text, timestamptz) to authenticated;
grant execute on function public.admin_list_community_members(text, text, text, integer) to authenticated;
grant execute on function public.record_community_membership_event(text, text, text, text, text, text, timestamptz) to service_role;
