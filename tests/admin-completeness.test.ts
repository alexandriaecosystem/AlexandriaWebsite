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

  it('has a real operations surface instead of a hard-coded live badge', () => {
    const app = source('src/app/App.tsx');
    const shell = source('src/app/AppShell.tsx');
    const dashboard = source('src/pages/DashboardPage.tsx');
    expect(existsSync(resolve(process.cwd(), 'src/pages/OperationsPage.tsx'))).toBe(true);
    expect(app).toContain('OperationsPage');
    expect(app).toContain('path="operations"');
    expect(shell).toContain("to: '/operations'");
    expect(dashboard).not.toContain("tr('Live', 'مباشر')");
    expect(dashboard).toContain('failedOperations');
  });

  it('surfaces dead letters and observed platform telemetry in operations', () => {
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
