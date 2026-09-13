import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildAdminPageContext } from '../src/agent/page-context';
import { resolveVoiceNavigation } from '../src/agent/voice-commands';
import routerEdgeFunctionSource from '../supabase/functions/admin-agent/index.ts?raw';
import legacyEdgeFunctionSource from '../supabase/functions/admin-agent-legacy/index.ts?raw';

function parseDirectKnowledgeAddFromRouter(instruction: string): string | null {
  const start = routerEdgeFunctionSource.indexOf('function parseDirectKnowledgeAdd');
  const end = routerEdgeFunctionSource.indexOf('function titleFor', start);
  if (start < 0 || end < 0) throw new Error('Direct knowledge parser not found in router source.');
  const parserSource = routerEdgeFunctionSource
    .slice(start, end)
    .replace('function parseDirectKnowledgeAdd(instruction: string): string | null', 'function parseDirectKnowledgeAdd(instruction)');
  return runInNewContext(`${parserSource}\nparseDirectKnowledgeAdd(${JSON.stringify(instruction)})`);
}

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

describe('dashboard knowledge request routing', () => {
  it('recognizes destination-first add wording from the admin chat', () => {
    expect(parseDirectKnowledgeAddFromRouter('add to knowledge base alexandria is not a crypto currency'))
      .toBe('alexandria is not a crypto currency');
  });

  it('keeps recognizing content-first wording', () => {
    expect(parseDirectKnowledgeAddFromRouter('add Alexandria uses the TRON network to the knowledge base'))
      .toBe('Alexandria uses the TRON network');
  });
});

describe('secure write confirmation wiring', () => {
  it('consumes direct knowledge confirmation before calling the n8n knowledge workflow', () => {
    const start = routerEdgeFunctionSource.indexOf('if (body.confirmation)');
    const end = routerEdgeFunctionSource.indexOf('const content = parseDirectKnowledgeAdd', start);
    const confirmationBranch = routerEdgeFunctionSource.slice(start, end);

    expect(confirmationBranch).toContain('admin_consume_agent_confirmation');
    expect(confirmationBranch).toContain('callDashboardKnowledgeAssistant');
    expect(confirmationBranch.indexOf('admin_consume_agent_confirmation'))
      .toBeLessThan(confirmationBranch.indexOf('callDashboardKnowledgeAssistant'));
    expect(confirmationBranch).toContain('proxyLegacy');
  });

  it('keeps legacy write confirmations one-time before executing legacy tools', () => {
    const start = legacyEdgeFunctionSource.indexOf('if (body.confirmation)');
    const end = legacyEdgeFunctionSource.indexOf('const model = await callModel', start);
    const confirmationBranch = legacyEdgeFunctionSource.slice(start, end);

    expect(confirmationBranch).toContain('admin_consume_agent_confirmation');
    expect(confirmationBranch).toContain('executeTool');
    expect(confirmationBranch.indexOf('admin_consume_agent_confirmation'))
      .toBeLessThan(confirmationBranch.indexOf('executeTool'));
  });
});

describe('knowledge search wiring', () => {
  it('keeps general knowledge search in the legacy agent behind the router', () => {
    expect(routerEdgeFunctionSource).toContain('admin-agent-legacy');
    expect(routerEdgeFunctionSource).toContain('proxyLegacy');

    const start = legacyEdgeFunctionSource.indexOf('case "search_knowledge_base"');
    const end = legacyEdgeFunctionSource.indexOf('case "get_analytics"', start);
    const searchBranch = legacyEdgeFunctionSource.slice(start, end);

    expect(searchBranch).toContain('admin_search_knowledge_documents');
    expect(searchBranch).not.toContain('item.title');
  });
});
