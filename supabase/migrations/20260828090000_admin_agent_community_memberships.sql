-- Verified external community membership and allowlisted admin-agent support.
-- Approval/community_access remains separate from actual external group membership.

create table if not exists public.community_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  platform text not null check (platform in ('TELEGRAM', 'DISCORD', 'WHATSAPP')),
  tier text not null check (tier in ('GENERAL', 'VIP')),
  external_group_id text not null check (length(btrim(external_group_id)) between 1 and 255),
  membership_status text not null default 'UNKNOWN' check (membership_status in ('MEMBER', 'LEFT', 'REMOVED', 'UNKNOWN')),
  verification_source text not null default 'EVENT' check (verification_source in ('EVENT', 'API', 'ADMIN', 'IMPORT')),
  joined_at timestamptz,
  left_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_memberships_identity_unique unique (user_id, platform, tier, external_group_id)
);

create index if not exists community_memberships_platform_tier_status_idx
  on public.community_memberships (platform, tier, membership_status);
create index if not exists community_memberships_user_idx
  on public.community_memberships (user_id);

alter table public.community_memberships enable row level security;
revoke all on table public.community_memberships from anon, authenticated;

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
        select 1 from public.community_memberships cm where cm.platform = p.platform and cm.last_verified_at is not null
      ) as verification_connected
    from platform_names p
  )
  select jsonb_build_object(
    'platforms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', ps.platform,
        'known_users', ps.known_users,
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
  ) into v_result;

  return v_result;
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
      cm.membership_status,
      cm.verification_source,
      cm.joined_at,
      cm.left_at,
      cm.last_verified_at,
      pa.username,
      pa.phone_number,
      pa.platform_user_id
    from public.community_memberships cm
    join public.users u on u.id = cm.user_id
    left join lateral (
      select p.username, p.phone_number, p.platform_user_id
      from public.platform_accounts p
      where p.user_id = cm.user_id and upper(p.platform::text) = cm.platform
      order by p.created_at asc
      limit 1
    ) pa on true
    where cm.membership_status = 'MEMBER'
      and (v_platform is null or cm.platform = v_platform)
      and (v_tier is null or cm.tier = v_tier)
      and (
        v_search is null
        or u.name ilike '%' || v_search || '%'
        or coalesce(pa.username, '') ilike '%' || v_search || '%'
        or coalesce(pa.phone_number, '') ilike '%' || v_search || '%'
        or coalesce(pa.platform_user_id, '') ilike '%' || v_search || '%'
        or cm.user_id::text ilike '%' || v_search || '%'
      )
  ), limited as (
    select * from filtered
    order by coalesce(last_verified_at, joined_at) desc nulls last, user_id
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
      'platform_user_id', l.platform_user_id
    )) from limited l), '[]'::jsonb),
    'total', (select count(*)::int from filtered)
  ) into v_result;

  return v_result;
end;
$$;

-- Reuse the existing admin_create_knowledge_document RPC so this migration does
-- not duplicate the base table's storage-path/id/version defaults. The record is
-- then populated with canonical text and remains explicitly pending/unapproved.
create or replace function public.admin_create_knowledge_text_record(
  p_title text,
  p_category text,
  p_language text,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_category text := upper(btrim(coalesce(p_category, '')));
  v_language text := lower(btrim(coalesce(p_language, '')));
  v_content text := btrim(coalesce(p_content, ''));
  v_created jsonb;
  v_id uuid;
begin
  if auth.uid() is null or not public.is_community_admin(auth.uid()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if length(v_title) < 2 or length(v_title) > 180 then raise exception 'INVALID_TITLE' using errcode = '22023'; end if;
  if length(v_category) < 2 or length(v_category) > 80 then raise exception 'INVALID_CATEGORY' using errcode = '22023'; end if;
  if v_language not in ('en','ar','de','fr','es','it') then raise exception 'INVALID_LANGUAGE' using errcode = '22023'; end if;
  if v_content = '' then v_content := 'Draft knowledge record. Content pending admin completion.'; end if;
  if length(v_content) > 200000 then raise exception 'CONTENT_TOO_LARGE' using errcode = '22023'; end if;

  v_created := public.admin_create_knowledge_document(
    p_title => v_title,
    p_category => v_category,
    p_language => v_language,
    p_file_extension => 'md'
  );
  v_id := (v_created ->> 'id')::uuid;

  update public.knowledge_documents
  set content = v_content,
      editor_content_html = '<p>' || replace(replace(replace(v_content, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>',
      is_approved = false,
      approved_by = null,
      approved_at = null,
      processing_status = 'PENDING',
      processing_error = null,
      updated_at = now()
  where id = v_id;

  return v_created || jsonb_build_object(
    'id', v_id,
    'title', v_title,
    'category', v_category,
    'language', v_language,
    'processing_status', 'PENDING',
    'is_approved', false
  );
end;
$$;

-- Server-only write path for Telegram/Discord/WhatsApp membership events.
-- n8n or another trusted backend should call this with a service-role credential;
-- the browser never receives that credential and authenticated end users cannot execute it.
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

  insert into public.community_memberships (
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
    joined_at = case when excluded.membership_status = 'MEMBER' then coalesce(public.community_memberships.joined_at, excluded.joined_at) else public.community_memberships.joined_at end,
    left_at = case when excluded.membership_status in ('LEFT','REMOVED') then excluded.left_at when excluded.membership_status = 'MEMBER' then null else public.community_memberships.left_at end,
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

revoke all on function public.admin_get_community_platform_stats() from public, anon;
revoke all on function public.admin_list_community_members(text, text, text, integer) from public, anon;
revoke all on function public.admin_create_knowledge_text_record(text, text, text, text) from public, anon;
revoke all on function public.record_community_membership_event(text, text, text, text, text, text, timestamptz) from public, anon, authenticated;

grant execute on function public.admin_get_community_platform_stats() to authenticated;
grant execute on function public.admin_list_community_members(text, text, text, integer) to authenticated;
grant execute on function public.admin_create_knowledge_text_record(text, text, text, text) to authenticated;
grant execute on function public.record_community_membership_event(text, text, text, text, text, text, timestamptz) to service_role;
