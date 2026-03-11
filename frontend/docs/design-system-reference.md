# JSK Frontend Design System Reference

## Latest Update
- Updated: 2026-02-16
- Added HR-IMS inspired sidebar visual alignment for admin and live-chat surfaces (background gradient and active menu gradient treatment).

## Source
- Primary visual references: `examples/templates` (105 screenshots)
- Primary categories: dashboards, apps, pages, forms, components, wizard, front, tables, charts, extensions

## Visual Direction
- Dense enterprise layout with soft cards and clear hierarchy
- Blue-indigo gradient accent for selected sidebar navigation (HR-IMS alignment)
- Light-first design with compatible dark token overrides
- Rounded geometry (`xl` and `2xl`) for surfaces and controls

## Foundation Tokens
- Colors: use semantic tokens in `frontend/app/globals.css`
- Surface model: `--color-bg`, `--color-surface`, `--color-border-*`
- State model: success, warning, danger, info + text-safe variants (`*-text`)
- Shadow model: `--shadow-sm` to `--shadow-xl`, reserve glow shadows for key CTAs

## Layout Patterns
- Sidebar: deep slate-to-indigo gradient background (`from-slate-900 via-[#1e1b4b] to-[#172554]`)
- Sidebar active item: horizontal blue-indigo gradient (`from-blue-600 to-indigo-600`) with elevated shadow
- Sidebar state behavior:
  - Active/hover backgrounds must be full-row, never content-width
  - Expanded mode: render direct full-width nav links
  - Collapsed mode: tooltip-enabled icon rows
- Header: glass/blur top bar with search and utility actions
- Content: card grid with 16-24px gap rhythm
- KPI row: compact metrics cards preceding detailed charts/tables

## Scrollbar Standards
- Use utility classes from `frontend/app/globals.css`:
  - `scrollbar-sidebar`: dark sidebar navigation areas
  - `dark-scrollbar`: dark containers and panels
  - `chat-scrollbar`: live-chat message/conversation surfaces
  - `scrollbar-thin`: light/default scroll areas
  - `no-scrollbar`: when scrollbar must be visually hidden
- Requirements:
  - No top/bottom arrow buttons
  - Transparent tracks
  - Rounded thumbs with subtle hover transition
  - Theme-matched thumb contrast
- Global enforcement:
  - `frontend/app/globals.css` includes base-level `::-webkit-scrollbar-button` suppression so arrow buttons are removed app-wide (Chrome/Edge/Safari).

## Component Rules
- Buttons: gradient primary, neutral secondary, text-only ghost
- Inputs: outline as default, clear focus ring, contextual error/success states
- Badges: map to status language (waiting, active, closed, urgent, bot)
- Cards: default surface + elevated variant for high-priority modules

## Usage
- Live preview page: `/admin/design-system`
- Build new admin pages from existing `components/ui` primitives first
- Prefer token usage over hard-coded hex values
