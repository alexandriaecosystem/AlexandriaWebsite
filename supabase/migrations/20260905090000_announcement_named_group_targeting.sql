alter table public.announcements
  add column if not exists selected_community_ids uuid[];

comment on column public.announcements.selected_community_ids is
  'Optional exact community targets selected by an admin. NULL preserves legacy audience/platform fan-out.';

create or replace function public.admin_list_announcement_targets()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_items jsonb;
begin
  if not exists (
    select 1 from public.community_admins
    where user_id = auth.uid() and is_active
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(item order by item.platform, item.name), '[]'::jsonb)
  into v_items
  from (
    select
      c.id,
      c.platform::text as platform,
      c.community_level,
      c.name,
      c.is_active,
      case when c.platform::text in ('x', 'instagram') then 'ACCOUNT' else 'GROUP' end as target_kind
    from public.communities c
    where c.is_active
      and coalesce(c.config ->> 'announcement_enabled', 'true') <> 'false'
  ) item;

  return jsonb_build_object('items', v_items);
end;
$function$;

revoke all on function public.admin_list_announcement_targets() from public;
grant execute on function public.admin_list_announcement_targets() to authenticated;

-- Replace the media-aware creator with one optional trailing argument. Existing
-- callers remain valid because p_community_ids defaults to NULL.
drop function if exists public.admin_create_announcement_with_media(
  text, text, platform_name[], jsonb, text, text, text, text
);

create function public.admin_create_announcement_with_media(
  p_content text,
  p_destination_level text,
  p_platforms platform_name[],
  p_translations jsonb default '{}'::jsonb,
  p_media_bucket text default null,
  p_media_path text default null,
  p_media_mime_type text default null,
  p_media_filename text default null,
  p_community_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  result_id uuid;
  admin_id uuid := auth.uid();
  clean_content text := coalesce(btrim(p_content), '');
  clean_community_ids uuid[];
  effective_platforms platform_name[];
  effective_destination text;
  target_count integer;
begin
  if admin_id is null or not public.is_community_admin(admin_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_community_ids is not null then
    select coalesce(array_agg(x order by x), array[]::uuid[])
    into clean_community_ids
    from (select distinct value as x from unnest(p_community_ids) value where value is not null) deduped;

    if cardinality(clean_community_ids) = 0 then
      clean_community_ids := null;
    end if;
  end if;

  if clean_community_ids is not null then
    select
      count(*)::integer,
      array_agg(distinct c.platform order by c.platform),
      case
        when count(distinct c.community_level) > 1 then 'BOTH'
        else min(c.community_level)
      end
    into target_count, effective_platforms, effective_destination
    from public.communities c
    where c.id = any(clean_community_ids)
      and c.is_active
      and coalesce(c.config ->> 'announcement_enabled', 'true') <> 'false';

    if target_count <> cardinality(clean_community_ids) then
      raise exception 'INVALID_OR_INACTIVE_COMMUNITY_TARGET' using errcode = '22023';
    end if;
  else
    if p_destination_level not in ('GENERAL', 'APPROVED', 'BOTH') then
      raise exception 'INVALID_DESTINATION' using errcode = '22023';
    end if;
    if p_platforms is null or cardinality(p_platforms) = 0 then
      raise exception 'PLATFORM_REQUIRED' using errcode = '22023';
    end if;
    effective_platforms := p_platforms;
    effective_destination := p_destination_level;
  end if;

  if clean_content = '' and p_media_path is null then
    raise exception 'CONTENT_OR_IMAGE_REQUIRED' using errcode = '22023';
  end if;

  if p_media_path is not null then
    if p_media_bucket is distinct from 'announcement-media' then
      raise exception 'INVALID_MEDIA_BUCKET' using errcode = '22023';
    end if;
    if p_media_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
      raise exception 'INVALID_MEDIA_TYPE' using errcode = '22023';
    end if;
  end if;

  insert into public.announcements(
    created_by,
    content,
    destination_level,
    selected_platforms,
    translations,
    status,
    media_bucket,
    media_path,
    media_mime_type,
    media_filename,
    selected_community_ids
  )
  values(
    admin_id,
    clean_content,
    effective_destination,
    effective_platforms,
    coalesce(p_translations, '{}'::jsonb),
    'DRAFT',
    p_media_bucket,
    p_media_path,
    p_media_mime_type,
    p_media_filename,
    clean_community_ids
  )
  returning id into result_id;

  return result_id;
end;
$function$;

revoke all on function public.admin_create_announcement_with_media(
  text, text, platform_name[], jsonb, text, text, text, text, uuid[]
) from public;
grant execute on function public.admin_create_announcement_with_media(
  text, text, platform_name[], jsonb, text, text, text, text, uuid[]
) to authenticated;

create or replace function public.admin_approve_announcement(p_announcement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  admin_id uuid := auth.uid();
  ann public.announcements%rowtype;
  c public.communities%rowtype;
  delivery_id uuid;
  count_created int := 0;
begin
  if admin_id is null or not public.is_community_admin(admin_id) then
    raise exception 'FORBIDDEN';
  end if;

  select * into ann
  from public.announcements
  where id = p_announcement_id
  for update;

  if ann.id is null then raise exception 'ANNOUNCEMENT_NOT_FOUND'; end if;
  if ann.status not in ('DRAFT', 'PENDING_REVIEW') then raise exception 'ANNOUNCEMENT_NOT_REVIEWABLE'; end if;

  for c in
    select *
    from public.communities
    where is_active
      and coalesce(config ->> 'announcement_enabled', 'true') <> 'false'
      and (
        (ann.selected_community_ids is not null and id = any(ann.selected_community_ids))
        or (
          ann.selected_community_ids is null
          and platform = any(ann.selected_platforms)
          and (
            community_level = ann.destination_level
            or (ann.destination_level = 'BOTH' and community_level in ('GENERAL', 'APPROVED'))
          )
        )
      )
  loop
    insert into public.announcement_deliveries(announcement_id, community_id, platform, idempotency_key)
    values(ann.id, c.id, c.platform, 'announcement:' || ann.id::text || ':' || c.id::text)
    on conflict (announcement_id, community_id) do update set updated_at = now()
    returning id into delivery_id;

    insert into public.outbox_events(event_type, aggregate_type, aggregate_id, payload, idempotency_key)
    values(
      'ANNOUNCEMENT_DELIVERY_REQUESTED',
      'announcement_delivery',
      delivery_id,
      jsonb_build_object('delivery_id', delivery_id),
      'announcement-delivery:' || delivery_id::text
    )
    on conflict(idempotency_key) do nothing;

    count_created := count_created + 1;
  end loop;

  if count_created = 0 then
    raise exception 'NO_MATCHING_ACTIVE_COMMUNITIES';
  end if;

  update public.announcements
  set status = 'APPROVED', approved_by = admin_id, approved_at = now()
  where id = ann.id;

  return jsonb_build_object(
    'announcement_id', ann.id,
    'status', 'APPROVED',
    'deliveries', count_created,
    'destination_level', ann.destination_level,
    'exact_targets', ann.selected_community_ids is not null
  );
end;
$function$;

create or replace function public.admin_list_announcements(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_items jsonb;
begin
  if not exists(
    select 1 from public.community_admins where user_id = auth.uid() and is_active
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_limit not between 1 and 200 then
    raise exception 'validation_error' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb)
  into v_items
  from (
    select
      a.id,
      a.content,
      a.destination_level,
      a.selected_platforms,
      a.selected_community_ids,
      a.status,
      a.scheduled_for,
      a.approved_at,
      a.published_at,
      a.created_at,
      a.updated_at,
      a.media_bucket,
      a.media_path,
      a.media_mime_type,
      a.media_filename,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'platform', c.platform::text,
            'community_level', c.community_level
          ) order by c.platform::text, c.name
        )
        from public.communities c
        where (
          a.selected_community_ids is not null
          and c.id = any(a.selected_community_ids)
        ) or (
          a.selected_community_ids is null
          and exists (
            select 1 from public.announcement_deliveries ad
            where ad.announcement_id = a.id and ad.community_id = c.id
          )
        )
      ), '[]'::jsonb) as selected_communities,
      coalesce((select count(*) from public.announcement_deliveries d where d.announcement_id = a.id), 0) delivery_count,
      coalesce((select count(*) from public.announcement_deliveries d where d.announcement_id = a.id and d.status = 'SENT'), 0) sent_count,
      coalesce((select count(*) from public.announcement_deliveries d where d.announcement_id = a.id and d.status in ('FAILED', 'DEAD_LETTER')), 0) failed_count,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'platform', d.platform::text,
            'status', d.status,
            'attempt_count', d.attempt_count,
            'sent_at', d.sent_at,
            'error', d.error
          ) order by d.created_at
        )
        from public.announcement_deliveries d
        where d.announcement_id = a.id
      ), '[]'::jsonb) deliveries
    from public.announcements a
    order by a.created_at desc
    limit p_limit
  ) x;

  return jsonb_build_object('items', v_items);
end;
$function$;
