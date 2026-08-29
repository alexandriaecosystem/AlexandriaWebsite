# Dark Control Center UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Alexandria Community Admin frontend into a cohesive premium dark crypto operations dashboard while preserving all existing routes, Supabase behavior, bilingual English/Arabic support, RTL behavior, mobile usability, accessibility, and AI admin functionality.

**Architecture:** Re-establish `src/styles.css` as the canonical shared design-system layer, keep shell layout rules in `src/app/AppShell.css`, and keep dashboard/chart/agent rules in their existing component-owned stylesheets. Remove the current broad light-theme override stack from `src/main.tsx` after any still-needed selectors have been migrated to their proper owner, then update the dashboard hierarchy and active page-specific light surfaces to consume the shared dark tokens.

**Tech Stack:** React 19, TypeScript 5.9, React Router 7, Vite 7, Vitest 3, Testing Library, CSS.

**Spec:** `docs/superpowers/specs/2026-08-29-dark-control-center-ui-design.md`

## Global Constraints

- Preserve the route structure exactly.
- Do not change Supabase schema, authentication behavior, data-fetching semantics, or mutation semantics.
- Do not change admin permissions, AI agent action permissions, announcement posting behavior, community qualification logic, or token monitor backend behavior.
- Preserve English and Arabic labels and RTL behavior.
- Preserve keyboard navigation, skip link behavior, visible focus indicators, and semantic status distinctions that do not rely on color alone.
- Respect `prefers-reduced-motion: reduce` globally.
- Use deep navy/charcoal surfaces with purple-blue primary accents and cyan/teal secondary accents.
- Keep Telegram, Discord, and WhatsApp identity colors only where platform identity is communicated.
- Avoid excessive glow, looping animation, parallax, and decorative motion.
- Do not add another broad override stylesheet.

---

## File Structure

- `src/main.tsx` — application entrypoint and global stylesheet import order only.
- `src/styles.css` — canonical tokens, reset, typography, shared panels/cards/tables/forms/statuses, shared animation primitives, responsive shared primitives.
- `src/i18n.css` — language toggle and RTL-only rules.
- `src/app/AppShell.css` — desktop/mobile shell, sidebar, mobile topbar, drawer/backdrop behavior.
- `src/pages/DashboardPage.tsx` — dashboard information hierarchy and section ordering only; no data-logic changes.
- `src/dashboard-chart.css` — dashboard charts, community distribution cards, chart motion and dark visualization surfaces.
- `src/admin-agent.css` — AI admin launcher, panel, messages, voice state, confirmation dialog.
- `src/knowledge-analytics-ux.css` — knowledge and analytics workflow-specific surfaces; convert hard-coded light values to design tokens.
- `src/advanced-ux.css` — shared bulk actions, skeletons, review navigation, and responsive table-card styling; convert hard-coded light surfaces to dark tokens.
- `tests/dark-control-center.test.ts` — static architecture regression tests for global imports/tokens/dashboard ordering/reduced motion.
- `tests/ui-modernization.test.tsx` — chart rendering regression coverage.
- `tests/admin-agent-ui.test.tsx` — existing functional protection for the global agent while its CSS changes.

---

### Task 1: Lock the dark design system and remove the global light-theme collision

**Files:**
- Create: `tests/dark-control-center.test.ts`
- Modify: `src/styles.css`
- Modify: `src/main.tsx`
- Read/Migrate as needed: `src/ui-overrides.css`, `src/admin-theme.css`, `src/ux-system.css`, `src/advanced-ux.css`, `src/mobile-shell.css`, `src/qa-responsive.css`, `src/knowledge-analytics-ux.css`, `src/modern-ui.css`

**Interfaces:**
- Consumes: existing shared class names such as `.panel`, `.table-card`, `.metric-card`, `.status-pill`, `.primary`, `.sidebar`, `.content`.
- Produces: one canonical shared token contract in `:root` used by all later tasks.

- [ ] **Step 1: Write the failing architecture test**

Create `tests/dark-control-center.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('dark control center architecture', () => {
  it('uses one global theme layer instead of stacked theme overrides', () => {
    const main = source('src/main.tsx');
    expect(main).toContain("import './styles.css';");
    expect(main).toContain("import './i18n.css';");
    expect(main).not.toMatch(/admin-theme\.css|modern-ui\.css|ui-overrides\.css|ux-system\.css|advanced-ux\.css|mobile-shell\.css|qa-responsive\.css|knowledge-analytics-ux\.css/);
  });

  it('defines the canonical dark surface and accent tokens', () => {
    const styles = source('src/styles.css');
    expect(styles).toContain('--bg: #070b13');
    expect(styles).toContain('--surface: #0d1420');
    expect(styles).toContain('--surface-raised: #111a29');
    expect(styles).toContain('--accent: #806cff');
    expect(styles).toContain('--secondary-accent: #50d9c1');
    expect(styles).toContain('color-scheme: dark');
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- tests/dark-control-center.test.ts
```

Expected: FAIL because `src/main.tsx` still imports multiple global override files and `--secondary-accent` is not yet defined.

- [ ] **Step 3: Consolidate shared tokens and primitives in `src/styles.css`**

Keep the existing dark foundation and normalize the root contract to include at least:

```css
:root {
  font-family: 'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #eef2ff;
  background: #070b13;
  color-scheme: dark;
  --bg: #070b13;
  --surface: #0d1420;
  --surface-raised: #111a29;
  --panel: #101826;
  --panel-soft: #0c1320;
  --border: #222f42;
  --border-strong: #33445d;
  --text: #eef2ff;
  --muted: #91a0b7;
  --muted-strong: #b4bfd0;
  --accent: #806cff;
  --accent-soft: rgba(128, 108, 255, .13);
  --accent-strong: #9f93ff;
  --secondary-accent: #50d9c1;
  --secondary-accent-soft: rgba(80, 217, 193, .11);
  --success: #42d6b3;
  --success-soft: rgba(66, 214, 179, .10);
  --warning: #f4be5b;
  --warning-soft: rgba(244, 190, 91, .10);
  --danger: #ff7081;
  --danger-soft: rgba(255, 112, 129, .10);
  --shadow-soft: 0 12px 34px rgba(0, 0, 0, .16);
  --shadow: 0 24px 60px rgba(0, 0, 0, .28);
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 18px;
}
```

Shared panels, tables, forms, status chips, buttons and metric cards must use these tokens rather than white/light hex surfaces. Retain existing class names to avoid component rewrites.

- [ ] **Step 4: Migrate still-needed shared rules out of broad override files**

Move only active shared selectors that are not already represented in `styles.css` into the canonical file. Preserve selector names used by React components. Do not copy duplicate `:root` blocks or light palette values.

Examples of rules that should survive in dark form:

```css
.metric-card {
  background: linear-gradient(145deg, rgba(18, 27, 42, .96), rgba(12, 19, 31, .98));
  border: 1px solid var(--border);
  box-shadow: var(--shadow-soft);
}

.table-card {
  background: rgba(13, 20, 32, .96);
  border: 1px solid var(--border);
}

input,
textarea,
select {
  background: #0a111c;
  color: var(--text);
  border-color: var(--border-strong);
}
```

- [ ] **Step 5: Simplify the entrypoint import chain**

Replace the global style imports in `src/main.tsx` with:

```ts
import './styles.css';
import './i18n.css';
```

Component-owned files such as `AppShell.css`, `admin-agent.css`, and `dashboard-chart.css` remain imported by their components/pages.

- [ ] **Step 6: Run the architecture test**

Run:

```bash
npm test -- tests/dark-control-center.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main.tsx src/styles.css tests/dark-control-center.test.ts
git commit -m "style: establish dark control center design system"
```

---

### Task 2: Convert the app shell, sidebar and mobile drawer to the dark control-center visual hierarchy

**Files:**
- Modify: `src/app/AppShell.css`
- Modify: `src/i18n.css`
- Test: `tests/dark-control-center.test.ts`

**Interfaces:**
- Consumes: canonical tokens from Task 1 and existing `AppShell.tsx` markup.
- Produces: stable desktop/mobile/RTL shell without changing navigation behavior.

- [ ] **Step 1: Extend the static test for shell ownership and reduced motion**

Add to `tests/dark-control-center.test.ts`:

```ts
it('keeps mobile drawer motion accessible and dark-theme driven', () => {
  const shell = source('src/app/AppShell.css');
  expect(shell).toContain('background: var(--surface)');
  expect(shell).toContain('@media (prefers-reduced-motion: reduce)');
  expect(shell).not.toContain('background: #fff');
  expect(shell).not.toContain('rgba(255, 255, 255, .96)');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

```bash
npm test -- tests/dark-control-center.test.ts
```

Expected: FAIL because the current mobile top bar/sidebar/button surfaces are white.

- [ ] **Step 3: Replace light mobile shell surfaces with dark tokenized surfaces**

Use the existing behavior and selectors, but style the shell like:

```css
.mobile-topbar {
  border-bottom: 1px solid var(--border);
  background: rgba(13, 20, 32, .92);
  backdrop-filter: blur(18px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, .20);
}

.mobile-menu-button,
.sidebar-close {
  border: 1px solid var(--border);
  background: var(--surface-raised);
  color: var(--text);
}

.app-shell .sidebar {
  background: var(--surface);
  border-color: var(--border);
  box-shadow: 24px 0 70px rgba(0, 0, 0, .38);
}

.sidebar-backdrop {
  background: rgba(3, 7, 14, .68);
  backdrop-filter: blur(3px);
}
```

Keep the existing `transform`, Escape handling, body scroll lock, LTR/RTL inset logic, and responsive widths unchanged.

- [ ] **Step 4: Make desktop active navigation visibly premium without excessive glow**

Ensure the shared/sidebar rules use:

```css
.sidebar nav a.active {
  color: var(--text);
  border-color: rgba(128, 108, 255, .28);
  background: linear-gradient(90deg, rgba(128, 108, 255, .17), rgba(128, 108, 255, .055));
  box-shadow: inset 3px 0 0 var(--accent);
}

html[dir='rtl'] .sidebar nav a.active {
  box-shadow: inset -3px 0 0 var(--accent);
}
```

- [ ] **Step 5: Keep the language toggle dark in both shell directions**

Use existing `src/i18n.css` selectors but keep surfaces tokenized:

```css
.language-toggle {
  border-color: var(--border);
  background: rgba(255, 255, 255, .025);
}

.language-toggle button.active {
  background: var(--accent-soft);
  color: #d8d3ff;
  box-shadow: inset 0 0 0 1px rgba(128, 108, 255, .24);
}
```

- [ ] **Step 6: Run tests**

```bash
npm test -- tests/dark-control-center.test.ts tests/admin-agent-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/AppShell.css src/i18n.css tests/dark-control-center.test.ts
git commit -m "style: darken admin shell and navigation"
```

---

### Task 3: Reorder and compact the dashboard so KPIs appear before oversized operational panels

**Files:**
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/styles.css`
- Test: `tests/dark-control-center.test.ts`

**Interfaces:**
- Consumes: existing `DashboardMetrics`, `usageTrackingMissing`, `attentionCount`, links and service calls.
- Produces: the same data and interactions with improved visual order: header → KPI row → attention/setup row → platform/community analytics → message trend.

- [ ] **Step 1: Add a structural ordering regression test**

Append:

```ts
it('shows dashboard KPIs before secondary attention and setup panels', () => {
  const dashboard = source('src/pages/DashboardPage.tsx');
  const metricIndex = dashboard.indexOf('className="metric-grid"');
  const attentionIndex = dashboard.indexOf('className="panel attention-panel"');
  expect(metricIndex).toBeGreaterThan(-1);
  expect(attentionIndex).toBeGreaterThan(-1);
  expect(metricIndex).toBeLessThan(attentionIndex);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

```bash
npm test -- tests/dark-control-center.test.ts
```

Expected: FAIL because the attention panel currently appears before `.metric-grid`.

- [ ] **Step 3: Move the existing KPI section immediately below the dashboard header/loading boundary**

Move the existing `<section className="metric-grid">...</section>` above the attention panel. Do not change values, links, translations, or data fetching.

- [ ] **Step 4: Keep attention and missing-cost setup visually compact**

Use shared rules such as:

```css
.metric-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.metric-card {
  min-height: 128px;
  padding: 18px;
}

.attention-panel {
  margin-bottom: 16px;
  background: linear-gradient(135deg, rgba(16, 24, 38, .96), rgba(11, 18, 30, .96));
}

.attention-grid a {
  background: var(--panel-soft);
  border: 1px solid var(--border);
}
```

The setup-needed AI spend panel should remain a `role="status"` surface but use `var(--panel)`/`var(--warning-soft)` rather than a large white card.

- [ ] **Step 5: Add restrained initial entrance motion**

Apply one shared animation to major dashboard sections:

```css
@keyframes surface-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.metric-grid,
.attention-panel,
.community-membership-panel,
.dashboard-chart-panel {
  animation: surface-in .28s ease both;
}

@media (prefers-reduced-motion: reduce) {
  .metric-grid,
  .attention-panel,
  .community-membership-panel,
  .dashboard-chart-panel {
    animation: none;
  }
}
```

Do not add looping animations.

- [ ] **Step 6: Run tests**

```bash
npm test -- tests/dark-control-center.test.ts tests/community-dashboard.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/DashboardPage.tsx src/styles.css tests/dark-control-center.test.ts
git commit -m "style: prioritize dashboard metrics and operations"
```

---

### Task 4: Restyle dashboard charts and community platform cards for dark-mode readability

**Files:**
- Modify: `src/dashboard-chart.css`
- Test: `tests/ui-modernization.test.tsx`
- Test: `tests/community-dashboard.test.tsx`

**Interfaces:**
- Consumes: existing `CommunityPieChart` and `PlatformUsersPieChart` markup and SVG segment class names.
- Produces: dark SVG donut/chart surfaces with unchanged accessible names and data values.

- [ ] **Step 1: Strengthen the chart regression test without changing component behavior**

Extend `tests/ui-modernization.test.tsx`:

```tsx
it('keeps platform segments addressable by stable classes', () => {
  const { container } = render(<PlatformUsersPieChart telegram={50} discord={30} whatsapp={20} />);
  expect(container.querySelector('.telegram-segment')).toBeTruthy();
  expect(container.querySelector('.discord-segment')).toBeTruthy();
  expect(container.querySelector('.whatsapp-segment')).toBeTruthy();
});
```

- [ ] **Step 2: Run chart tests**

```bash
npm test -- tests/ui-modernization.test.tsx tests/community-dashboard.test.tsx
```

Expected: PASS before CSS changes; this establishes behavior protection.

- [ ] **Step 3: Replace light chart/card surfaces with tokenized dark surfaces**

Use:

```css
.message-bar-chart {
  border-bottom-color: var(--border);
  background: linear-gradient(to top, rgba(128, 108, 255, .08), transparent 68%);
}

.message-bar {
  background: linear-gradient(180deg, #9f93ff, #806cff);
}

.community-platform-distribution,
.community-overall,
.community-platform-card {
  border-color: var(--border);
  background: linear-gradient(145deg, var(--surface-raised), var(--surface));
  box-shadow: var(--shadow-soft);
}

.community-pie-center,
.community-pie-legend span,
.community-platform-numbers span {
  background: var(--panel-soft);
  border-color: var(--border);
}

.community-donut-track { stroke: #1d2a3d; }
.general-segment { stroke: var(--accent); }
.vip-segment { stroke: var(--warning); }
.telegram-segment { stroke: #229ed9; }
.discord-segment { stroke: #5865f2; }
.whatsapp-segment { stroke: #25d366; }
```

Do not reintroduce a white donut center.

- [ ] **Step 4: Preserve motion reduction**

Keep hover segment/bar transitions subtle and ensure the existing reduced-motion block disables transforms/transitions.

- [ ] **Step 5: Run chart tests again**

```bash
npm test -- tests/ui-modernization.test.tsx tests/community-dashboard.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/dashboard-chart.css tests/ui-modernization.test.tsx
git commit -m "style: refine dark dashboard charts"
```

---

### Task 5: Restyle the global AI admin panel and voice states to match the dark control center

**Files:**
- Modify: `src/admin-agent.css`
- Test: `tests/admin-agent-ui.test.tsx`

**Interfaces:**
- Consumes: existing `AdminAgentPanel` class names and state classes `idle`, `listening`, `thinking`, `executing`.
- Produces: same behavior and permissions with a dark raised panel and clearer voice/assistant state hierarchy.

- [ ] **Step 1: Run existing agent UI tests as the pre-change baseline**

```bash
npm test -- tests/admin-agent-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Replace the remaining light agent surfaces**

Use tokenized styles:

```css
.admin-agent-launcher {
  border-color: rgba(128, 108, 255, .34);
  background: linear-gradient(135deg, var(--accent), #5f7cff);
  box-shadow: 0 18px 44px rgba(77, 60, 190, .30);
}

.admin-agent-panel {
  border-color: var(--border);
  background: var(--surface);
  box-shadow: 0 34px 100px rgba(0, 0, 0, .48);
}

.admin-agent-header {
  background: linear-gradient(135deg, var(--surface-raised), var(--panel-soft));
}

.admin-agent-messages {
  background: linear-gradient(180deg, #0b121e 0%, #09101a 100%);
}

.admin-agent-message {
  background: var(--surface-raised);
  border-color: var(--border);
}

.admin-agent-message.admin {
  background: linear-gradient(135deg, rgba(128, 108, 255, .18), rgba(73, 97, 180, .12));
  border-color: rgba(128, 108, 255, .30);
}
```

- [ ] **Step 3: Keep listening/thinking states semantic and restrained**

Listening remains red because it communicates an active microphone; thinking/executing use the accent. Retain the existing pulse only for these temporary states and keep `animation: none !important` under reduced motion.

- [ ] **Step 4: Darken the confirmation dialog without changing confirmation behavior**

Use `var(--surface-raised)`, `var(--panel-soft)`, and the existing semantic action colors. Do not change button labels, roles, `aria-modal`, confirmation token handling, or tool execution logic.

- [ ] **Step 5: Run agent UI tests**

```bash
npm test -- tests/admin-agent-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/admin-agent.css
git commit -m "style: align ai admin with dark control center"
```

---

### Task 6: Convert knowledge, analytics, review, bulk-action and responsive data-card light surfaces

**Files:**
- Modify: `src/knowledge-analytics-ux.css`
- Modify: `src/advanced-ux.css`
- Modify: `src/styles.css` only if a reusable token/shared primitive is missing
- Test: `tests/dark-control-center.test.ts`

**Interfaces:**
- Consumes: shared dark tokens and current page markup.
- Produces: dark page-specific controls without changing knowledge upload, analytics, review, bulk-action, or responsive table behavior.

- [ ] **Step 1: Add a regression test that catches dominant hard-coded light surfaces in active UX files**

Append:

```ts
it('does not use white backgrounds for active knowledge and advanced UX surfaces', () => {
  const knowledge = source('src/knowledge-analytics-ux.css');
  const advanced = source('src/advanced-ux.css');
  expect(knowledge).not.toMatch(/background:\s*#fff(?:;|\s)/);
  expect(knowledge).not.toMatch(/background:\s*#f8fafc/);
  expect(advanced).not.toMatch(/background:\s*#fff(?:;|\s)/);
  expect(advanced).not.toMatch(/background:\s*#eff6ff/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

```bash
npm test -- tests/dark-control-center.test.ts
```

Expected: FAIL because both files currently contain many white/light surfaces.

- [ ] **Step 3: Tokenize knowledge-upload and readiness surfaces**

Representative replacements:

```css
.file-drop-zone {
  border-color: var(--border-strong);
  background: var(--panel-soft);
  color: var(--text);
}

.file-drop-zone:hover:not(:disabled),
.file-drop-zone.drag-active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.selected-file-card,
.upload-progress-card,
.processing-pipeline,
.knowledge-readiness-strip > div {
  border-color: var(--border);
  background: var(--surface-raised);
}

.analytics-presets {
  border-color: var(--border);
  background: var(--panel-soft);
}

.analytics-presets button.active {
  background: var(--surface-raised);
  color: var(--accent-strong);
}
```

Preserve success/error distinctions using `--success-soft`, `--danger-soft`, and `--warning-soft` instead of pale white/green/red backgrounds.

- [ ] **Step 4: Tokenize advanced UX and mobile data cards**

Representative replacements:

```css
.bulk-toolbar {
  border-color: rgba(128, 108, 255, .28);
  background: var(--accent-soft);
}

.review-nav {
  border-color: var(--border);
  background: var(--surface-raised);
  box-shadow: var(--shadow-soft);
}

@media (max-width: 760px) {
  table.responsive-table tbody tr {
    border-color: var(--border);
    background: var(--surface-raised);
    box-shadow: var(--shadow-soft);
  }

  table.responsive-table tbody tr:hover {
    background: var(--surface-raised);
  }

  table.responsive-table td {
    border-bottom-color: var(--border);
  }

  table.responsive-table .row-link {
    background: var(--accent-soft);
  }
}
```

- [ ] **Step 5: Keep skeletons and progress animations dark and reduced-motion safe**

Use dark skeleton tracks such as `#1a2638` with a low-opacity light shimmer, and retain the existing reduced-motion rule that disables shimmer.

- [ ] **Step 6: Run focused and full UI tests**

```bash
npm test -- tests/dark-control-center.test.ts tests/ui-modernization.test.tsx tests/admin-agent-ui.test.tsx tests/community-dashboard.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/knowledge-analytics-ux.css src/advanced-ux.css src/styles.css tests/dark-control-center.test.ts
git commit -m "style: darken knowledge analytics and responsive ux"
```

---

### Task 7: Final verification, dead-theme cleanup, and regression pass

**Files:**
- Modify only if verification finds issues: `src/styles.css`, `src/app/AppShell.css`, `src/dashboard-chart.css`, `src/admin-agent.css`, `src/knowledge-analytics-ux.css`, `src/advanced-ux.css`, `src/i18n.css`
- Optional delete after confirming no imports/references: `src/admin-theme.css`, `src/modern-ui.css`, `src/ui-overrides.css`, `src/ux-system.css`, `src/mobile-shell.css`, `src/qa-responsive.css`
- Test: all existing tests

**Interfaces:**
- Consumes: completed tasks 1–6.
- Produces: verified dark UI with no functional regressions and no active global theme collision.

- [ ] **Step 1: Search the active stylesheet graph for dominant light surfaces**

Run:

```bash
rg -n "background:\s*(#fff|#ffffff|#f8fafc|#f5f7fb|#eff6ff)|--surface:\s*#fff|color-scheme:\s*light" src --glob '*.css'
```

Expected: no dominant authenticated-admin surface remains light. Explicit white text, semantic contrast values, image/logo handling, and intentionally isolated login styling may remain if visually correct.

- [ ] **Step 2: Confirm removed global override files are not imported anywhere**

```bash
rg -n "admin-theme|modern-ui|ui-overrides|ux-system|mobile-shell|qa-responsive" src
```

Expected: no active imports. If a legacy file has no references and contains no unique required rules, delete it. If it still owns a unique page-specific selector, migrate that selector to its component/page owner before deleting the file.

- [ ] **Step 3: Run the entire test suite**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: PASS with no new warnings/errors introduced by this redesign.

- [ ] **Step 5: Run the production build**

```bash
npm run build
```

Expected: successful TypeScript and Vite build.

- [ ] **Step 6: Manually inspect responsive/RTL states in the browser**

Check these viewport widths:

```text
1440px desktop
1024px tablet/compact desktop
768px tablet/mobile drawer
390px small phone
```

For each, check English and Arabic/RTL. Confirm: sidebar/drawer direction, no clipped tables, KPI wrapping, chart legends, AI admin placement, focus visibility, and no white authenticated-admin card dominating the screen.

- [ ] **Step 7: Verify reduced motion**

Enable the OS/browser reduced-motion preference and confirm: dashboard entrance animation is disabled, chart hover transforms are disabled, agent pulsing is disabled, skeleton shimmer is disabled, and drawer transitions are disabled.

- [ ] **Step 8: Final commit**

```bash
git add src tests
git commit -m "style: complete dark crypto control center redesign"
```
