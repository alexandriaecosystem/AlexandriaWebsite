create sequence if not exists public.whatsapp_quiz_question_no_seq;

do $$
declare
  v_max integer;
begin
  select coalesce(max(source_question_no), 0) into v_max from public.whatsapp_quiz_questions;
  perform setval('public.whatsapp_quiz_question_no_seq', greatest(v_max, 1), v_max > 0);
end
$$;

alter sequence public.whatsapp_quiz_question_no_seq owned by public.whatsapp_quiz_questions.source_question_no;
alter table public.whatsapp_quiz_questions
  alter column source_question_no set default nextval('public.whatsapp_quiz_question_no_seq');
grant usage, select on sequence public.whatsapp_quiz_question_no_seq to service_role;

create table if not exists public.whatsapp_quiz_schedule (
  schedule_key text primary key,
  enabled boolean not null default false,
  community_id uuid references public.communities(id) on delete set null,
  frequency text not null default 'daily' check (frequency in ('daily', 'weekly', 'custom')),
  time_of_day time without time zone not null default '19:00',
  timezone text not null default 'Asia/Beirut' check (timezone = 'Asia/Beirut'),
  days_of_week smallint[] not null default '{}'::smallint[],
  question_count smallint not null default 10 check (question_count = 10),
  next_run_at timestamptz,
  last_trigger_slot timestamptz,
  last_triggered_at timestamptz,
  last_run_at timestamptz,
  last_error text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_quiz_schedule_days_valid check (days_of_week <@ array[1,2,3,4,5,6,7]::smallint[]),
  constraint whatsapp_quiz_schedule_frequency_days_valid check (
    frequency = 'daily'
    or (frequency = 'weekly' and coalesce(array_length(days_of_week, 1), 0) = 1)
    or (frequency = 'custom' and coalesce(array_length(days_of_week, 1), 0) >= 1)
  )
);

alter table public.whatsapp_quiz_schedule enable row level security;
revoke all on table public.whatsapp_quiz_schedule from public, anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_quiz_schedule to service_role;

create or replace function public.compute_whatsapp_quiz_next_run(
  p_frequency text,
  p_time_of_day time without time zone,
  p_days_of_week smallint[],
  p_from timestamptz default now()
)
returns timestamptz
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_local_from timestamp without time zone := p_from at time zone 'Asia/Beirut';
  v_candidate_date date;
  v_candidate_local timestamp without time zone;
  v_candidate_utc timestamptz;
  v_day integer;
  v_i integer;
begin
  if p_frequency not in ('daily', 'weekly', 'custom') then
    raise exception 'invalid quiz frequency';
  end if;

  for v_i in 0..8 loop
    v_candidate_date := v_local_from::date + v_i;
    v_candidate_local := v_candidate_date + p_time_of_day;
    v_candidate_utc := v_candidate_local at time zone 'Asia/Beirut';
    v_day := extract(isodow from v_candidate_date)::integer;

    if v_candidate_utc > p_from
      and (
        p_frequency = 'daily'
        or v_day = any(coalesce(p_days_of_week, '{}'::smallint[]))
      ) then
      return v_candidate_utc;
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function public.compute_whatsapp_quiz_next_run(text, time without time zone, smallint[], timestamptz) from public, anon, authenticated;
grant execute on function public.compute_whatsapp_quiz_next_run(text, time without time zone, smallint[], timestamptz) to service_role;

create or replace function public.set_whatsapp_quiz_schedule_next_run()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  if new.enabled then
    new.next_run_at := public.compute_whatsapp_quiz_next_run(new.frequency, new.time_of_day, new.days_of_week, now());
  else
    new.next_run_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.set_whatsapp_quiz_schedule_next_run() from public, anon, authenticated;
grant execute on function public.set_whatsapp_quiz_schedule_next_run() to service_role;

drop trigger if exists set_whatsapp_quiz_schedule_next_run on public.whatsapp_quiz_schedule;
create trigger set_whatsapp_quiz_schedule_next_run
before insert or update of enabled, community_id, frequency, time_of_day, timezone, days_of_week, question_count
on public.whatsapp_quiz_schedule
for each row
execute function public.set_whatsapp_quiz_schedule_next_run();

insert into public.whatsapp_quiz_schedule (
  schedule_key,
  enabled,
  community_id,
  frequency,
  time_of_day,
  timezone,
  days_of_week,
  question_count
)
select
  'general_whatsapp_quiz',
  false,
  c.id,
  'daily',
  '19:00'::time,
  'Asia/Beirut',
  '{}'::smallint[],
  10
from public.communities c
where c.platform::text = 'whatsapp'
  and c.is_active = true
  and c.community_level = 'GENERAL'
  and c.name = 'WhatsApp General Community'
limit 1
on conflict (schedule_key) do nothing;

create or replace function public.service_claim_due_whatsapp_quiz_schedule(
  p_schedule_key text
)
returns table (
  schedule_key text,
  community_id uuid,
  question_count smallint,
  claimed_slot timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.whatsapp_quiz_schedule%rowtype;
  v_claimed_slot timestamptz;
begin
  select * into v_row
  from public.whatsapp_quiz_schedule s
  where s.schedule_key = p_schedule_key
  for update;

  if not found or not v_row.enabled or v_row.next_run_at is null or v_row.next_run_at > now() then
    return;
  end if;

  if v_row.next_run_at < now() - interval '10 minutes' then
    update public.whatsapp_quiz_schedule s
    set
      next_run_at = public.compute_whatsapp_quiz_next_run(v_row.frequency, v_row.time_of_day, v_row.days_of_week, now()),
      last_error = 'Scheduled quiz was skipped because the scheduler was unavailable at send time.',
      updated_at = now()
    where s.schedule_key = p_schedule_key;
    return;
  end if;

  v_claimed_slot := v_row.next_run_at;

  update public.whatsapp_quiz_schedule s
  set
    last_trigger_slot = v_claimed_slot,
    last_triggered_at = now(),
    next_run_at = public.compute_whatsapp_quiz_next_run(v_row.frequency, v_row.time_of_day, v_row.days_of_week, v_claimed_slot + interval '1 second'),
    last_error = null,
    updated_at = now()
  where s.schedule_key = p_schedule_key;

  return query
  select p_schedule_key, v_row.community_id, v_row.question_count, v_claimed_slot;
end;
$$;

revoke all on function public.service_claim_due_whatsapp_quiz_schedule(text) from public, anon, authenticated;
grant execute on function public.service_claim_due_whatsapp_quiz_schedule(text) to service_role;

create or replace function public.service_mark_whatsapp_quiz_dispatch_result(
  p_schedule_key text,
  p_claimed_slot timestamptz,
  p_success boolean,
  p_error text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  update public.whatsapp_quiz_schedule s
  set
    last_run_at = case when p_success then now() else s.last_run_at end,
    last_error = case when p_success then null else coalesce(nullif(trim(p_error), ''), 'Scheduled quiz delivery failed.') end,
    updated_at = now()
  where s.schedule_key = p_schedule_key
    and s.last_trigger_slot = p_claimed_slot;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.service_mark_whatsapp_quiz_dispatch_result(text, timestamptz, boolean, text) from public, anon, authenticated;
grant execute on function public.service_mark_whatsapp_quiz_dispatch_result(text, timestamptz, boolean, text) to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'whatsapp_quiz_scheduler_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'whatsapp_quiz_scheduler_token',
      'Internal token for the WhatsApp quiz scheduler Edge Function'
    );
  end if;
end
$$;

create or replace function public.service_get_whatsapp_quiz_scheduler_token()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'whatsapp_quiz_scheduler_token'
  limit 1;
$$;

revoke all on function public.service_get_whatsapp_quiz_scheduler_token() from public, anon, authenticated;
grant execute on function public.service_get_whatsapp_quiz_scheduler_token() to service_role;

create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'whatsapp-quiz-scheduler-tick',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://txghkgwowpsdjjdduecs.supabase.co/functions/v1/whatsapp-quiz-scheduler-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-quiz-scheduler-token', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'whatsapp_quiz_scheduler_token'
        limit 1
      )
    ),
    body := jsonb_build_object('scheduled_at', now()),
    timeout_milliseconds := 10000
  ) as request_id;
  $cron$
);