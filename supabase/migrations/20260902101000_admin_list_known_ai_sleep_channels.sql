-- Admins scheduling AI sleep had to type the exact platform channel/group ID
-- by hand (e.g. Telegram's "-1004367488453"), which they have no practical
-- way to know. Expose the small set of already-registered community
-- channels (the same rows admin_approve_announcement and the WhatsApp/
-- Telegram/Discord approval checks already use) so the admin UI can offer a
-- picker instead, while still allowing a manual/custom ID for channels that
-- are not registered as a community. Applied directly to production on
-- 2026-09-02; this file brings the migration history in sync.

create or replace function public.admin_list_known_ai_sleep_channels()
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'platform', upper(c.platform::text),
    'external_target_id', c.external_target_id,
    'name', c.name,
    'community_level', c.community_level
  ) order by c.platform, case c.community_level when 'APPROVED' then 1 when 'GENERAL' then 2 else 3 end, c.name), '[]'::jsonb)
  into v_items
  from public.communities c
  where c.is_active
    and c.platform::text in ('telegram', 'discord', 'whatsapp');

  return v_items;
end;
$$;

revoke all on function public.admin_list_known_ai_sleep_channels() from public, anon;
grant execute on function public.admin_list_known_ai_sleep_channels() to authenticated;
