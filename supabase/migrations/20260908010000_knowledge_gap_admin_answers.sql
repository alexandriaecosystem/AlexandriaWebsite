-- Let community admins turn unanswered questions into trusted, indexed knowledge.
-- The linked answer document is approved before the existing n8n KB outbox worker
-- receives KNOWLEDGE_DOCUMENT_REPROCESS_REQUESTED, matching the worker's fail-closed gate.

alter table public.knowledge_gaps
  add column if not exists admin_answer text,
  add column if not exists answered_by uuid,
  add column if not exists answered_at timestamptz;

create or replace function public.admin_list_knowledge_gaps(
  p_limit integer default 100,
  p_status text default null
)
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
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_limit not between 1 and 500 then
    raise exception 'validation_error' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('OPEN', 'RESOLVED', 'IGNORED') then
    raise exception 'validation_error' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(x order by x.last_seen_at desc), '[]'::jsonb)
  into v_items
  from (
    select id, sample_question, platform, language, occurrence_count, first_seen_at, last_seen_at,
      status, resolved_document_id, admin_answer, answered_by, answered_at, created_at, updated_at
    from public.knowledge_gaps
    where p_status is null or status = p_status
    order by last_seen_at desc
    limit p_limit
  ) x;

  return jsonb_build_object(
    'items', v_items,
    'total', (select count(*) from public.knowledge_gaps where p_status is null or status = p_status)
  );
end;
$$;

create or replace function public.admin_answer_knowledge_gap(
  p_gap_id uuid,
  p_answer text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_gap public.knowledge_gaps%rowtype;
  v_answer text := btrim(coalesce(p_answer, ''));
  v_question text;
  v_language text;
  v_document_id uuid;
  v_document_exists boolean := false;
  v_content text;
  v_title text;
  v_editor_html text;
  v_version bigint;
  v_pending_count integer := 0;
  v_answered_at timestamptz := now();
begin
  if auth.uid() is null or not public.is_community_admin(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if length(v_answer) not between 2 and 20000 then
    raise exception 'Answer must be between 2 and 20000 characters' using errcode = '22023';
  end if;

  select * into v_gap
  from public.knowledge_gaps
  where id = p_gap_id
  for update;

  if v_gap.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v_question := btrim(coalesce(v_gap.sample_question, ''));
  if v_question = '' then
    raise exception 'Knowledge gap question is empty' using errcode = '22023';
  end if;

  v_language := lower(btrim(coalesce(v_gap.language, 'en')));
  if v_language not in ('en', 'ar', 'de', 'fr', 'es', 'it') then
    v_language := 'en';
  end if;

  v_content := 'Question:' || E'\n' || v_question || E'\n\nTrusted admin answer:\n' || v_answer;
  v_title := 'Knowledge gap: ' || left(v_question, 180);
  v_editor_html := '<p><strong>Question:</strong> ' ||
    replace(replace(replace(v_question, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') ||
    '</p><p><strong>Trusted admin answer:</strong> ' ||
    replace(replace(replace(v_answer, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>';

  v_document_id := v_gap.resolved_document_id;
  if v_document_id is not null then
    select exists(select 1 from public.knowledge_documents where id = v_document_id)
    into v_document_exists;
  end if;

  if v_document_exists then
    update public.knowledge_documents
    set title = v_title,
      category = 'KNOWLEDGE_GAP_ANSWER',
      source_uri = 'admin://knowledge-gap/' || p_gap_id::text,
      language = v_language,
      is_approved = true,
      approved_by = auth.uid(),
      approved_at = v_answered_at,
      processing_status = 'PENDING',
      processing_error = null,
      version = coalesce(version, 0) + 1,
      file_name = 'knowledge-gap-' || p_gap_id::text || '.txt',
      mime_type = 'text/plain',
      storage_path = 'knowledge-gaps/' || p_gap_id::text || '.txt',
      size_bytes = octet_length(v_content),
      content = v_content,
      editor_content_html = v_editor_html,
      updated_at = v_answered_at
    where id = v_document_id
    returning version into v_version;
  else
    v_document_id := gen_random_uuid();
    insert into public.knowledge_documents (
      id, title, category, source_uri, language, is_approved, approved_by, approved_at,
      processing_status, processing_error, version, file_name, mime_type, storage_path,
      size_bytes, content, editor_content_html
    ) values (
      v_document_id, v_title, 'KNOWLEDGE_GAP_ANSWER', 'admin://knowledge-gap/' || p_gap_id::text,
      v_language, true, auth.uid(), v_answered_at, 'PENDING', null, 1,
      'knowledge-gap-' || p_gap_id::text || '.txt', 'text/plain',
      'knowledge-gaps/' || p_gap_id::text || '.txt', octet_length(v_content), v_content, v_editor_html
    ) returning version into v_version;
  end if;

  delete from public.knowledge_chunks where document_id = v_document_id;

  update public.knowledge_gaps
  set status = 'RESOLVED',
    resolved_document_id = v_document_id,
    admin_answer = v_answer,
    answered_by = auth.uid(),
    answered_at = v_answered_at,
    updated_at = v_answered_at
  where id = p_gap_id;

  -- Reuse a pending job if it has not been claimed. If an older job is already
  -- processing, insert a second pending job so this exact document version is indexed next.
  update public.outbox_events
  set payload = jsonb_build_object(
        'document_id', v_document_id,
        'version', v_version,
        'reason', 'knowledge_gap_admin_answer',
        'knowledge_gap_id', p_gap_id
      ),
      available_at = least(available_at, now()),
      last_error = null,
      updated_at = now()
  where aggregate_id = v_document_id
    and event_type = 'KNOWLEDGE_DOCUMENT_REPROCESS_REQUESTED'
    and status = 'PENDING';

  get diagnostics v_pending_count = row_count;

  if v_pending_count = 0 then
    insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload, idempotency_key)
    values (
      'KNOWLEDGE_DOCUMENT_REPROCESS_REQUESTED',
      'knowledge_document',
      v_document_id,
      jsonb_build_object(
        'document_id', v_document_id,
        'version', v_version,
        'reason', 'knowledge_gap_admin_answer',
        'knowledge_gap_id', p_gap_id
      ),
      'knowledge-gap-answer:' || p_gap_id::text || ':' || v_version::text || ':' || gen_random_uuid()::text
    );
  end if;

  perform public.bump_knowledge_version();

  return jsonb_build_object(
    'gap_id', p_gap_id,
    'status', 'RESOLVED',
    'resolved_document_id', v_document_id,
    'answer', v_answer,
    'answered_at', v_answered_at,
    'document_version', v_version,
    'processing_status', 'PENDING'
  );
end;
$$;

create or replace function public.admin_reopen_knowledge_gap(p_gap_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_gap public.knowledge_gaps%rowtype;
  v_now timestamptz := now();
begin
  if auth.uid() is null or not public.is_community_admin(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_gap
  from public.knowledge_gaps
  where id = p_gap_id
  for update;

  if v_gap.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_gap.resolved_document_id is not null then
    -- De-approval plus a version bump makes any in-flight older chunks ineligible for RAG.
    update public.knowledge_documents
    set is_approved = false,
      approved_by = null,
      approved_at = null,
      processing_status = 'PENDING',
      processing_error = null,
      version = coalesce(version, 0) + 1,
      updated_at = v_now
    where id = v_gap.resolved_document_id;

    delete from public.knowledge_chunks
    where document_id = v_gap.resolved_document_id;

    update public.outbox_events
    set status = 'PROCESSED',
      processed_at = v_now,
      claimed_at = null,
      last_error = 'Cancelled because linked knowledge gap was reopened',
      updated_at = v_now
    where aggregate_id = v_gap.resolved_document_id
      and event_type = 'KNOWLEDGE_DOCUMENT_REPROCESS_REQUESTED'
      and status = 'PENDING';
  end if;

  -- Keep the answer and document link as editable history, while removing it from active RAG.
  update public.knowledge_gaps
  set status = 'OPEN', updated_at = v_now
  where id = p_gap_id;

  perform public.bump_knowledge_version();

  return jsonb_build_object(
    'gap_id', p_gap_id,
    'status', 'OPEN',
    'resolved_document_id', v_gap.resolved_document_id,
    'answer', v_gap.admin_answer,
    'answered_at', v_gap.answered_at
  );
end;
$$;

revoke all on function public.admin_answer_knowledge_gap(uuid, text) from public, anon;
grant execute on function public.admin_answer_knowledge_gap(uuid, text) to authenticated;

revoke all on function public.admin_reopen_knowledge_gap(uuid) from public, anon;
grant execute on function public.admin_reopen_knowledge_gap(uuid) to authenticated;
