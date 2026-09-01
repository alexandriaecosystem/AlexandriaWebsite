# Alexandria Premium UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the Alexandria Community Admin into a cohesive premium charcoal-and-gold operations dashboard with stronger hierarchy, cleaner branding, and safer CSS ownership while preserving all existing behavior.

**Architecture:** Keep the existing React component structure and data flows. Treat `src/premium-palette.css` as the final brand layer, narrow the global CSS import chain where safe, and make only minimal markup changes needed for hierarchy hooks. Existing Supabase, routing, voice/AI, RTL, and platform logic remain unchanged.

**Tech Stack:** React 19, TypeScript 5.9, React Router 7, Vite 7, Vitest 3, CSS.

**Spec:** `docs/superpowers/specs/2026-08-29-dark-control-center-ui-design.md`

## Global Constraints

- Preserve all route structure and Supabase/authentication behavior.
- Preserve AI agent action permissions and voice navigation behavior.
- Preserve English/Arabic labels and RTL layout behavior.
- Preserve mobile drawer behavior, keyboard navigation, skip link, and reduced-motion support.
- Keep platform identity colors recognizable only where they communicate Telegram/Discord/WhatsApp identity.
- Do not add a heavy UI framework or new runtime dependency.
- Do not reintroduce dominant white/light authenticated surfaces.

---

### Task 1: Lock the Alexandria Premium branding contract

**Files:**
- Modify: `tests/dark-control-center.test.ts`

**Interfaces:**
- Consumes: existing source-file regression-test helper `source(path: string)`.
- Produces: regression requirements for canonical premium tokens, fewer global theme layers, branded shell hooks, and non-neon palette behavior.

- [ ] **Step 1: Write the failing tests**

Add assertions requiring:

```ts
it('uses Alexandria premium brand tokens and restrained hierarchy', () => {
  const palette = source('src/premium-palette.css');
  expect(palette).toContain('--brand-gold: #d7ae52');
  expect(palette).toContain('--brand-gold-bright: #f0cf7a');
  expect(palette).toContain('--brand-ink: #090b0e');
  expect(palette).toContain('--radius-panel: 20px');
  expect(palette).toContain('--shadow-panel:');
  expect(palette).toContain('.brand-lockup');
  expect(palette).toContain('.page-header::after');
});

it('keeps the global import chain intentionally small', () => {
  const main = source('src/main.tsx');
  const globalCssImports = main.match(/import '\.\/[a-z0-9-]+\.css';/g) ?? [];
  expect(globalCssImports.length).toBeLessThanOrEqual(7);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/dark-control-center.test.ts`

Expected: FAIL because the new premium tokens/hooks are not present yet.

- [ ] **Step 3: Commit the RED test**

```bash
git add tests/dark-control-center.test.ts
git commit -m "test: define Alexandria premium UI contract"
```

---

### Task 2: Consolidate the premium brand system

**Files:**
- Modify: `src/premium-palette.css`
- Modify: `src/styles.css` only if duplicate token ownership blocks the final palette
- Modify: `src/main.tsx` only if a global override import can be safely removed

**Interfaces:**
- Consumes: existing shared classes (`panel`, `metric-card`, `status-pill`, `page-header`, form controls, tables, agent classes).
- Produces: canonical Alexandria brand tokens and shared surface/control styling consumed by all current pages.

- [ ] **Step 1: Implement minimal token layer to satisfy Task 1**

Define brand aliases and shared geometry in `:root`:

```css
--brand-ink: #090b0e;
--brand-gold: #d7ae52;
--brand-gold-bright: #f0cf7a;
--brand-gold-deep: #a77b26;
--radius-control: 10px;
--radius-card: 14px;
--radius-panel: 20px;
--shadow-panel: 0 22px 55px rgba(0, 0, 0, .30);
```

Use those aliases for primary buttons, active navigation, branded highlights, panel borders, and focus states instead of scattering one-off gold values.

- [ ] **Step 2: Add brand hierarchy hooks**

Add styling for:

```css
.brand-lockup { ... }
.page-header { position: relative; }
.page-header::after { ... }
.panel, .table-card { border-radius: var(--radius-panel); }
.metric-card { border-radius: var(--radius-card); }
button, input, textarea, select { border-radius: var(--radius-control); }
```

Keep the effect restrained: no continuous glow, no neon outlines, no decorative animation loops.

- [ ] **Step 3: Run focused test and verify GREEN**

Run: `npm test -- tests/dark-control-center.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/premium-palette.css src/styles.css src/main.tsx
git commit -m "feat: consolidate Alexandria premium brand system"
```

---

### Task 3: Strengthen shell and dashboard information hierarchy

**Files:**
- Modify: `src/app/AppShell.tsx`
- Modify: `src/app/AppShell.css`
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/dashboard-chart.css`
- Test: `tests/dashboard-simplification.test.tsx`
- Test: `tests/dark-control-center.test.ts`

**Interfaces:**
- Consumes: existing navigation arrays, `NavIcon`, `LanguageToggle`, `AdminAgentPanel`, dashboard service data.
- Produces: stronger brand lockup and visual hierarchy without altering navigation targets or dashboard data logic.

- [ ] **Step 1: Add a failing shell/dashboard structure assertion**

Require `AppShell.tsx` to expose `brand-lockup` and the dashboard header to expose `dashboard-hero-copy` without changing route/data behavior.

```ts
expect(source('src/app/AppShell.tsx')).toContain('brand-lockup');
expect(source('src/pages/DashboardPage.tsx')).toContain('dashboard-hero-copy');
```

Run: `npm test -- tests/dark-control-center.test.ts tests/dashboard-simplification.test.tsx`

Expected: FAIL because the hooks do not exist yet.

- [ ] **Step 2: Implement semantic hooks and refined layout**

In `AppShell.tsx`, wrap the desktop/mobile brand identity with `brand-lockup` while preserving logo text and controls. In `DashboardPage.tsx`, add `dashboard-hero-copy` to the existing header copy container only.

In CSS:
- strengthen the logo/title/subtitle relationship,
- reduce sidebar visual noise,
- make active navigation unmistakable but restrained,
- improve content max-width and vertical rhythm,
- give the three dashboard metrics distinct but related hierarchy,
- improve platform-chart container depth and legend legibility,
- keep attention items visually secondary to headline metrics.

- [ ] **Step 3: Run focused tests and verify GREEN**

Run: `npm test -- tests/dark-control-center.test.ts tests/dashboard-simplification.test.tsx`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/AppShell.tsx src/app/AppShell.css src/pages/DashboardPage.tsx src/dashboard-chart.css tests/dark-control-center.test.ts
git commit -m "feat: refine Alexandria shell and dashboard hierarchy"
```

---

### Task 4: Polish shared UX states without behavior changes

**Files:**
- Modify: `src/premium-palette.css`
- Modify: page/component CSS only where an active rule conflicts with the premium tokens
- Test: `tests/dark-control-center.test.ts`
- Test: `tests/ui-modernization.test.tsx`

**Interfaces:**
- Consumes: current shared classes for tables, forms, upload zones, conversations, analytics, AI agent, sleep mode, token monitor, and document editor.
- Produces: consistent hover/focus/empty/loading/status treatment across existing screens.

- [ ] **Step 1: Add failing cross-screen style assertions**

Require the premium layer to contain clear rules for `.table-card`, `.status-pill`, `.admin-agent`, `.file-drop-zone`, `.conversation-stream`, and `@media (prefers-reduced-motion: reduce)`.

Run: `npm test -- tests/dark-control-center.test.ts tests/ui-modernization.test.tsx`

Expected: FAIL only for any missing contract hooks.

- [ ] **Step 2: Implement restrained shared polish**

Ensure:
- tables use stronger header/row separation without excessive borders,
- focus-visible states are obvious,
- semantic status colors remain distinguishable from brand gold,
- empty/loading surfaces use raised charcoal rather than white,
- AI assistant matches the app shell,
- upload/analytics/conversation states share radius/elevation tokens,
- hover movement stays within 1–2 px,
- `prefers-reduced-motion` removes nonessential transitions.

- [ ] **Step 3: Run focused tests and verify GREEN**

Run: `npm test -- tests/dark-control-center.test.ts tests/ui-modernization.test.tsx`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src tests/dark-control-center.test.ts tests/ui-modernization.test.tsx
git commit -m "feat: polish shared Alexandria admin UX"
```

---

### Task 5: Final verification

**Files:**
- No production changes unless verification exposes a regression.

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: verified implementation ready for review.

- [ ] **Step 1: Run full tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: exit 0 and Vite build completes.

- [ ] **Step 4: Inspect for branding regressions**

Run:

```bash
grep -RInE "background:\s*(#fff|white|#f8fafc)|#806cff|#50d9c1" src --include='*.css'
```

Expected: no dominant authenticated white surfaces or legacy purple/cyan theme values in the final brand layer; any intentional white document-paper surfaces remain explicitly scoped.

- [ ] **Step 5: Commit any verification-only fixes, then prepare branch for review**

```bash
git status --short
git log --oneline --decorate -5
```
