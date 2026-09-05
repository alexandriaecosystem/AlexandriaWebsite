import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('dark control center architecture', () => {
  it('uses one global stylesheet entrypoint with a deliberate cascade manifest', () => {
    const main = source('src/main.tsx');
    expect(main).toContain("import './app.css';");
    expect(main).not.toMatch(/import '\.\/(?:styles|ui-overrides|i18n|ux-system|qa-responsive|knowledge-analytics-ux|premium-palette)\.css';/);

    const app = source('src/app.css');
    const orderedImports = [
      './styles.css',
      './ui-overrides.css',
      './i18n.css',
      './ux-system.css',
      './qa-responsive.css',
      './knowledge-analytics-ux.css',
      './premium-palette.css',
    ];

    let lastIndex = -1;
    orderedImports.forEach((path) => {
      const index = app.indexOf(`@import '${path}';`);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    });
  });

  it('normalizes shared primitive tokens after the compatibility layers', () => {
    const app = source('src/app.css');
    expect(app).toContain('--ux-radius-sm: var(--radius-control, 10px)');
    expect(app).toContain('--ux-radius-md: var(--radius-card, 14px)');
    expect(app).toContain('--ux-radius-lg: var(--radius-panel, 14px)');
    expect(app).toContain('--ux-shadow-sm: var(--shadow-soft)');
    expect(app).toContain('--ux-shadow-md: var(--shadow-panel)');
    expect(app).toContain('.panel,');
    expect(app).toContain('.metric-card,');
    expect(app).toContain('border-radius: var(--radius-panel)');
    expect(app).toContain('border-radius: var(--radius-card)');
    expect(app).toContain('border-radius: var(--radius-control)');
  });

  it('removes obsolete duplicate theme and mobile-shell files', () => {
    expect(existsSync(resolve(process.cwd(), 'src/admin-theme.css'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/modern-ui.css'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/mobile-shell.css'))).toBe(false);
  });

  it('loads the premium charcoal and gold theme last in the global manifest', () => {
    const app = source('src/app.css');
    expect(app).toContain("@import './premium-palette.css';");
    const premiumIndex = app.indexOf("@import './premium-palette.css';");
    const knowledgeIndex = app.indexOf("@import './knowledge-analytics-ux.css';");
    expect(premiumIndex).toBeGreaterThan(knowledgeIndex);

    const palette = source('src/premium-palette.css');
    expect(palette).toContain('--bg: #0b0d10');
    expect(palette).toContain('--surface: #111418');
    expect(palette).toContain('--surface-raised: #1c2128');
    expect(palette).toContain('--accent: #d4a83f');
    expect(palette).toContain('--accent-strong: #e4be61');
    expect(palette).toContain('--secondary-accent: #c79a32');
  });

  it('uses Alexandria premium brand tokens and restrained hierarchy', () => {
    const palette = source('src/premium-palette.css');
    expect(palette).toContain('--brand-gold: #d7ae52');
    expect(palette).toContain('--brand-gold-bright: #f0cf7a');
    expect(palette).toContain('--brand-ink: #090b0e');
    expect(palette).toContain('--radius-panel: 14px');
    expect(palette).toContain('--shadow-panel:');
    expect(palette).toContain('.brand-lockup');
    expect(palette).toContain('.page-header::after');
  });

  it('keeps the application entrypoint intentionally small', () => {
    const main = source('src/main.tsx');
    const globalCssImports = main.match(/import '\.\/[a-z0-9-]+\.css';/g) ?? [];
    expect(globalCssImports).toEqual(["import './app.css';"]);
  });

  it('exposes brand and dashboard hierarchy hooks without changing routes', () => {
    const shell = source('src/app/AppShell.tsx');
    const dashboard = source('src/pages/DashboardPage.tsx');
    expect(shell).toContain('brand-lockup');
    expect(dashboard).toContain('dashboard-hero-copy');
    expect(shell).toContain("{ to: '/', en: 'Dashboard'");
    expect(shell).toContain("{ to: '/users', en: 'Users'");
  });

  it('keeps shared operational surfaces in the premium system', () => {
    const palette = source('src/premium-palette.css');
    expect(palette).toContain('.table-card');
    expect(palette).toContain('.status-pill');
    expect(palette).toContain('.admin-agent');
    expect(palette).toContain('.file-drop-zone');
    expect(palette).toContain('.conversation-stream');
    expect(palette).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('keeps the responsive app shell dark and reduced-motion safe', () => {
    const shell = source('src/app/AppShell.css');
    expect(shell).toContain('background: var(--surface)');
    expect(shell).toContain('@media (prefers-reduced-motion: reduce)');
    expect(shell).not.toContain('background: #fff');
    expect(shell).not.toContain('rgba(255, 255, 255, .96)');
  });

  it('does not reintroduce dominant white UX surfaces', () => {
    const ux = source('src/ux-system.css');
    const knowledge = source('src/knowledge-analytics-ux.css');
    const advanced = source('src/advanced-ux.css');
    expect(ux).not.toMatch(/background:\s*#fff(?:;|\s)/);
    expect(ux).not.toMatch(/background:\s*#f8fafc/);
    expect(knowledge).not.toMatch(/background:\s*#fff(?:;|\s)/);
    expect(advanced).not.toMatch(/background:\s*#fff(?:;|\s)/);
  });

  it('keeps the announcement composer inside the dark premium surface system', () => {
    const announcements = source('src/pages/AnnouncementsPage.css');
    const media = source('src/pages/AnnouncementsMedia.css');
    expect(announcements).not.toMatch(/background:\s*#fff(?:;|\s)/);
    expect(announcements).not.toMatch(/background:\s*#f8fafc/);
    expect(media).not.toMatch(/background:\s*#fff(?:;|\s)/);
    expect(media).not.toMatch(/background:\s*#f8fafc/);
    expect(announcements).toContain('background: var(--surface-raised)');
    expect(media).toContain('background: var(--surface-raised)');
    expect(announcements).toContain('.composer-step');
  });

  it('uses a compact users workspace and icon conversation actions', () => {
    const usersPage = source('src/pages/UsersPage.tsx');
    const usersStyles = source('src/users.css');
    expect(usersPage).toContain('className="page-header users-page-header"');
    expect(usersPage).toContain('className="toolbar users-toolbar"');
    expect(usersPage).toContain('className="user-row-action"');
    expect(usersPage).toContain("aria-label={tr('Open conversation', 'فتح المحادثة')}");
    expect(usersStyles).toContain('.users-page-header');
    expect(usersStyles).toContain('.users-toolbar');
    expect(usersStyles).toContain('.user-row-action');
  });

  it('keeps purple and cyan out of the final premium theme layer', () => {
    const palette = source('src/premium-palette.css');
    expect(palette).not.toContain('#806cff');
    expect(palette).not.toContain('#50d9c1');
    expect(palette).not.toContain('rgba(128,108,255');
  });
});
