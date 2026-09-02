import { describe, expect, it } from 'vitest';
import { buildAdminPageContext } from '../src/agent/page-context';
import { resolveVoiceNavigation } from '../src/agent/voice-commands';
import edgeFunctionSource from '../supabase/functions/admin-agent/index.ts?raw';

describe('voice navigation', () => {
  it('resolves English navigation commands without using the AI agent', () => {
    expect(resolveVoiceNavigation('Go to analytics')).toBe('/analytics');
    expect(resolveVoiceNavigation('Open knowledge base')).toBe('/knowledge');
    expect(resolveVoiceNavigation('Show users')).toBe('/users');
    expect(resolveVoiceNavigation('Go back to dashboard')).toBe('/');
    expect(resolveVoiceNavigation('Open announcements')).toBe('/announcements');
  });

  it('recovers common speech-recognition mistakes for knowledge base navigation', () => {
    expect(resolveVoiceNavigation('go to Norwich bass')).toBe('/knowledge');
    expect(resolveVoiceNavigation('open knowledge bass')).toBe('/knowledge');
  });

  it('resolves Arabic navigation commands', () => {
    expect(resolveVoiceNavigation('افتح التحليلات')).toBe('/analytics');
    expect(resolveVoiceNavigation('افتح قاعدة المعرفة')).toBe('/knowledge');
    expect(resolveVoiceNavigation('اعرض المستخدمين')).toBe('/users');
    expect(resolveVoiceNavigation('اذهب إلى لوحة التحكم')).toBe('/');
  });

  it('resolves common multilingual navigation commands locally', () => {
    expect(resolveVoiceNavigation('Abre analíticas')).toBe('/analytics');
    expect(resolveVoiceNavigation('Ouvre la base de connaissances')).toBe('/knowledge');
    expect(resolveVoiceNavigation('Öffne Benutzer')).toBe('/users');
    expect(resolveVoiceNavigation('Apri annunci')).toBe('/announcements');
    expect(resolveVoiceNavigation('Abra a base de conhecimento')).toBe('/knowledge');
  });

  it('returns null for instructions that should be handled by the agent', () => {
    expect(resolveVoiceNavigation('How many Telegram VIP members do we have?')).toBeNull();
    expect(resolveVoiceNavigation('Create a pending knowledge record')).toBeNull();
  });
});

describe('admin page context', () => {
  it('describes user detail routes with their entity id', () => {
    expect(buildAdminPageContext('/users/user-123', 'en')).toEqual({
      pathname: '/users/user-123',
      page: 'user_detail',
      pageLabel: 'User details',
      language: 'en',
      entity: { type: 'user', id: 'user-123' },
    });
  });

  it('describes review detail routes and Arabic UI language', () => {
    expect(buildAdminPageContext('/reviews/application-9', 'ar')).toEqual({
      pathname: '/reviews/application-9',
      page: 'review_detail',
      pageLabel: 'مراجعة العضو',
      language: 'ar',
      entity: { type: 'application', id: 'application-9' },
    });
  });

  it('falls back to a safe unknown context for unrecognized routes', () => {
    expect(buildAdminPageContext('/something-else', 'en')).toMatchObject({
      pathname: '/something-else',
      page: 'unknown',
      pageLabel: 'Admin page',
      language: 'en',
    });
  });
});

describe('secure write confirmation wiring', () => {
  it('consumes the confirmation nonce before executing a write tool', () => {
    const start = edgeFunctionSource.indexOf('if (body.confirmation)');
    const end = edgeFunctionSource.indexOf('const model = await callModel', start);
    const confirmationBranch = edgeFunctionSource.slice(start, end);

    expect(confirmationBranch).toContain('admin_consume_agent_confirmation');
    expect(confirmationBranch.indexOf('admin_consume_agent_confirmation'))
      .toBeLessThan(confirmationBranch.indexOf('executeTool'));
  });
});

describe('knowledge search wiring', () => {
  it('uses the admin content-search RPC instead of title-only filtering', () => {
    const start = edgeFunctionSource.indexOf('case "search_knowledge_base"');
    const end = edgeFunctionSource.indexOf('case "get_analytics"', start);
    const searchBranch = edgeFunctionSource.slice(start, end);

    expect(searchBranch).toContain('admin_search_knowledge_documents');
    expect(searchBranch).not.toContain('item.title');
  });
});
