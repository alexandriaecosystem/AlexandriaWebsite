# Dark Control Center UI Redesign

Date: 2026-08-29
Status: Approved direction, awaiting implementation plan

## Goal

Redesign the Alexandria Community Admin frontend into a cohesive dark crypto control center while preserving all existing product functionality, routes, Supabase behavior, bilingual English/Arabic support, RTL behavior, and mobile usability.

The redesign should reduce the current styling conflicts caused by multiple global CSS layers that repeatedly redefine the same tokens and component classes.

## Visual Direction

Use a premium dark admin aesthetic suited to a crypto operations dashboard:

- Deep navy/charcoal application background instead of white content surfaces.
- Elevated dark panels with subtle borders and controlled depth.
- Purple-blue as the primary action/accent family.
- Cyan/teal as a secondary operational accent.
- Platform-specific colors for Telegram, Discord, WhatsApp, and other channels only where they communicate platform identity.
- Status colors remain semantic: green for healthy/success, amber for warning/pending, red for error/danger.
- Avoid excessive neon, gradients, glass effects, and glowing borders. Use them only as hierarchy cues.

## Design System

### Color tokens

Consolidate the shared visual system around one canonical token layer:

- `--bg`: near-black navy application background.
- `--surface`: dark panel surface.
- `--surface-raised`: slightly brighter elevated surface.
- `--panel-soft`: subtle inset/secondary panel background.
- `--border`: low-contrast slate border.
- `--border-strong`: stronger focus/separation border.
- `--text`: high-contrast off-white.
- `--muted`: desaturated slate.
- `--accent`: purple-blue.
- `--accent-strong`: brighter accessible accent.
- `--accent-soft`: translucent purple-blue tint.
- `--secondary-accent`: cyan/teal.
- semantic success/warning/danger tokens.

All page-level CSS should consume these tokens instead of redefining local white/light palettes.

### Typography

Keep the current DM Sans / Manrope direction unless the implementation reveals a loading or performance issue.

- Manrope for high-value headings and dashboard numbers.
- DM Sans for navigation, labels, tables, forms, and body content.
- Tight heading letter spacing, compact dashboard labels, and stronger size contrast between metrics and metadata.

### Radius and elevation

Use a small consistent set:

- small radius for controls and chips.
- medium radius for filters and secondary containers.
- large radius for primary panels/cards.
- one soft default shadow and one stronger interactive/elevated shadow.

Avoid unique radius/shadow values on every page.

## App Shell

### Sidebar

- Persistent dark sidebar on desktop.
- Slightly brighter than the global background for separation.
- Active item uses a tinted purple-blue surface, left/right accent rail depending on LTR/RTL, and a brighter icon.
- Hover motion is subtle and does not move the sidebar width.
- Section labels stay understated.
- Brand area receives a stronger premium identity through the existing Alexandria logo and a restrained accent glow.

### Main content

- Dark radial/linear ambient background behind content.
- Main content max width remains optimized for large admin screens.
- Better vertical rhythm between page header, metrics, primary panels, and tables.
- Page headers should feel consistent across Dashboard, Users, Messages, Reviews, Community, Knowledge, Announcements, Analytics, Token Monitor, and Account pages.

### Mobile

- Keep the existing mobile top bar and drawer behavior.
- Maintain escape-to-close, focus behavior, and body scroll locking.
- Mobile surfaces use the same dark visual hierarchy rather than falling back to white cards.

## Dashboard

The dashboard should become the visual anchor for the new system.

### Metrics

- Dark metric cards with a restrained gradient edge or top accent.
- Strong numeric hierarchy.
- Small semantic/status indicators.
- Hover elevation only on clickable cards.
- Prevent every card from looking equally important.

### Community distribution

- Keep the existing SVG donut architecture.
- Improve dark-mode track, legend, center label, and platform colors.
- Make the chart readable without using a white center circle.
- Add hover emphasis that respects reduced-motion settings.

### Charts

- Dark chart canvas.
- Softer grid/track elements.
- Purple-blue primary data visualization, with secondary cyan/teal accents where multiple series are required.
- Tooltip surfaces should match the new raised dark surface.

### Attention and quick-action areas

- Use softer inset surfaces.
- Improve information grouping and clickable affordances.
- Reduce unnecessary borders by relying on contrast between nested surfaces.

## Tables and Data-Dense Screens

For Users, Messages, Reviews, Community, Knowledge, Analytics, and Token activity:

- Dark table container with a slightly distinct header row.
- Row hover should be visible but restrained.
- Sticky headers may be used where already compatible with scrolling behavior.
- Improve alignment and whitespace for scanability.
- Keep status chips compact and semantic.
- Long values must truncate or wrap intentionally instead of forcing layout overflow.
- Horizontal scrolling remains available on narrow screens.

## Forms and Inputs

- Dark input surfaces with clear borders.
- Focus ring uses accessible purple-blue accent.
- Placeholder text must remain legible without competing with actual values.
- Primary buttons use the main accent gradient/solid fill.
- Secondary buttons stay dark and outlined.
- Destructive controls remain red and visually separated.
- Disabled controls have lower contrast but remain readable.

## AI Admin Agent

The global Admin Agent should visually belong to the same design system:

- Dark raised panel.
- Clear distinction between assistant/system/user messages.
- Voice control receives a visible but not distracting active/listening state.
- Floating trigger should have a restrained glow and strong focus state.
- No change to agent action permissions or backend behavior as part of this redesign.

## Motion

Use motion to improve feedback, not decorate every surface.

- Page sections: light fade/translate entrance on initial render where practical.
- Cards: 1–2 px hover lift.
- Navigation: background/icon transition.
- Buttons: quick hover/press response.
- Charts: subtle segment/bar transition.
- Drawer/agent panel: smooth opacity/translate transitions.
- Respect `prefers-reduced-motion: reduce` globally.

Avoid looping animations, large parallax effects, or continuous neon pulses.

## CSS Architecture

The current entrypoint imports many overlapping global CSS files. The implementation should simplify ownership instead of adding another override file.

Target structure:

1. `styles.css` remains the canonical foundational layer for reset, core tokens, typography, and shared primitives.
2. `AppShell.css` owns shell/sidebar/mobile navigation layout only.
3. Component/page-specific CSS files own only their corresponding component/page rules.
4. Existing broad override files (`admin-theme.css`, `modern-ui.css`, `ui-overrides.css`, `ux-system.css`, `advanced-ux.css`, `qa-responsive.css`, and similar) should be consolidated, narrowed, or removed from the global import chain where safe.
5. Shared token definitions must not be repeated across multiple global stylesheets.

The implementation should prioritize safe consolidation over a risky one-shot deletion of every legacy stylesheet.

## Accessibility

- Maintain keyboard navigation and visible focus indicators.
- Preserve the existing skip link.
- Maintain semantic status distinctions that do not rely on color alone.
- Ensure dark-theme text/background contrast remains accessible.
- Preserve English/Arabic labels and RTL layout behavior.
- Respect reduced motion.

## Functional Constraints

The redesign must not change:

- Route structure.
- Supabase schema or authentication behavior.
- Admin permissions.
- AI agent action permissions.
- Announcement posting behavior.
- Community qualification/review logic.
- Token monitor backend behavior.
- Data fetching and mutation semantics.

## Implementation Scope

Primary files expected to change:

- `src/main.tsx`
- `src/styles.css`
- `src/app/AppShell.css`
- shared UI/UX styles currently loaded globally
- dashboard/chart CSS
- admin agent CSS
- selected page/component CSS files when legacy light colors are hard-coded

React component changes should be minimal and limited to cases where better hierarchy, accessibility, or animation hooks require markup changes.

## Testing and Verification

Before completion:

- `npm run build`
- `npm run lint`
- `npm test`
- inspect for remaining hard-coded light surfaces in active pages
- confirm desktop, tablet, and mobile layout behavior
- confirm English and Arabic/RTL visual behavior
- confirm reduced-motion fallback
- confirm primary dashboard charts and community distribution remain functional
- confirm agent trigger/panel remains available from all admin pages

## Success Criteria

The redesign is successful when:

1. The app reads immediately as a premium dark crypto operations dashboard.
2. White/light page surfaces no longer dominate the authenticated admin experience.
3. Navigation, cards, tables, forms, charts, and the AI agent share one coherent token system.
4. Visual hierarchy is stronger without making the UI noisy.
5. Animations improve interaction feedback and remain subtle.
6. Existing application behavior remains unchanged.
7. English, Arabic/RTL, mobile, keyboard accessibility, and reduced motion continue to work.
8. The global CSS import chain is materially simpler and has fewer conflicting theme definitions.
