insert into public.system_settings (setting_key, setting_value, updated_at)
values
  ('announcement_default_audience', 'GENERAL', now()),
  ('announcement_default_platforms', 'telegram', now()),
  ('token_large_transfer_threshold', '100000', now()),
  ('token_auto_refresh_seconds', '60', now())
on conflict (setting_key) do nothing;

create or replace function public.admin_get_ui_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not exists (
    select 1 from public.community_admins
    where user_id = auth.uid() and is_active
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'announcement_default_audience', coalesce((select setting_value from public.system_settings where setting_key='announcement_default_audience'), 'GENERAL'),
    'announcement_default_platforms', coalesce((select setting_value from public.system_settings where setting_key='announcement_default_platforms'), 'telegram'),
    'token_large_transfer_threshold', coalesce((select setting_value from public.system_settings where setting_key='token_large_transfer_threshold'), '100000'),
    'token_auto_refresh_seconds', coalesce((select setting_value from public.system_settings where setting_key='token_auto_refresh_seconds'), '60')
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.admin_update_ui_settings(
  p_announcement_default_audience text,
  p_announcement_default_platforms text[],
  p_token_large_transfer_threshold numeric,
  p_token_auto_refresh_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_platforms text;
  v_platform text;
begin
  if not exists (
    select 1 from public.community_admins
    where user_id = auth.uid() and is_active
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_announcement_default_audience not in ('GENERAL','APPROVED','BOTH') then
    raise exception 'invalid_audience' using errcode = '22023';
  end if;

  if coalesce(array_length(p_announcement_default_platforms, 1), 0) = 0 then
    raise exception 'platform_required' using errcode = '22023';
  end if;

  foreach v_platform in array p_announcement_default_platforms loop
    if v_platform not in ('telegram','discord','whatsapp') then
      raise exception 'invalid_platform' using errcode = '22023';
    end if;
  end loop;

  if p_token_large_transfer_threshold < 0 or p_token_large_transfer_threshold > 1000000000000000 then
    raise exception 'invalid_transfer_threshold' using errcode = '22023';
  end if;

  if p_token_auto_refresh_seconds not in (0,30,60,120,300) then
    raise exception 'invalid_refresh_interval' using errcode = '22023';
  end if;

  select string_agg(x, ',' order by x) into v_platforms
  from (select distinct unnest(p_announcement_default_platforms) x) s;

  insert into public.system_settings(setting_key, setting_value, updated_at)
  values
    ('announcement_default_audience', p_announcement_default_audience, now()),
    ('announcement_default_platforms', v_platforms, now()),
    ('token_large_transfer_threshold', p_token_large_transfer_threshold::text, now()),
    ('token_auto_refresh_seconds', p_token_auto_refresh_seconds::text, now())
  on conflict (setting_key) do update
    set setting_value = excluded.setting_value,
        updated_at = excluded.updated_at;

  return public.admin_get_ui_settings();
end;
$$;

revoke all on function public.admin_get_ui_settings() from public, anon;
revoke all on function public.admin_update_ui_settings(text, text[], numeric, integer) from public, anon;
grant execute on function public.admin_get_ui_settings() to authenticated;
grant execute on function public.admin_update_ui_settings(text, text[], numeric, integer) to authenticated;
