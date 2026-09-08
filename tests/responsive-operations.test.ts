import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('operational responsive regressions', () => {
  it('resets desktop table width when Members becomes mobile cards', () => {
    const css = readFileSync('src/users-visual-dashboard.css', 'utf8');
    expect(css).toContain('.users-table-card .users-table { min-width: 0; width: 100%; }');
  });
  it('fits the four essential dashboard metrics in one desktop row', () => {
    const css = readFileSync('src/dashboard-usability.css', 'utf8');
    expect(css).toMatch(/\.dashboard-summary-metrics\s*\{\s*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  });
  it('records the real platform for a knowledge gap rather than private/group context', () => {
    const expression = readFileSync('docs/production-audits/policies/knowledge-gap-platform.expression.txt', 'utf8');
    expect(expression).toContain("p_platform: String($('Answer Engine Input').first().json.platform || '')");
    expect(expression).not.toContain('context_type');
  });
});
