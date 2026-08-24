-- Word-style knowledge document editing for the admin frontend.
-- The uploaded binary remains the immutable source file. Admin edits are stored as
-- canonical extracted text for RAG plus HTML used only to restore editor formatting.

alter table public.knowledge_documents
  add column if not exists content text,
  add column if not exists editor_content_html text;

create or replace function public.admin_get_knowledge_document_editor(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session jsonb;
  v_is_admin boolean := false;
  v_is_active boolean := true;
  v_document jsonb;
  v_chunks jsonb := '[]'::jsonb;
begin
  select to_jsonb(s)
    into v_session
  from public.admin_get_session() as s
  limit 1;

  v_is_admin := coalesce(
    (v_session ->> 'is_admin')::boolean,
    (v_session -> 'admin_get_session' ->> 'is_admin')::boolean,
    false
  );
  v_is_active := coalesce(
    (v_session ->> 'is_active')::boolean,
    (v_session -> 'admin_get_session' ->> 'is_active')::boolean,
    true
  );

  if not v_is_admin or not v_is_active then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select to_jsonb(d)
    into v_document
  from public.knowledge_documents d
  where d.id = p_document_id;

  if v_document is null then
    raise exception 'Knowledge document not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'knowledge_chunks'
      and column_name = 'document_id'
  ) then
    execute $sql$
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'chunk_index', chunk_index,
            'content', content,
            'version', version
          ) order by chunk_index
        ),
        '[]'::jsonb
      )
      from public.knowledge_chunks
      where document_id = $1
    $sql$ into v_chunks using p_document_id;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'knowledge_chunks'
      and column_name = 'knowledge_document_id'
  ) then
    execute $sql$
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'chunk_index', chunk_index,
            'content', content,
            'version', version
          ) order by chunk_index
        ),
        '[]'::jsonb
      )
      from public.knowledge_chunks
      where knowledge_document_id = $1
    $sql$ into v_chunks using p_document_id;
  end if;

  return v_document || jsonb_build_object(
    'chunks', v_chunks,
    'chunk_count', jsonb_array_length(v_chunks)
  );
end;
$$;

create or replace function public.admin_update_knowledge_document_content(
  p_document_id uuid,
  p_title text,
  p_content text,
  p_editor_content_html text,
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session jsonb;
  v_is_admin boolean := false;
  v_is_active boolean := true;
  v_current_version bigint;
  v_new_version bigint;
begin
  select to_jsonb(s)
    into v_session
  from public.admin_get_session() as s
  limit 1;

  v_is_admin := coalesce(
    (v_session ->> 'is_admin')::boolean,
    (v_session -> 'admin_get_session' ->> 'is_admin')::boolean,
    false
  );
  v_is_active := coalesce(
    (v_session ->> 'is_active')::boolean,
    (v_session -> 'admin_get_session' ->> 'is_active')::boolean,
    true
  );

  if not v_is_admin or not v_is_active then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if nullif(btrim(p_title), '') is null then
    raise exception 'Document title is required' using errcode = '22023';
  end if;

  if nullif(btrim(p_content), '') is null then
    raise exception 'Document content cannot be empty' using errcode = '22023';
  end if;

  select coalesce(d.version, 0)
    into v_current_version
  from public.knowledge_documents d
  where d.id = p_document_id
  for update;

  if v_current_version is null then
    raise exception 'Knowledge document not found' using errcode = 'P0002';
  end if;

  if p_expected_version is not null and v_current_version <> p_expected_version then
    raise exception 'This document was changed by another admin. Reopen it before saving.' using errcode = '40001';
  end if;

  v_new_version := v_current_version + 1;

  update public.knowledge_documents
  set title = btrim(p_title),
      content = p_content,
      editor_content_html = p_editor_content_html,
      version = v_new_version,
      is_approved = false,
      approved_by = null,
      approved_at = null,
      processing_status = 'PENDING',
      processing_error = null,
      updated_at = now()
  where id = p_document_id;

  -- Existing embeddings are based on the previous text and must never remain
  -- eligible after an edit. Support both historical FK names used by deployments.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'knowledge_chunks'
      and column_name = 'document_id'
  ) then
    execute 'delete from public.knowledge_chunks where document_id = $1' using p_document_id;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'knowledge_chunks'
      and column_name = 'knowledge_document_id'
  ) then
    execute 'delete from public.knowledge_chunks where knowledge_document_id = $1' using p_document_id;
  end if;

  return jsonb_build_object(
    'id', p_document_id,
    'version', v_new_version,
    'processing_status', 'PENDING',
    'is_approved', false
  );
end;
$$;

revoke all on function public.admin_get_knowledge_document_editor(uuid) from public;
revoke all on function public.admin_update_knowledge_document_content(uuid, text, text, text, bigint) from public;
grant execute on function public.admin_get_knowledge_document_editor(uuid) to authenticated;
grant execute on function public.admin_update_knowledge_document_content(uuid, text, text, text, bigint) to authenticated;
