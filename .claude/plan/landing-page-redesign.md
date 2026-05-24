# Implementation Plan: Landing Page Redesign to Match Example

## Task Type
- [x] Frontend (primary)
- [ ] Backend
- [ ] Fullstack

---

## Overview

Redesign the JSK Platform landing page (`frontend/app/page.tsx` and `frontend/components/landing/*`) to match the visual design in `examples/ai-studio-redesign-landing-page/src/App.tsx`, while **retaining** the existing i18n (TH/EN) and dark mode toggle features.

### Key Architectural Decisions

1. **Keep Next.js modular structure** — Split the monolithic example App.tsx into proper Next.js components
2. **KEEP i18n TH/EN** — All hardcoded Thai text in the example will be converted to `t(locale, key)` calls; new translation keys added to `lib/i18n/landing.ts`
3. **KEEP Dark Mode toggle** — All new components will include `dark:` Tailwind variants for dark mode parity
4. **Add `motion` library** — Framer Motion for animations (parallax, entrance, hover effects)
5. **Use Google Noto Sans Thai** — Keep as primary body font; add **Outfit** as heading font (`--font-heading`)
6. **Preserve internal routing** — Keep Next.js `Link` for `/login`, `/admin`, `/liff/service-request`

---

## Technical Solution

### Design System Changes

| Aspect | Example | Current | Action |
|--------|---------|---------|--------|
| Background | `#FAFAFA` + animated blur orbs + noise | Radial gradient + grid overlay | Replace with example's approach + dark variant |
| Navbar | Floating pill, scroll-aware glassmorphism | Sticky bar with landing-nav-shell | Rewrite + keep theme/language toggles |
| Hero | Centered text + dashboard mockup below | 2-col: left text + right dark panel | Rewrite to centered layout |
| Stats | Minimalist 4-col with dividers | 2-col with AnimatedCounter | Replace with example's section |
| Features | Bento grid (4 cards) | Capabilities list | New component |
| LINE Section | Green bg box, split layout, chat cards | Surface card, numbered list | Rewrite |
| CTA | None in example | Dark box with brand mark | Remove |
| Footer | White bg, 5-col grid | Dark bg, 4-col grid | Rewrite (light bg + dark variant) |
| Fonts | Outfit + Inter + Noto Sans Thai | Noto Sans Thai + Inter | Add Outfit via `@import` for headings |
| Animations | motion/react | CSS keyframes | Add motion library |
| Colors | Navy blue (#1E3A8A) + LINE green | Brand purple + LINE green | Shift to navy for landing |
| Dark Mode | None | Full support | **KEEP** — add dark: variants to new design |
| i18n | None (Thai hardcoded) | TH/EN toggle | **KEEP** — add new translation keys |

### Color Palette

**Light mode** (matches example):
- Primary navy: `blue-900` (#1E3A8A)
- Medium blue: `blue-500` (#3B82F6), `blue-600` (#2563EB)
- Deep blue: `blue-950` (#172554)
- LINE green: `#00B900`, `#00C900`
- Background: `#FAFAFA`
- Text: slate-900, slate-700, slate-600, slate-500

**Dark mode** (new — derived from existing dark patterns):
- Background: `slate-950` / `slate-900`
- Surfaces: `slate-900/80` with `border-white/10`
- Text: `white`, `white/80`, `white/60`, `white/40`
- Navy accents: `blue-400`, `blue-300` (lighter for contrast on dark)
- LINE green: keep `#00B900` (works on both backgrounds)

### Font Stack
```css
--font-sans: var(--font-noto-thai), "Inter", ui-sans-serif, system-ui, sans-serif;
--font-heading: "Outfit", "Noto Sans Thai", ui-sans-serif, system-ui, sans-serif;
```

---

## Implementation Steps

### Step 1: Install `motion` dependency
- **File**: `frontend/package.json`
- **Command**: `cd frontend && npm install motion`
- **Expected**: `motion` package available for `import { motion, useScroll, useTransform } from 'motion/react'`

### Step 2: Update `globals.css` — Add Outfit font + update landing styles
- **File**: `frontend/app/globals.css`
- **Operations**:
  1. Add Outfit font import at top: `@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap');`
  2. Add to `@theme` block: `--font-heading: "Outfit", "Noto Sans Thai", ui-sans-serif, system-ui, sans-serif;`
  3. Keep existing `--font-sans` with Noto Sans Thai
  4. **Update** `.landing-page` class to use new background: `bg-[#FAFAFA]` light / `bg-slate-950` dark
  5. **Remove** old `.landing-surface`, `.landing-nav-shell`, `.landing-hero-panel`, `.landing-grid-overlay` (replaced by inline Tailwind)
  6. **Keep** `.line-accent`, `.line-chip`, `.navy-chip` (may still be useful) or remove if not referenced
  7. Keep all admin/non-landing styles untouched

### Step 3: Update i18n translations — Add new keys
- **File**: `frontend/lib/i18n/landing.ts`
- **Operations**:
  1. Add new translation keys for all hardcoded Thai text in example:
     - `hero_badge_new`: "แพลตฟอร์มยุติธรรมชุมชน 4.0" / "Community Justice Platform 4.0"
     - `hero_title_line1`: "ยกระดับการจัดการ" / "Elevate Management of"
     - `hero_title_line2`: "LINE Official Account"
     - `hero_subtitle_new`: "รวมทุกเครื่องมือที่คุณต้องการ..." / "All the tools you need..."
     - `hero_cta_start`: "เริ่มต้นใช้งานฟรี" / "Get Started Free"
     - `hero_cta_demo`: "ดูตัวอย่างระบบ" / "View Demo"
     - Stats keys: `stat_24_7`, `stat_uptime`, `stat_response`, `stat_users`
     - Feature keys: chatbot title/desc, livechat title/desc, analytics title/desc, service-request title/desc
     - LINE section keys: badge, title, description, button texts
     - Footer keys: about links, service links, contact info
     - Nav keys: `nav_features`, `nav_stats`, `nav_integration`, `nav_dashboard`
  2. Keep existing keys that are still used
  3. Remove keys no longer referenced after redesign

### Step 4: Rewrite `page.tsx` — New page structure with i18n + dark mode
- **File**: `frontend/app/page.tsx`
- **Operations**:
  1. **KEEP** i18n state (`locale`, `setLocale`, `toggleLocale`, `useEffect` for localStorage)
  2. **KEEP** `'use client'` directive
  3. Add `useScroll`, `useTransform` from `motion/react` for parallax background
  4. Remove: capabilities section, CTA section, overview section
  5. New structure:
     ```tsx
     <div className="min-h-screen bg-[#FAFAFA] dark:bg-slate-950 font-sans text-slate-900 dark:text-white overflow-x-hidden">
       {/* Fixed Background — blur orbs + noise */}
       <div className="fixed inset-0 z-0 pointer-events-none">
         <motion.div style={{ y: y1 }} className="... bg-blue-900/10 dark:bg-blue-400/10 blur-[120px]" />
         <motion.div style={{ y: y2 }} className="... bg-blue-400/10 dark:bg-blue-900/15 blur-[120px]" />
       </div>

       <LandingNavbar locale={locale} onToggleLocale={toggleLocale} />
       <LandingHero locale={locale} />
       <LandingStats locale={locale} />
       <LandingFeatures locale={locale} />
       <LandingLineSection locale={locale} />
       <LandingFooter locale={locale} />
     </div>
     ```

### Step 5: Rewrite `LandingNavbar.tsx` — Floating pill + keep toggles
- **File**: `frontend/components/landing/LandingNavbar.tsx`
- **Props**: `{ locale, onToggleLocale }` (same as current)
- **Operations**:
  1. **KEEP**: `useTheme` for dark mode toggle, `LandingLanguageToggle`, theme/language buttons
  2. Add: `motion` import, `useState`+`useEffect` for scroll detection (`isScrolled`)
  3. New visual structure:
     - `motion.nav` with `initial={{ y: -100 }} animate={{ y: 0 }}`
     - Pill container: `bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl` when scrolled
     - Logo: 40x40 gradient circle + "JSK Platform"
     - Desktop nav: glassmorphic pill with links (ฟีเจอร์, สถิติ, การเชื่อมต่อ) — use `t(locale, key)`
     - Desktop right: theme toggle + language toggle + "เข้าสู่ระบบ" + "แดชบอร์ด" button
     - Mobile: hamburger + dropdown (keep Sheet from Radix, or switch to motion dropdown)
  4. Dark variants: `dark:bg-slate-900/80`, `dark:border-white/10`, `dark:text-white`

### Step 6: Rewrite `LandingHero.tsx` — Centered hero + dashboard mockup
- **File**: `frontend/components/landing/LandingHero.tsx`
- **Props**: `{ locale }`
- **Operations**:
  1. Centered layout with `motion` stagger animations
  2. **Badge**: glassmorphic pill + Sparkles icon + `t(locale, 'hero_badge_new')` gradient text
  3. **H1**: `font-heading text-5xl md:text-7xl lg:text-8xl font-black`
     - `t(locale, 'hero_title_line1')` + LINE green `t(locale, 'hero_title_line2')` with underline blur
  4. **Subtitle**: `t(locale, 'hero_subtitle_new')`
  5. **CTA**: Primary navy button + secondary glassmorphic button — text from `t(locale, ...)`
  6. **Dashboard mockup** (below CTAs):
     - Glassmorphic card (`bg-white/30 dark:bg-white/5 backdrop-blur-3xl`)
     - Traffic lights header
     - 4 stat cards: `motion.div whileHover={{ y: -5, scale: 1.02 }}`
     - Bar chart: 9 animated bars with gradient
     - Donut chart: animated SVG circle
  7. Dark variants for all mockup elements

### Step 7: Create `LandingStats.tsx` — Minimalist stats
- **File**: `frontend/components/landing/LandingStats.tsx` (NEW)
- **Props**: `{ locale }`
- **Operations**:
  1. `py-16 border-y border-slate-200/60 dark:border-white/10 bg-white dark:bg-slate-900/50`
  2. 4-column grid with vertical dividers
  3. Stats: "24/7", "99.9%", "10x", "100k+" — labels from `t(locale, ...)`
  4. `font-heading text-4xl md:text-5xl font-black` + hover:text-blue-900 dark:hover:text-blue-400
  5. Dividers: `w-px h-12 bg-slate-200 dark:bg-white/10`

### Step 8: Create `LandingFeatures.tsx` — Bento grid
- **File**: `frontend/components/landing/LandingFeatures.tsx` (NEW)
- **Props**: `{ locale }`
- **Operations**:
  1. Section header with badge + heading (gradient text) + subtitle — all `t(locale, ...)`
  2. Bento grid: `grid-cols-1 md:grid-cols-3 auto-rows-[minmax(320px,auto)]`
  3. 4 feature cards with `motion.div whileHover={{ y: -8, scale: 1.01 }}`
  4. Card styling: `bg-white dark:bg-slate-900 border-slate-200/60 dark:border-white/10 rounded-[2.5rem]`
  5. Card 1 (col-span-2): Chatbot — blue gradient icon + 3 tags
  6. Card 2: Live Chat — blue-100 icon
  7. Card 3: Analytics — emerald-100 icon
  8. Card 4 (col-span-2): Service Request — rose-100 icon + Kanban mockup
  9. Decorative blur orbs per card + dark variants

### Step 9: Rewrite `LandingLineSection.tsx` — Green themed
- **File**: `frontend/components/landing/LandingLineSection.tsx`
- **Props**: `{ locale }`
- **Operations**:
  1. Green container: `bg-[#F8FCF8] dark:bg-[#0A1F0A] rounded-[3rem]` with blur orbs
  2. Left: badge + heading + description + 2 buttons — all `t(locale, ...)`
  3. Right: 3 chat mockup cards with `motion.div whileHover={{ x: 10, scale: 1.02 }}`
  4. Cards: glassmorphic bg, green icon container, heading + description
  5. Dark variants: `dark:bg-slate-900/80`, `dark:border-[#00B900]/20`, `dark:text-white`

### Step 10: Rewrite `LandingFooter.tsx` — Light footer with dark variant
- **File**: `frontend/components/landing/LandingFooter.tsx`
- **Props**: `{ locale }`
- **Operations**:
  1. Light bg: `bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-white/10`
  2. 5-column grid: brand (col-span-2) + 3 link columns
  3. Brand: gradient logo + "JSK Platform" `font-heading text-3xl`
  4. Link columns: เกี่ยวกับ, บริการ, ติดต่อ — all text from `t(locale, ...)`
  5. Contact: icons + email, phone, address
  6. Bottom bar: "JSK 4.0 Platform" + copyright
  7. Full dark mode support

### Step 11: Cleanup old components
- **Files**:
  - `AnimatedCounter.tsx` — **Keep** (may be useful for future use)
  - `LandingLanguageToggle.tsx` — **Keep** (still used in navbar)
  - `HeroCarousel.tsx` — **Keep** (not used but harmless)
  - `LandingBrandMark.tsx` — **Keep** if still used in mobile Sheet; otherwise mark as unused
  - `lib/i18n/landing.ts` — **Keep and update** with new keys
  - `lib/public-links.ts` — **Keep** (may be used by LINE section buttons)

### Step 12: Build verification
- Run `cd frontend && npm run build` — verify no TypeScript/build errors
- Run `npm run dev` — visually verify:
  - [ ] Light mode matches example 100%
  - [ ] Dark mode is visually consistent
  - [ ] i18n TH/EN switching works for all new sections
  - [ ] Responsive: mobile / tablet (md) / desktop (lg)
  - [ ] Animations: parallax, entrance, hover effects
  - [ ] All Next.js Link routes work (/admin, /login, /liff/service-request)

---

## Key Files

| File | Operation | Description |
|------|-----------|-------------|
| `frontend/package.json` | Modify | Add `motion` dependency |
| `frontend/app/globals.css` | Modify | Add Outfit font, `--font-heading`, clean old landing classes |
| `frontend/lib/i18n/landing.ts` | Modify | Add ~40 new translation keys for redesigned sections |
| `frontend/app/page.tsx` | Rewrite | New structure: parallax bg + 6 sections, keep i18n state |
| `frontend/components/landing/LandingNavbar.tsx` | Rewrite | Floating pill + keep theme/language toggles |
| `frontend/components/landing/LandingHero.tsx` | Rewrite | Centered hero + dashboard mockup |
| `frontend/components/landing/LandingStats.tsx` | Create | Minimalist 4-col stats |
| `frontend/components/landing/LandingFeatures.tsx` | Create | Bento grid features |
| `frontend/components/landing/LandingLineSection.tsx` | Rewrite | Green themed + chat mockup cards |
| `frontend/components/landing/LandingFooter.tsx` | Rewrite | Light footer + dark variant |

---

## Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| `motion` SSR compat with Next.js | `'use client'` on all motion components |
| i18n key mismatch | Add keys incrementally; run build to catch missing keys |
| Dark mode for new glassmorphic design | Test both modes; use `dark:` variants systematically |
| `font-heading` utility in Tailwind v4 | Defining `--font-heading` in `@theme` auto-creates utility |
| Outfit font loading flash (FOIT) | `display=swap` in Google Fonts URL; Noto Sans Thai as fallback |
| Old landing CSS classes breaking | Only remove classes confirmed unused outside landing |

---

## Execution Order

```
Step 1   → Install motion
Step 2   → Update globals.css (Outfit font + --font-heading)
Step 3   → Update i18n translations
Step 4   → Rewrite page.tsx (new structure + parallax bg)
Step 5   → Rewrite LandingNavbar.tsx
Step 6   → Rewrite LandingHero.tsx
Step 7   → Create LandingStats.tsx
Step 8   → Create LandingFeatures.tsx
Step 9   → Rewrite LandingLineSection.tsx
Step 10  → Rewrite LandingFooter.tsx
Step 11  → Cleanup
Step 12  → Build verification
```

Steps 5-10 can be parallelized via subagents (each component is independent once i18n keys exist).

---

## SESSION_ID (for /ccg:execute use)
- CODEX_SESSION: N/A
- GEMINI_SESSION: N/A
