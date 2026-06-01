---
name: JskApp
description: Community Justice Services LINE OA with LIFF integration
colors:
  primary: "#3b82f6"
  primary-dark: "#1e40af"
  accent: "#14b8a6"
  success: "#22c55e"
  warning: "#f59e0b"
  danger: "#ef4444"
  info: "#3b82f6"
  bg: "#f8fafc"
  surface: "#ffffff"
  text-primary: "#0f172a"
  text-secondary: "#475569"
  text-tertiary: "#94a3b8"
  border-subtle: "#f1f5f9"
  border-default: "#e2e8f0"
typography:
  display:
    fontFamily: '"Outfit", "Noto Sans Thai", system-ui, sans-serif'
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: '"Noto Sans Thai", "Inter", system-ui, sans-serif'
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: '"Noto Sans Thai", "Inter", system-ui, sans-serif'
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  input:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border-default}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

## Overview

JskApp is a LINE Official Account system for Community Justice Services. The design system spans two registers: a **brand** surface (landing page, login) and a **product** surface (admin dashboard, LIFF forms, live chat). Both share a Navy Blue primary palette with semantic status colors, a Thai-first typographic system, and a commitment to clarity over decoration.

## Colors

### Brand Palette

| Token | Value | Usage |
|-------|-------|-------|
| Brand 50 | `hsl(214 100% 97%)` | Lightest tint, hover backgrounds |
| Brand 100 | `hsl(214 95% 93%)` | Subtle highlights |
| Brand 200 | `hsl(213 97% 87%)` | Soft backgrounds |
| Brand 300 | `hsl(212 96% 78%)` | Disabled states |
| Brand 400 | `hsl(213 94% 68%)` | Dark mode primary |
| Brand 500 | `hsl(217 91% 60%)` | **Primary action, links** |
| Brand 600 | `hsl(221 83% 53%)` | Active states |
| Brand 700 | `hsl(224 76% 48%)` | **Hover, emphasis, WCAG text** |
| Brand 800 | `hsl(226 71% 40%)` | Deep emphasis |
| Brand 900 | `hsl(224 64% 33%)` | Darkest brand |

### Semantic Colors

| Token | Value | Usage |
|-------|-------|-------|
| Success | `hsl(142 71% 45%)` | Completed, approved, positive |
| Warning | `hsl(38 92% 50%)` | Pending, caution, attention |
| Danger | `hsl(0 84% 60%)` | Errors, destructive, rejected |
| Info | `hsl(217 91% 60%)` | Informational, neutral actions |
| Accent | `hsl(162 72% 45%)` | Teal secondary, highlights |

### WCAG Text Colors (on white)

| Token | Value | Contrast |
|-------|-------|----------|
| Brand text | `hsl(224 76% 48%)` | ~5.8:1 |
| Success text | `hsl(142 64% 37%)` | ~4.6:1 |
| Warning text | `hsl(32 95% 44%)` | ~4.5:1 |
| Danger text | `hsl(0 72% 51%)` | ~5.6:1 |
| Info text | `hsl(224 76% 48%)` | ~5.2:1 |

### Neutral Scale

| Token | Light | Dark |
|-------|-------|------|
| Background | `hsl(210 40% 98%)` | `hsl(222 47% 11%)` |
| Surface | `hsl(0 0% 100%)` | `hsl(217 33% 17%)` |
| Text primary | `hsl(221 39% 11%)` | `hsl(210 20% 98%)` |
| Text secondary | `hsl(215 14% 34%)` | `hsl(215 14% 70%)` |
| Text tertiary | `hsl(218 11% 65%)` | `hsl(218 11% 45%)` |
| Border subtle | `hsl(210 40% 96%)` | `hsl(217 33% 22%)` |
| Border default | `hsl(214 32% 91%)` | `hsl(217 33% 25%)` |

## Typography

### Font Stack

| Role | Family | Weights |
|------|--------|---------|
| Display / Heading | Outfit + Noto Sans Thai | 500, 700, 900 |
| Body / UI | Noto Sans Thai + Inter | 400, 500, 700 |
| Mono | ui-monospace, SFMono-Regular | 400 |

### Fluid Scale

| Token | Min | Max |
|-------|-----|-----|
| text-xs | 0.6875rem | 0.75rem |
| text-sm | 0.8125rem | 0.875rem |
| text-base | 1rem | 1.0625rem |
| text-lg | 1rem | 1.125rem |
| text-xl | 1.125rem | 1.25rem |
| text-2xl | 1.25rem | 1.5rem |
| text-3xl | 1.5rem | 1.875rem |

### Rules

- Display headings: tight line-height (1.2), letter-spacing ≥ -0.04em
- Body text: relaxed line-height (1.6), max line length 65–75ch
- Labels / buttons: medium weight (500), line-height 1.4
- Thai text: use `word-break: break-word` and `overflow-wrap: anywhere` for long compound words

## Spacing

| Token | Value |
|-------|-------|
| xs | 4px |
| sm | 8px |
| md | 16px |
| lg | 24px |
| xl | 32px |
| 2xl | 48px |

## Elevation

- Flat by default; shadows are semantic, not decorative
- Cards: `shadow-sm` for subtle depth
- Modals / dialogs: `shadow-lg` with `backdrop-blur`
- Dropdowns / popovers: `shadow-md`
- No arbitrary z-index values; use semantic scale:
  - dropdown → sticky → modal-backdrop → modal → toast → tooltip

## Components

### Buttons

| Variant | Background | Text | Border |
|---------|------------|------|--------|
| Primary | Brand 500 | White | None |
| Secondary | Transparent | Brand 700 | Brand 200 |
| Ghost | Transparent | Brand 700 | None |
| Danger | Danger | White | None |
| Soft | Brand 50 | Brand 700 | None |

All buttons use `rounded-md` (8px) and support loading states with spinner.

### Cards

| Variant | Background | Border | Shadow |
|---------|------------|--------|--------|
| Default | Surface | Border subtle | None |
| Elevated | Surface | Border subtle | Shadow sm |
| Glass | Surface/80 | Border subtle | None + backdrop-blur |
| Outlined | Transparent | Border default | None |

Cards use `rounded-lg` (12px). Nested cards are prohibited.

### Forms

- Inputs: `rounded-md`, border-default, focus ring with Brand 500
- Selects: same as inputs with chevron icon
- Checkboxes / radios: Brand 500 active state
- Validation: Danger border for errors, Success border for valid
- Labels: medium weight, text-secondary

### Badges

| Variant | Background | Text |
|---------|------------|------|
| Success | Success/10 | Success-text |
| Warning | Warning/10 | Warning-text |
| Danger | Danger/10 | Danger-text |
| Info | Info/10 | Info-text |
| Brand | Brand/10 | Brand-text |

Pill shape (`rounded-full`), icon + text pattern.

### Navigation

- Sidebar: dark gradient background, collapsible (64px / 20px widths), gradient logo mark
- Navbar: glassmorphism (blur + semi-transparent), contains command palette, theme toggle, language toggle, notification bell
- Breadcrumbs: text-secondary with chevron separators

### Status Indicators

- Use color + shape + text together (never color alone)
- Dot indicators: 8px circle with pulse animation for "live" states
- Toast notifications: slide-in from bottom-right, auto-dismiss after 4s

## Motion

### Principles

- Motion guides attention and confirms actions
- All animations respect `prefers-reduced-motion: reduce`
- Default easing: `ease-out-quart` (cubic-bezier(0.25, 1, 0.5, 1))
- Typical duration: 200ms for micro-interactions, 300ms for layout shifts

### Patterns

- Page transitions: fade + slight translateY (Motion `AnimatePresence`)
- Stagger lists: 50ms delay between items
- Loading skeletons: shimmer animation, never block entire page
- Modal enter: scale(0.95) → scale(1) + opacity
- Toast enter: translateX(100%) → translateX(0)

## Responsive Breakpoints

| Name | Width | Primary use |
|------|-------|-------------|
| sm | 640px | Minor adjustments |
| md | 768px | Tablet, sidebar collapses |
| lg | 1024px | Desktop, full sidebar |
| xl | 1280px | Wide desktop |
| 2xl | 1536px | Ultra-wide |

## Dark Mode

Fully implemented via `.dark` class. Key mappings:
- Background → `hsl(222 47% 11%)`
- Surface → `hsl(217 33% 17%)`
- Primary → Brand 400 (lighter for contrast)
- Primary Dark → Brand 500
- Text primary → `hsl(210 20% 98%)`

## Do's and Don'ts

### Do
- Use semantic tokens (`text-primary`, `bg-surface`) not raw values
- Maintain 4.5:1 contrast for body text; 3:1 for large text
- Use system font stack for performance; load Outfit/Noto Sans Thai via `next/font`
- Support dark mode with `dark:` variants
- Use consistent spacing scale
- Provide `prefers-reduced-motion` fallbacks

### Don't
- Use Brand 500 for text on white backgrounds (fails WCAG)
- Mix font families arbitrarily (stick to the defined stacks)
- Use decorative shadows excessively
- Ignore mobile responsiveness (LINE users are mobile-first)
- Hardcode colors in components (use CSS variables / Tailwind tokens)
- Use gradient text or side-stripe borders as accents
- Add tiny uppercase eyebrows above every section

## Asset Gaps

- No favicon.ico or icon.svg in app/ or public/
- No PNG/SVG logo file in public/
- Brand mark is currently CSS-generated (gradient box + text)
