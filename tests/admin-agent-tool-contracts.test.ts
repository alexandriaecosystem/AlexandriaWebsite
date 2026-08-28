import { describe, expect, it } from 'vitest';
import { ALL_TOOLS, WRITE_TOOLS, normalizeToolArgs } from '../supabase/functions/admin-agent/tools';

describe('AI admin tool allowlist', () => {
  it('contains only the explicit supported tool names', () => {
    expect([...ALL_TOOLS].sort()).toEqual([
      'approve_document',
      'create_knowledge_record',
      'get_analytics',
      'get_community_platform_stats',
      'get_user_details',
      'list_community_members',
      'navigate_to_page',
      'search_knowledge_base',
      'search_users',
      'send_announcement',
      'update_knowledge_record',
    ]);
    expect([...WRITE_TOOLS].sort()).toEqual([
      'approve_document',
      'create_knowledge_record',
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

  it('rejects arbitrary tools, platforms and non-UUID record ids', () => {
    expect(() => normalizeToolArgs('run_sql', { sql: 'select 1' })).toThrow('unknown_tool');
    expect(() => normalizeToolArgs('list_community_members', { platform: 'SIGNAL' })).toThrow('invalid_platform');
    expect(() => normalizeToolArgs('approve_document', { document_id: 'doc-1' })).toThrow('invalid_document_id');
  });
});
