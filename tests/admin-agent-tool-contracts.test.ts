import { describe, expect, it } from 'vitest';
import { ALL_TOOLS, WRITE_TOOLS, normalizeToolArgs, previewFor } from '../supabase/functions/admin-agent/tools';

describe('AI admin tool allowlist', () => {
  it('contains only the explicit supported tool names', () => {
    expect([...ALL_TOOLS].sort()).toEqual([
      'approve_document',
      'cancel_ai_sleep',
      'create_knowledge_record',
      'get_ai_sleep_status',
      'get_analytics',
      'get_community_platform_stats',
      'get_user_details',
      'list_ai_sleep_windows',
      'list_community_members',
      'navigate_to_page',
      'schedule_ai_sleep',
      'search_knowledge_base',
      'search_users',
      'send_announcement',
      'update_knowledge_record',
    ]);
    expect([...WRITE_TOOLS].sort()).toEqual([
      'approve_document',
      'cancel_ai_sleep',
      'create_knowledge_record',
      'schedule_ai_sleep',
      'send_announcement',
      'update_knowledge_record',
    ]);
  });

  it('defaults agent-created knowledge records to an existing Alexandria category', () => {
    expect(normalizeToolArgs('create_knowledge_record', {
      title: 'Alexandria Security FAQ',
      language: 'English',
    })).toEqual({
      title: 'Alexandria Security FAQ',
      category: 'INTERNAL_QA',
      language: 'en',
      content: '',
    });
  });

  it('accepts READY as a real knowledge processing status and rejects invented statuses', () => {
    expect(normalizeToolArgs('search_knowledge_base', { status: 'ready' })).toMatchObject({ status: 'READY' });
    expect(() => normalizeToolArgs('search_knowledge_base', { status: 'PROCESSED' })).toThrow('invalid_status');
  });

  it('normalizes sleep scheduling and requires an exact channel id', () => {
    const args = normalizeToolArgs('schedule_ai_sleep', {
      platform: 'telegram',
      external_channel_id: '-100123456',
      external_channel_name: 'VIP Community',
      starts_at: '2026-08-28T18:00:00+03:00',
      ends_at: '2026-08-29T09:00:00+03:00',
      reason: 'Human takeover',
    });
    expect(args).toEqual({
      platform: 'TELEGRAM',
      external_channel_id: '-100123456',
      external_channel_name: 'VIP Community',
      starts_at: '2026-08-28T15:00:00.000Z',
      ends_at: '2026-08-29T06:00:00.000Z',
      reason: 'Human takeover',
    });
    expect(previewFor('schedule_ai_sleep', args)).toMatchObject({
      platform: 'TELEGRAM',
      channel: 'VIP Community',
      external_channel_id: '-100123456',
      action: 'Pause automated AI replies for this channel during the scheduled window',
    });
    expect(() => normalizeToolArgs('schedule_ai_sleep', {
      platform: 'TELEGRAM',
      starts_at: '2026-08-28T18:00:00Z',
      ends_at: '2026-08-28T20:00:00Z',
    })).toThrow('invalid_external_channel_id');
  });

  it('rejects reversed and overly long sleep windows', () => {
    expect(() => normalizeToolArgs('schedule_ai_sleep', {
      platform: 'DISCORD',
      external_channel_id: '123',
      starts_at: '2026-08-29T10:00:00Z',
      ends_at: '2026-08-29T09:00:00Z',
    })).toThrow('invalid_sleep_window');
    expect(() => normalizeToolArgs('schedule_ai_sleep', {
      platform: 'WHATSAPP',
      external_channel_id: 'group-1',
      starts_at: '2026-08-01T00:00:00Z',
      ends_at: '2026-09-01T00:01:00Z',
    })).toThrow('sleep_window_too_long');
  });

  it('normalizes sleep reads and cancellation ids', () => {
    expect(normalizeToolArgs('list_ai_sleep_windows', { platform: 'discord', status: 'active', limit: 25 })).toEqual({
      platform: 'DISCORD', status: 'ACTIVE', limit: 25,
    });
    expect(normalizeToolArgs('get_ai_sleep_status', { platform: 'telegram', external_channel_id: '-100123456' })).toEqual({
      platform: 'TELEGRAM', external_channel_id: '-100123456',
    });
    expect(normalizeToolArgs('cancel_ai_sleep', { window_id: '11111111-1111-4111-8111-111111111111' })).toEqual({
      window_id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('rejects arbitrary tools, platforms and non-UUID record ids', () => {
    expect(() => normalizeToolArgs('run_sql', { sql: 'select 1' })).toThrow('unknown_tool');
    expect(() => normalizeToolArgs('list_community_members', { platform: 'SIGNAL' })).toThrow('invalid_platform');
    expect(() => normalizeToolArgs('approve_document', { document_id: 'doc-1' })).toThrow('invalid_document_id');
  });
});
