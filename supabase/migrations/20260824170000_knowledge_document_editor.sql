-- Word-style knowledge document editing for the admin frontend.
-- The uploaded binary remains the original source file. Admin edits are stored as
-- canonical extracted text for RAG plus HTML used only to restore editor formatting.

alter table public.knowledge_documents
  add column if not exists editor_content_html text;

create or replace function public.admin_get_knowledge_document_editor(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session jsonb;
  v_document jsonb;
  v_chunks jsonb := '[]'::jsonb;
begin
  v_session := public.admin_get_session();
  if coalesce((v_session ->> 'is_admin')::boolean, false) is not true then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select to_jsonb(d)
    into v_document
  from public.knowledge_documents d
  where d.id = p_document_id;

  if v_document is null then
    raise exception 'Knowledge document not found' using errcode = 'P0002';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'chunk_index', c.chunk_index,
        'content', c.content,
        'version', c.version
      ) order by c.chunk_index
    ),
    '[]'::jsonb
  )
    into v_chunks
  from public.knowledge_chunks c
  where c.document_id = p_document_id;

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
  v_current_version bigint;
  v_new_version bigint;
begin
  v_session := public.admin_get_session();
  if coalesce((v_session ->> 'is_admin')::boolean, false) is not true then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if nullif(btrim(p_title), '') is null then
    raise exception 'Document title is required' using errcode = '22023';
  end if;

  if nullif(btrim(p_content), '') is null then
    raise exception 'Document content cannot be empty' using errcode = '22023';
  end if;

  select d.version
    into v_current_version
  from public.knowledge_documents d
  where d.id = p_document_id
  for update;

  if not found then
    raise exception 'Knowledge document not found' using errcode = 'P0002';
  end if;

  if p_expected_version is not null and v_current_version <> p_expected_version then
    raise exception 'This document was changed by another admin. Reopen it before saving.' using errcode = '40001';
  end if;

  v_new_version := coalesce(v_current_version, 0) + 1;

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

  -- Existing embeddings were generated from the previous text and must not remain
  -- eligible after an edit.
  delete from public.knowledge_chunks
  where document_id = p_document_id;

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
