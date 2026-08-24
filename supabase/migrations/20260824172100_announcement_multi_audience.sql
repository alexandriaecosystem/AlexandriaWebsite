alter table public.announcements
  drop constraint if exists announcements_destination_level_check;

alter table public.announcements
  add constraint announcements_destination_level_check
  check (destination_level = any (array['GENERAL'::text, 'APPROVED'::text, 'BOTH'::text]));

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

  update public.announcements
  set status = 'APPROVED', approved_by = admin_id, approved_at = now()
  where id = ann.id;

  for c in
    select *
    from public.communities
    where is_active
      and platform = any(ann.selected_platforms)
      and (
        community_level = ann.destination_level
        or (ann.destination_level = 'BOTH' and community_level in ('GENERAL', 'APPROVED'))
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

  return jsonb_build_object(
    'announcement_id', ann.id,
    'status', 'APPROVED',
    'deliveries', count_created,
    'destination_level', ann.destination_level
  );
end;
$function$;
