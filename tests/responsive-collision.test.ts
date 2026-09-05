import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('responsive collision hardening', () => {
  it('lets shared card and flex children shrink instead of forcing overflow', () => {
    const css = source('src/qa-responsive.css');

    expect(css).toContain('.stat-card > *');
    expect(css).toContain('.stat-card-top > *');
    expect(css).toContain('.toolbar > *');
    expect(css).toContain('.quick-actions a > *');
    expect(css).toContain('min-width: 0;');
  });

  it('wraps dense shared rows before labels and controls collide', () => {
    const css = source('src/qa-responsive.css');

    expect(css).toContain('.stat-card-top,');
    expect(css).toContain('.section-heading,');
    expect(css).toContain('.header-status-group');
    expect(css).toContain('flex-wrap: wrap;');
  });

  it('stacks dense shared layouts on phone widths and keeps content readable', () => {
    const css = source('src/qa-responsive.css');

    expect(css).toContain('@media (max-width: 640px)');
    expect(css).toContain('.safety-panel');
    expect(css).toContain('.quick-actions a');
    expect(css).toContain('grid-template-columns: 1fr;');
    expect(css).toContain('overflow-wrap: anywhere;');
  });

  it('removes fixed mobile cell widths that can overflow users and messages cards', () => {
    const css = source('src/qa-responsive.css');

    expect(css).toContain('.user-identity-cell,');
    expect(css).toContain('.message-preview-cell');
    expect(css).toContain('.user-last-message');
    expect(css).toContain('white-space: normal;');
  });

  it('keeps media and controls inside their cards', () => {
    const css = source('src/qa-responsive.css');

    expect(css).toContain('img,');
    expect(css).toContain('svg,');
    expect(css).toContain('canvas');
    expect(css).toContain('max-width: 100%;');
  });

  it('prevents the knowledge gaps filter from collapsing its page title', () => {
    const page = source('src/pages/AdminOperationsPages.tsx');
    const css = source('src/admin-operations.css');

    expect(page).toContain('className="page-header knowledge-gaps-header"');
    expect(page).toContain('className="knowledge-gaps-heading"');
    expect(page).toContain('className="compact-select knowledge-gaps-status-filter"');
    expect(css).toContain('.knowledge-gaps-heading');
    expect(css).toContain('flex: 1 1 520px;');
    expect(css).toContain('.knowledge-gaps-status-filter');
    expect(css).toContain('width: auto;');
    expect(css).toContain('@media (max-width: 720px)');
    expect(css).toContain('.knowledge-gaps-header');
  });
});
