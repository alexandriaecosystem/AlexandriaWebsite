import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('dark control center architecture', () => {
  it('removes the light-theme collision from the global import chain', () => {
    const main = source('src/main.tsx');
    expect(main).toContain("import './styles.css';");
    expect(main).toContain("import './i18n.css';");
    expect(main).not.toMatch(/admin-theme\.css|modern-ui\.css|mobile-shell\.css/);
  });

  it('defines the canonical premium charcoal and gold tokens', () => {
    const styles = source('src/styles.css');
    expect(styles).toContain('--bg: #0b0d10');
    expect(styles).toContain('--surface: #111418');
    expect(styles).toContain('--surface-raised: #1c2128');
    expect(styles).toContain('--accent: #d4a83f');
    expect(styles).toContain('--accent-strong: #e4be61');
    expect(styles).toContain('--secondary-accent: #c79a32');
    expect(styles).toContain('color-scheme: dark');
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

  it('keeps purple and cyan out of the shared premium accent system', () => {
    const styles = source('src/styles.css');
    expect(styles).not.toContain('#806cff');
    expect(styles).not.toContain('#50d9c1');
    expect(styles).not.toContain('rgba(128,108,255');
  });
});
