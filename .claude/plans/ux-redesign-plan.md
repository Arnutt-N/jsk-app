# UX Redesign Plan — JSK App

> **Branch:** `feat/ux-redesign`
> **Created:** 2026-03-26
> **Status:** DRAFT — รอยืนยันก่อนดำเนินการ

---

## สรุปภาพรวม

ปรับปรุง UX/UI ทั้งระบบให้ดูทันสมัย มืออาชีพ โดยอ้างอิง design patterns จาก SaaS ชั้นนำ (Linear, Intercom, Zendesk, Vercel Dashboard) พร้อมตรวจสอบและแก้ไขปัญหาที่พบจาก Design Audit

---

## Phase 1: Design System Fix (แก้ปัญหาจาก Audit)

### 1.1 แก้ Hardcoded Colors → ใช้ CSS Variables (CRITICAL)

| ไฟล์ | ปัญหา | แก้ไข |
|------|-------|-------|
| `components/ui/Button.tsx` L60-69 | ใช้ `emerald-500`, `amber-500` | เปลี่ยนเป็น `success`, `warning` จาก CSS vars |
| `components/ui/Badge.tsx` | ใช้ `green-100`, `red-100`, `blue-100` | เปลี่ยนเป็น `success/10`, `danger/10`, `info/10` |
| `components/ui/Input.tsx` | error/success ใช้ `red-500`, `green-500` | เปลี่ยนเป็น `danger`, `success` |
| `components/ui/Modal.tsx` | ใช้ hardcoded `gray-900/50` | เปลี่ยนเป็น CSS vars |
| `app/admin/layout.tsx` L222,230 | Sidebar ใช้ `#0f172a`, `#1e1b4b` | กำหนด `--color-sidebar-*` variables |
| `app/admin/live-chat/_components/ConversationList.tsx` | เหมือน sidebar | ใช้ CSS vars เดียวกัน |
| `app/admin/live-chat/_components/MessageInput.tsx` | Send button ใช้ `blue-600` | เปลี่ยนเป็น `brand-500` |
| `app/login/page.tsx` | ใช้ `slate-*` ทั้งหมด | เปลี่ยนเป็น semantic colors |

### 1.2 เพิ่ม Sidebar CSS Variables ใน globals.css

```css
/* เพิ่มใน @theme */
--color-sidebar-bg: hsl(222 47% 11%);
--color-sidebar-hover: hsl(222 47% 16%);
--color-sidebar-active: hsl(222 47% 20%);
--color-sidebar-border: hsla(0 0% 100% / 0.1);
--color-sidebar-text: hsl(210 20% 98%);
--color-sidebar-text-muted: hsl(215 20% 65%);
```

### 1.3 เพิ่ม Typography Scale (h1-h6)

```css
--heading-1: clamp(1.875rem, 1.5rem + 1.875vw, 2.5rem);
--heading-2: clamp(1.5rem, 1.25rem + 1.25vw, 1.875rem);
--heading-3: clamp(1.25rem, 1.1rem + 0.75vw, 1.5rem);
--heading-4: clamp(1.125rem, 1rem + 0.625vw, 1.25rem);
```

**ไฟล์ที่แก้:** 8 ไฟล์ | **เวลา:** ~2 ชม.

---

## Phase 2: Landing Page Redesign

### 2.1 Pattern: Modern SaaS Landing (Vercel/Linear style)

**ปัจจุบัน:** หน้า `app/page.tsx` — มี hero + feature cards เบื้องต้น

**Redesign:**

```
┌─────────────────────────────────────────────┐
│  Navbar (glass effect, sticky)              │
│  Logo | Features | Pricing | Login | CTA    │
├─────────────────────────────────────────────┤
│  HERO SECTION                               │
│  ┌───────────────────────────────────┐      │
│  │  Badge: "ระบบบริการ กยธ."         │      │
│  │  H1: ระบบ LINE OA สำหรับ          │      │
│  │      บริการประชาชน                 │      │
│  │  Subtitle: จัดการคำขอ, แชทสด,     │      │
│  │           ตอบอัตโนมัติ             │      │
│  │  [เข้าสู่ระบบ] [ดูฟีเจอร์]       │      │
│  └───────────────────────────────────┘      │
│  Dashboard Preview (screenshot/mockup)       │
├─────────────────────────────────────────────┤
│  FEATURES GRID (3 cols)                      │
│  ┌─────┐ ┌─────┐ ┌─────┐                   │
│  │ 💬  │ │ 📊  │ │ 🤖  │                   │
│  │Live │ │แดช │ │แชท │                      │
│  │Chat │ │บอร์ด│ │บอท │                      │
│  └─────┘ └─────┘ └─────┘                   │
│  ┌─────┐ ┌─────┐ ┌─────┐                   │
│  │ 📋  │ │ 📢  │ │ 📁  │                   │
│  │คำขอ │ │Broad│ │ไฟล์ │                      │
│  │บริการ│ │cast │ │จัดการ│                     │
│  └─────┘ └─────┘ └─────┘                   │
├─────────────────────────────────────────────┤
│  STATS SECTION                              │
│  198 Tests ✓ | 24 Models | 17 Services      │
├─────────────────────────────────────────────┤
│  CTA SECTION                                │
│  "พร้อมเริ่มใช้งาน?"  [เข้าสู่ระบบ]       │
├─────────────────────────────────────────────┤
│  FOOTER                                     │
│  Links | Version | กยธ.                     │
└─────────────────────────────────────────────┘
```

**Design tokens:**
- Background: `--color-bg` (light) พร้อม subtle gradient
- Hero: gradient text + fade-in-up animation
- Feature cards: `Card variant="glass"` + hover lift
- Stats: ตัวเลขใหญ่ + animated counter

### 2.2 Login Page Polish

- เปลี่ยน `slate-*` ทั้งหมดเป็น semantic colors
- เพิ่ม gradient background (subtle brand-50 → bg)
- Card shadow upgrade: `shadow-xl` → `shadow-2xl`
- เพิ่ม animated illustration หรือ pattern background

**ไฟล์ที่แก้:** 2 ไฟล์ (`page.tsx`, `login/page.tsx`) | **เวลา:** ~3 ชม.

---

## Phase 3: Chat UI Redesign (Intercom/Zendesk Pattern)

### 3.1 Layout Pattern

```
┌──────────────────────────────────────────────────┐
│  Chat Header (brand gradient, breadcrumb)        │
├──────────┬───────────────────────┬───────────────┤
│ CONV     │                      │  CUSTOMER     │
│ LIST     │     CHAT AREA        │  PANEL        │
│          │                      │               │
│ ┌──────┐ │  ┌────────────────┐  │  Avatar       │
│ │Search│ │  │ Bot msg        │  │  Name         │
│ └──────┘ │  └────────────────┘  │  Status       │
│          │                      │  ───────────  │
│ ● Active │  ┌────────────────┐  │  Tags         │
│   User A │  │    User msg  ← │  │  Chat mode    │
│   User B │  └────────────────┘  │  Session info  │
│          │                      │  ───────────  │
│ ○ Waiting│  ┌────────────────┐  │  Quick Actions│
│   User C │  │ Admin msg    → │  │  • Claim      │
│          │  └────────────────┘  │  • Transfer   │
│          │                      │  • Close      │
│          │  ┌────────────────┐  │               │
│          │  │ Typing...      │  │  History      │
│          │  └────────────────┘  │  Previous     │
│          │                      │  sessions     │
│          ├──────────────────────┤               │
│          │ [📎] [Input...] [➤] │               │
│          │ Quick replies ▾      │               │
└──────────┴──────────────────────┴───────────────┘
```

### 3.2 สิ่งที่ปรับปรุง

| Component | ปัจจุบัน | ปรับปรุง |
|-----------|---------|---------|
| **ConversationList** | Dark sidebar hardcoded | ใช้ CSS vars + status badge (● online, ○ waiting) |
| **MessageBubble** | ดี (ใช้ system colors ✓) | เพิ่ม read receipts, timestamp grouping |
| **MessageInput** | Send button = hardcoded blue | Brand color + keyboard shortcut hint (Ctrl+Enter) |
| **ChatArea** | พื้นฐาน | เพิ่ม date separators, scroll-to-bottom FAB |
| **CustomerPanel** | มีอยู่แล้ว | เพิ่ม tag chips, session timeline |
| **SessionActions** | ปุ่มเบื้องต้น | Redesign เป็น dropdown menu + confirmation dialog |
| **TypingIndicator** | Animation มีอยู่ ✓ | เพิ่มชื่อผู้พิมพ์ |
| **QuickReplies** | มีอยู่ | เพิ่ม search/filter + keyboard nav |

### 3.3 Chat Bubble Styles (Intercom-inspired)

```
Incoming (user):  bg-surface, border-border-default, rounded-2xl rounded-bl-md
Bot:              bg-bg, border-border-subtle, rounded-2xl rounded-bl-md, bot icon
Outgoing (admin): gradient-active, text-white, rounded-2xl rounded-br-md
System:           text-center, text-text-tertiary, text-xs
```

**ไฟล์ที่แก้:** ~10 ไฟล์ใน `live-chat/` | **เวลา:** ~4 ชม.

---

## Phase 4: Admin Dashboard Polish

### 4.1 Sidebar Refinement

- Sidebar ใช้ CSS vars แทน hardcoded hex
- เพิ่ม tooltip เมื่อ collapsed
- Active state: left border accent (3px brand-500)
- Section headers: uppercase, letter-spacing, text-xs, text-muted

### 4.2 Page Header Pattern (ทุกหน้า)

```
┌─────────────────────────────────────────────┐
│  Breadcrumb: Admin > Live Chat              │
│  H1: Live Chat                              │
│  Subtitle: จัดการการสนทนากับผู้ใช้          │
│                         [Filter] [Export]    │
└─────────────────────────────────────────────┘
```

### 4.3 Dashboard Home Stats Cards

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ 📊 4,521 │ │ 💬 23    │ │ ⏱ 1.2m   │ │ ⭐ 4.5   │
│ คำขอทั้งหมด│ │ แชทรอดำเนินการ│ │ เวลาตอบเฉลี่ย│ │ CSAT    │
│ ↑12% จากเดือนก่อน│ │ 3 เร่งด่วน │ │ ↓8% ดีขึ้น │ │ จาก 127 │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

- Card hover: `variant="glass"` + `hoverEffect="lift"`
- ตัวเลข: `font-mono` + animated counter
- Trend indicator: สีเขียว (↑ ดี) / สีแดง (↓ แย่)

**ไฟล์ที่แก้:** ~5 ไฟล์ | **เวลา:** ~2 ชม.

---

## Phase 5: Component & Element Audit

### 5.1 ปุ่ม (Button) — ตรวจทุก variant

| Variant | สี | Hover | Cursor | Focus Ring | Status |
|---------|-----|-------|--------|------------|--------|
| primary | brand-500→600 gradient | shadow-lg + lift | pointer | brand-500/50 | ✓ OK |
| secondary | gray-100 | gray-200 | pointer | brand-500/50 | ✓ OK |
| outline | transparent + border | brand-50 bg | pointer | brand-500/50 | ✓ OK |
| ghost | transparent | brand-50 | pointer | brand-500/50 | ✓ OK |
| danger | danger→danger-dark | shadow-lg | pointer | danger/50 | ✓ OK |
| **success** | **emerald-500** ❌ | shadow-lg | pointer | — | **FIX: ใช้ success vars** |
| **warning** | **amber-500** ❌ | shadow-lg | pointer | — | **FIX: ใช้ warning vars** |
| disabled | opacity-50 | not-allowed | not-allowed | none | ✓ OK |

### 5.2 Input — ตรวจ states

| State | Border | Ring | Cursor | Status |
|-------|--------|------|--------|--------|
| default | border-default | — | text | ✓ OK |
| focus | brand-500 | brand-500/20 | text | ✓ OK |
| **error** | **red-500** ❌ | **red-500/20** | text | **FIX: ใช้ danger** |
| **success** | **green-500** ❌ | **green-500/20** | text | **FIX: ใช้ success** |
| disabled | opacity-50 | — | not-allowed | ✓ OK |

### 5.3 Card — ตรวจ hover effects

| Variant | Hover | Cursor | Transition | Status |
|---------|-------|--------|------------|--------|
| default | — | default | — | ✓ OK |
| lift | -translate-y-1 + shadow-lg | pointer | 200ms ease | ✓ OK |
| glow | shadow-glow + brand-200 border | pointer | 200ms ease | ✓ OK |
| scale | scale-[1.02] | pointer | 200ms ease | ✓ OK |

### 5.4 Badge, Modal, Select — ตรวจ colors

- Badge: **FIX** — เปลี่ยนจาก hardcoded เป็น semantic
- Modal: **FIX** — overlay/bg ใช้ CSS vars
- Select: ✓ OK — ใช้ Radix primitives ถูกต้อง

**ไฟล์ที่แก้:** ~6 ไฟล์ | **เวลา:** ~1.5 ชม.

---

## Phase 6: decoration-core Backend Review

### 6.1 Database Schema Summary (17 tables)

```
Base Tables (4):
  organization → personnel → position → users

Decoration ช้างเผือก-มงกุฎไทย (4):
  decoration_changpuak_levels     (12 ชั้นตรา)
  decoration_changpuak_criteria   (เกณฑ์การขอ)
  decoration_changpuak_requests   (คำขอเสนอ)
  decoration_changpuak_history    (ประวัติได้รับ)

ดิเรกคุณาภรณ์ (5):
  direk_persons        (บุคคลภายนอก/อาสาสมัคร)
  direk_levels          (7 ชั้นตรา)
  direk_requests        (คำขอ — ผลงาน/บริจาค)
  direk_award_history   (ประวัติ)
  direk_documents       (เอกสาร นร.1-6)
  direk_regulations     (กฎระเบียบ)

เหรียญจักรพรรดิมาลา (2):
  chakrabardi_requests  (คำขอ ≥25 ปี)
  chakrabardi_history   (ประวัติ)

System (4):
  roles, user_roles, request_rounds, system_settings
  file_attachments
```

### 6.2 Backend Review (PHP — decoration-core)

**โครงสร้างปัจจุบัน:** PHP vanilla (ไม่ใช่ Laravel/Symfony)
- `backend/api.php` — API entry point
- `backend/auth.php` — Authentication
- `backend/routes/` — Route definitions
- `backend/engines/` — Business logic
- `backend/helpers.php` — Utility functions

### 6.3 ข้อเสนอแนะสำหรับ Backend

| ด้าน | ปัญหาที่อาจพบ | แนะนำ |
|------|-------------|-------|
| **Auth** | PHP session-based? | ใช้ JWT + refresh token |
| **SQL Injection** | raw query? | ใช้ prepared statements ทุกที่ |
| **CORS** | อาจไม่มี | เพิ่ม CORS headers |
| **Validation** | manual? | เพิ่ม schema validation |
| **Error Handling** | อาจ leak info | Return generic error + log detail |
| **File Upload** | path traversal risk | Validate extension + randomize filename |

> **หมายเหตุ:** ต้องอ่าน code จริงก่อนยืนยันปัญหา — นี่เป็นรายการตรวจสอบเบื้องต้น

---

## สรุปแผนงาน

| Phase | งาน | ไฟล์ | เวลาโดยประมาณ |
|-------|------|------|---------------|
| 1 | Design System Fix | 8 files | ~2 ชม. |
| 2 | Landing Page Redesign | 2 files | ~3 ชม. |
| 3 | Chat UI Redesign | ~10 files | ~4 ชม. |
| 4 | Admin Dashboard Polish | ~5 files | ~2 ชม. |
| 5 | Component Audit Fix | ~6 files | ~1.5 ชม. |
| 6 | decoration-core Review | อ่าน + แนะนำ | ~1 ชม. |
| **รวม** | | **~31 files** | **~13.5 ชม.** |

---

## ลำดับการดำเนินการแนะนำ

```
Phase 1 (Design System Fix) ──→ Phase 5 (Component Audit)
    ↓                                    ↓
Phase 2 (Landing Page)          Phase 3 (Chat UI)
    ↓                                    ↓
Phase 4 (Dashboard Polish) ←────────────┘
    ↓
Phase 6 (decoration-core Review)
```

**Phase 1+5 ต้องทำก่อน** เพราะแก้ foundation — ทุก phase ที่เหลืออ้างอิง CSS vars ที่แก้ไข

---

## Design References

| แหล่งอ้างอิง | ใช้กับส่วนไหน |
|-------------|-------------|
| **Intercom** messenger UI | Chat bubbles, conversation list, customer panel |
| **Linear** dashboard | Sidebar, stats cards, clean typography |
| **Vercel** dashboard | Color scheme, font (Geist-like → Inter), spacing |
| **Zendesk** agent workspace | Chat layout 3-panel, session management |
| **Stripe** dashboard | Data tables, filters, export patterns |
| **Notion** | Page headers, breadcrumbs, empty states |

---

> **รอยืนยัน:** พิมพ์ `Y` หรือระบุ Phase ที่ต้องการเริ่มก่อน
