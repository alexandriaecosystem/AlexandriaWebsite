import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminUserListItem = {
  id: string;
  name: string | null;
  country: string | null;
  region: string | null;
  preferredLanguage: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  platforms: string[];
  messageCount: number;
  lastMessageAt: string | null;
  applicationStatus: string | null;
  finalScore: number | null;
  recommendation: string | null;
};

export type AdminConversationMessage = {
  id: string;
  platform: string;
  direction: 'USER' | 'ASSISTANT';
  text: string;
  occurredAt: string;
  historicalExcerpt: boolean;
  platformMessageId: string | null;
  correlationId: string | null;
};

export type AdminUserConversation = {
  user: {
    id: string;
    name: string | null;
    country: string | null;
    region: string | null;
    preferredLanguage: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  platformAccounts: Array<{
    id: string;
    platform: string;
    platformUserId: string;
    username: string | null;
    phoneNumber: string | null;
    createdAt: string;
  }>;
  application: Record<string, unknown> | null;
  messages: AdminConversationMessage[];
  messageCount: number;
};

function assertData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data == null) throw new Error('The server returned no data.');
  return data;
}

const asNullableString = (value: unknown) => value == null ? null : String(value);
const asNumberOrNull = (value: unknown) => value == null || value === '' ? null : Number(value);

export async function listAdminUsers(client: SupabaseClient, search = ''): Promise<{ items: AdminUserListItem[]; total: number }> {
  const { data, error } = await client.rpc('admin_list_users', {
    p_limit: 200,
    p_offset: 0,
    p_search: search.trim() || null,
  });
  const value = assertData(data as { items?: Record<string, unknown>[]; total?: number } | null, error);
  return {
    total: Number(value.total ?? 0),
    items: (value.items ?? []).map((item) => ({
      id: String(item.id),
      name: asNullableString(item.name),
      country: asNullableString(item.country),
      region: asNullableString(item.region),
      preferredLanguage: String(item.preferred_language ?? 'en'),
      status: String(item.status ?? 'ACTIVE'),
      createdAt: String(item.created_at),
      updatedAt: String(item.updated_at),
      platforms: Array.isArray(item.platforms) ? item.platforms.map(String) : [],
      messageCount: Number(item.message_count ?? 0),
      lastMessageAt: asNullableString(item.last_message_at),
      applicationStatus: asNullableString(item.application_status),
      finalScore: asNumberOrNull(item.final_score),
      recommendation: asNullableString(item.recommendation),
    })),
  };
}

export async function getAdminUserConversation(client: SupabaseClient, userId: string): Promise<AdminUserConversation> {
  const { data, error } = await client.rpc('admin_get_user_conversation', {
    p_user_id: userId,
    p_limit: 1000,
    p_before: null,
  });
  const value = assertData(data as Record<string, unknown> | null, error);
  const user = (value.user ?? {}) as Record<string, unknown>;
  const accounts = Array.isArray(value.platform_accounts) ? value.platform_accounts as Record<string, unknown>[] : [];
  const messages = Array.isArray(value.messages) ? value.messages as Record<string, unknown>[] : [];
  return {
    user: {
      id: String(user.id),
      name: asNullableString(user.name),
      country: asNullableString(user.country),
      region: asNullableString(user.region),
      preferredLanguage: String(user.preferred_language ?? 'en'),
      status: String(user.status ?? 'ACTIVE'),
      createdAt: String(user.created_at),
      updatedAt: String(user.updated_at),
    },
    platformAccounts: accounts.map((account) => ({
      id: String(account.id),
      platform: String(account.platform),
      platformUserId: String(account.platform_user_id),
      username: asNullableString(account.username),
      phoneNumber: asNullableString(account.phone_number),
      createdAt: String(account.created_at),
    })),
    application: value.application && typeof value.application === 'object' ? value.application as Record<string, unknown> : null,
    messages: messages.map((message) => ({
      id: String(message.id),
      platform: String(message.platform),
      direction: String(message.direction) === 'ASSISTANT' ? 'ASSISTANT' : 'USER',
      text: String(message.text ?? ''),
      occurredAt: String(message.occurred_at),
      historicalExcerpt: message.historical_excerpt === true,
      platformMessageId: asNullableString(message.platform_message_id),
      correlationId: asNullableString(message.correlation_id),
    })),
    messageCount: Number(value.message_count ?? 0),
  };
}
