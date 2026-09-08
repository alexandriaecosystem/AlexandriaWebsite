import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('dark control center architecture', () => {
  it('uses one global stylesheet entrypoint with a deliberate cascade manifest', () => {
    const main = source('src/main.tsx');
    const manifest = source('src/app.css');
    expect(main).toContain("import './app.css';");
    expect(manifest).toContain("@import './styles.css';");
    expect(manifest).toContain("@import './ui-overrides.css';");
    expect(manifest).toContain("@import './i18n.css';");
    expect(manifest).toContain("@import './ux-system.css';");
    expect(manifest).toContain("@import './qa-responsive.css';");
    expect(manifest).toContain("@import './knowledge-analytics-ux.css';");
    expect(manifest).toContain("@import './premium-palette.css';");
  });

  it('normalizes shared primitive tokens after the compatibility layers', () => {
    const manifest = source('src/app.css');
    expect(manifest).toContain('--ux-radius-sm: var(--radius-control');
    expect(manifest).toContain('--ux-radius-md: var(--radius-card');
    expect(manifest).toContain('--ux-radius-lg: var(--radius-panel');
    expect(manifest).toContain('.panel,');
    expect(manifest).toContain('.metric-card,');
  });

  it('removes obsolete duplicate theme and mobile-shell files', () => {
    expect(existsSync(resolve(process.cwd(), 'src/modern-ui.css'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/ui-modernization.css'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/dark-control-center.css'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/mobile-shell.css'))).toBe(false);
  });

  it('loads the premium charcoal and gold theme last in the global manifest', () => {
    const manifest = source('src/app.css');
    const premiumIndex = manifest.indexOf("@import './premium-palette.css';");
    expect(premiumIndex).toBeGreaterThan(manifest.indexOf("@import './ui-overrides.css';"));
    expect(premiumIndex).toBeGreaterThan(manifest.indexOf("@import './ux-system.css';"));
    expect(premiumIndex).toBeGreaterThan(manifest.indexOf("@import './qa-responsive.css';"));
    expect(premiumIndex).toBeGreaterThan(manifest.indexOf("@import './takeover-admin-ux.css';"));
  });

  it('uses Alexandria premium brand tokens and restrained hierarchy', () => {
    const palette = source('src/premium-palette.css');
    expect(palette).toContain('--bg: #0b0d10');
    expect(palette).toContain('--surface: #111418');
    expect(palette).toContain('--brand-gold: #d7ae52');
    expect(palette).toContain('--brand-gold-bright: #f0cf7a');
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

  it('exposes brand and dashboard hierarchy hooks without changing core routes', () => {
    const shell = source('src/app/AppShell.tsx');
    const dashboard = source('src/pages/DashboardPage.tsx');
    expect(shell).toContain('brand-lockup');
    expect(dashboard).toContain('dashboard-hero-copy');
    expect(shell).toContain("{ to: '/', en: 'Dashboard'");
    expect(shell).toContain("{ to: '/users', en: 'Members'");
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
    const responsive = source('src/qa-responsive.css');
    expect(shell).toContain('.mobile-topbar');
    expect(shell).toContain('.sidebar-backdrop');
    expect(responsive).toContain('@media (max-width: 760px)');
    expect(responsive).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('does not reintroduce dominant white UX surfaces', () => {
    const palette = source('src/premium-palette.css');
    expect(palette).not.toMatch(/background:\s*(?:#fff(?:fff)?|white)\b/i);
    expect(palette).not.toMatch(/--(?:bg|surface|panel|card)[^:]*:\s*(?:#fff(?:fff)?|white)\b/i);
  });

  it('keeps the announcement composer inside the dark premium surface system', () => {
    const page = source('src/pages/AnnouncementsPage.css');
    expect(page).toContain('.announcement-composer');
    expect(page).toContain('var(--surface');
  });

  it('uses the current compact users workspace and row action controls', () => {
    const users = source('src/users.css');
    expect(users).toContain('.users-toolbar');
    expect(users).toContain('.users-table-card');
    expect(users).toContain('.user-row-action');
  });

  it('keeps purple and cyan out of the final premium theme layer', () => {
    const palette = source('src/premium-palette.css');
    expect(palette).not.toMatch(/#(?:7c3aed|8b5cf6|06b6d4|22d3ee)/i);
  });
});
