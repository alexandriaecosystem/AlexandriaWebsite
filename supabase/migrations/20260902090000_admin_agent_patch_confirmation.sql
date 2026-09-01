-- Keep the admin-agent write confirmation allowlist aligned with the current
-- patch_knowledge_document_text tool. Confirmation nonces are one-time and
-- remain admin-scoped through admin_consume_agent_confirmation.

alter table public.admin_agent_confirmation_nonces
  drop constraint if exists admin_agent_confirmation_nonces_tool_check;

alter table public.admin_agent_confirmation_nonces
  add constraint admin_agent_confirmation_nonces_tool_check
  check (tool in (
    'create_knowledge_record',
    'update_knowledge_record',
    'patch_knowledge_document_text',
    'approve_document',
    'send_announcement',
    'schedule_ai_sleep',
    'cancel_ai_sleep'
  ));

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
  if v_tool not in (
    'create_knowledge_record',
    'update_knowledge_record',
    'patch_knowledge_document_text',
    'approve_document',
    'send_announcement',
    'schedule_ai_sleep',
    'cancel_ai_sleep'
  ) then
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

  delete from public.admin_agent_confirmation_nonces
  where expires_at < now() - interval '1 day';
end;
$$;

revoke all on function public.admin_consume_agent_confirmation(uuid, text, timestamptz) from public, anon;
grant execute on function public.admin_consume_agent_confirmation(uuid, text, timestamptz) to authenticated;
