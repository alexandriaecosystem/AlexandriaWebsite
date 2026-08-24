import type { SupabaseClient } from '@supabase/supabase-js';
import type { KnowledgeDocumentDetail } from '../types/contracts';
import { AdminApiError } from './admin';

export interface EditableKnowledgeDocument extends KnowledgeDocumentDetail {
  content: string | null;
  editorHtml: string | null;
}

const asNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const asNullableString = (value: unknown) => value == null ? null : String(value);

function assertRpc<T>(data: T | null, error: { message: string; code?: string } | null): T {
  if (error) throw new AdminApiError(error.message, error.code);
  if (data == null) throw new AdminApiError('The server returned no data.');
  return data;
}

export async function getKnowledgeDocumentForEditing(client: SupabaseClient, documentId: string): Promise<EditableKnowledgeDocument> {
  const { data, error } = await client.rpc('admin_get_knowledge_document_editor', { p_document_id: documentId });
  const value = assertRpc(data as Record<string, unknown> | null, error);
  const chunks = Array.isArray(value.chunks) ? value.chunks as Record<string, unknown>[] : [];

  return {
    id: String(value.id),
    title: String(value.title),
    category: String(value.category),
    language: String(value.language),
    isApproved: value.is_approved === true,
    processingStatus: String(value.processing_status ?? 'PENDING'),
    processingError: asNullableString(value.processing_error),
    version: asNumber(value.version),
    approvedBy: asNullableString(value.approved_by),
    approvedAt: asNullableString(value.approved_at),
    createdAt: String(value.created_at),
    updatedAt: String(value.updated_at),
    chunkCount: asNumber(value.chunk_count),
    content: asNullableString(value.content),
    editorHtml: asNullableString(value.editor_content_html),
    chunks: chunks.map((chunk) => ({
      id: String(chunk.id),
      chunkIndex: asNumber(chunk.chunk_index),
      content: String(chunk.content ?? ''),
      version: asNumber(chunk.version),
    })),
  };
}

export async function updateKnowledgeDocumentContent(client: SupabaseClient, input: {
  documentId: string;
  title: string;
  content: string;
  editorHtml: string;
  expectedVersion: number;
}): Promise<{ id: string; version: number }> {
  const { data, error } = await client.rpc('admin_update_knowledge_document_content', {
    p_document_id: input.documentId,
    p_title: input.title,
    p_content: input.content,
    p_editor_content_html: input.editorHtml,
    p_expected_version: input.expectedVersion,
  });
  const value = assertRpc(data as Record<string, unknown> | null, error);
  return { id: String(value.id ?? input.documentId), version: asNumber(value.version) };
}
