import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('admin control-center completeness', () => {
  it('exposes Instagram everywhere announcements can be targeted', () => {
    const service = source('src/services/announcement-media.ts');
    const page = source('src/pages/AnnouncementsPage.tsx');
    expect(service).toContain("'instagram'");
    expect(page).toMatch(/allPlatforms:[^\n]*instagram|allPlatforms[\s\S]*instagram/);
  });

  it('lets the inbox filter every supported conversational platform safely', () => {
    const page = source('src/pages/MessagesPage.tsx');
    expect(page).toContain('<option value="x">X</option>');
    expect(page).toContain('<option value="instagram">Instagram</option>');
    expect(page).toMatch(/\.some\([^)]*toLowerCase\(\)[^)]*platform/);
  });

  it('keeps exactly nine nontechnical primary destinations in the sidebar', () => {
    const shell = source('src/app/AppShell.tsx');
    const navPaths = [...shell.matchAll(/\{ to: '([^']+)'/g)].map((match) => match[1]);
    expect(navPaths).toEqual([
      '/',
      '/users',
      '/community',
      '/messages',
      '/knowledge',
      '/announcements',
      '/whatsapp-quiz',
      '/analytics',
      '/settings',
    ]);
    expect(shell).not.toContain("to: '/operations'");
    expect(shell).not.toContain("to: '/token-monitor'");
    expect(shell).not.toContain("to: '/account'");
    expect(shell).not.toContain("to: '/reviews'");
    expect(shell).not.toContain("to: '/knowledge-gaps'");
  });

  it('keeps technical operations reachable contextually without dominating the dashboard', () => {
    const app = source('src/app/App.tsx');
    const dashboard = source('src/pages/DashboardPage.tsx');
    expect(existsSync(resolve(process.cwd(), 'src/pages/OperationsPage.tsx'))).toBe(true);
    expect(app).toContain('OperationsPage');
    expect(app).toContain('path="operations"');
    expect(dashboard).not.toContain("tr('Live', 'مباشر')");
    expect(dashboard).not.toContain('failedOperations');
    expect(dashboard).not.toContain('platform-comparison');
  });

  it('surfaces dead letters and observed platform telemetry in the secondary operations route', () => {
    expect(existsSync(resolve(process.cwd(), 'src/pages/OperationsPage.tsx'))).toBe(true);
    if (!existsSync(resolve(process.cwd(), 'src/pages/OperationsPage.tsx'))) return;
    const page = source('src/pages/OperationsPage.tsx');
    expect(page).toContain('listDeadLetterOperations');
    expect(page).toContain('retryDeadLetterOperation');
    expect(page).toContain('getPlatformStats');
    expect(page).toContain('getCommunityPlatformStats');
  });

  it('uses a genuine settings hub instead of redirecting settings to account', () => {
    const app = source('src/app/App.tsx');
    const shell = source('src/app/AppShell.tsx');
    expect(existsSync(resolve(process.cwd(), 'src/pages/SettingsPage.tsx'))).toBe(true);
    expect(app).toContain('SettingsPage');
    expect(app).toContain('path="settings" element={<SettingsPage />}');
    expect(app).not.toContain('<Navigate to="/account" replace />');
    expect(shell).toContain("to: '/settings'");
  });
});
