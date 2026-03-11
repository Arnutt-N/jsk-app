# Design System Scope Boundaries

Updated: 2026-02-16

## 1. Purpose

This document defines what is intentionally in-scope and out-of-scope for the admin UI design system migration so future work does not regress stable architecture.

## 2. In Scope

- UI component additions in `frontend/components/ui`.
- Token additions/aliases in `frontend/app/globals.css`.
- Live chat micro-pattern polish (bubble shape, status dots, toast behavior, vibration).
- Documentation for component usage and parity tracking.

## 3. Out of Scope

- Backend API behavior, WebSocket protocol, session orchestration.
- Zustand store architecture changes.
- Full component library replacement with shadcn generator output.
- Tailwind v3 plugin migrations for animation utilities.

## 4. Never-Touch List (Unless Explicitly Planned)

- `frontend/components/ui/Button.tsx`
- `frontend/components/ui/Card.tsx`
- `frontend/components/ui/Badge.tsx`
- `frontend/components/ui/Toast.tsx`
- `frontend/components/ui/Modal.tsx`
- `frontend/components/ui/ModalAlert.tsx`
- `frontend/app/admin/layout.tsx` (sidebar architecture contract; visual theming updates allowed when explicitly planned)

Reason: these components are high-usage and already richer than baseline example equivalents.

## 5. Additive-First Rule

- Prefer adding missing primitives over replacing established ones.
- Do not introduce breaking import path changes.
- Export new primitives through `frontend/components/ui/index.ts`.

## 6. Validation Gate

Each migration phase must pass:

- Targeted lint for touched files.
- Type check (allowing known pre-existing blockers to be tracked separately).
- Build verification (or explicit blocker documentation).

Rollback trigger:

- Any regression in high-usage components (`Button`, `Card`, `Badge`, `Modal`, `Toast`) or `/admin/live-chat` core flow.

## 7. Live Chat Boundaries

- Allowed: visual and interaction micro-pattern improvements.
- Not allowed: message routing logic changes, protocol/event contract changes, or auth/session model changes.

## 8. Ownership Notes

- `frontend/components/ui/*` is design-system owned surface.
- `frontend/app/admin/live-chat/_components/*` can consume design-system primitives and shared utility classes, but business behavior remains feature-team owned.

## 9. Intentional Visual Alignment

- Sidebar theming for `admin` and `live-chat` now intentionally aligns with HR-IMS visual language:
  - Background gradient: `from-slate-900 via-[#1e1b4b] to-[#172554]`
  - Active menu gradient: `from-blue-600 to-indigo-600`
- This is a visual decision only and does not change navigation architecture or feature behavior.
