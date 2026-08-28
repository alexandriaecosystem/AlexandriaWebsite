import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../services/supabase';
import type { AdminPageContext } from './page-context';

export type AdminAgentConfirmation = {
  token: string;
  tool: string;
};

export type AdminAgentRequest = {
  instruction: string;
  context: AdminPageContext;
  confirmation?: AdminAgentConfirmation;
};

export type AdminAgentResponse =
  | { kind: 'message'; message: string }
  | { kind: 'navigate'; message: string; path: string }
  | { kind: 'tool_result'; message: string; tool: string; result: unknown }
  | {
      kind: 'confirmation_required';
      message: string;
      confirmationToken: string;
      tool: string;
      preview: Record<string, unknown>;
    }
  | { kind: 'error'; message: string; code?: string };

function isAgentResponse(value: unknown): value is AdminAgentResponse {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (typeof record.kind !== 'string' || typeof record.message !== 'string') return false;
  if (record.kind === 'message' || record.kind === 'error') return true;
  if (record.kind === 'navigate') return typeof record.path === 'string';
  if (record.kind === 'tool_result') return typeof record.tool === 'string';
  if (record.kind === 'confirmation_required') {
    return typeof record.confirmationToken === 'string'
      && typeof record.tool === 'string'
      && Boolean(record.preview)
      && typeof record.preview === 'object';
  }
  return false;
}

export async function sendAdminAgentRequest(
  request: AdminAgentRequest,
  client: SupabaseClient = getSupabaseClient(),
): Promise<AdminAgentResponse> {
  const instruction = request.instruction.trim();
  if (!instruction) throw new Error('Agent instruction cannot be empty.');
  if (instruction.length > 4000) throw new Error('Agent instruction is too long.');

  const { data, error } = await client.functions.invoke('admin-agent', {
    body: { ...request, instruction },
  });
  if (error) throw new Error(error.message || 'AI admin assistant is unavailable.');
  if (!isAgentResponse(data)) throw new Error('The AI admin assistant returned an invalid response.');
  return data;
}
