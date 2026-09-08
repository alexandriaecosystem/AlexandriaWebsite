import type { SupabaseClient } from '@supabase/supabase-js';

export const accountCategories = ['telegram_premium', 'telegram_regular', 'telegram_unknown', 'whatsapp', 'discord', 'other'] as const;
export type AccountCategory = typeof accountCategories[number];
export type MemberComposition = {
  totalAccounts: number;
  linkedMembers: number;
  segments: { category: AccountCategory; count: number }[];
};
const count = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid account count');
  return value;
};
export function parseMemberComposition(value: unknown): MemberComposition {
  if (!value || typeof value !== 'object') throw new Error('Account data unavailable');
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.segments)) throw new Error('Account data unavailable');
  const seen = new Set<string>();
  const segments = row.segments.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid account segment');
    const segment = value as Record<string, unknown>;
    const category = segment.category as AccountCategory;
    if (!accountCategories.includes(category) || seen.has(category)) throw new Error('Invalid account category');
    seen.add(category);
    return { category, count: count(segment.count) };
  }).sort((a, b) => accountCategories.indexOf(a.category) - accountCategories.indexOf(b.category));
  const totalAccounts = count(row.total_accounts);
  const linkedMembers = count(row.linked_members);
  if (segments.reduce((total, segment) => total + segment.count, 0) !== totalAccounts || linkedMembers > totalAccounts) throw new Error('Inconsistent account totals');
  return { totalAccounts, linkedMembers, segments };
}
export async function getMemberComposition(client: SupabaseClient): Promise<MemberComposition> {
  const { data, error } = await client.rpc('admin_get_member_composition');
  if (error) throw new Error('Account composition unavailable');
  return parseMemberComposition(data);
}
