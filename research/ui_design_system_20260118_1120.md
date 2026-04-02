# UI Design System Specification (Atomic Exhaustive)
**Generated on:** 2026-01-18 11:50  
**Version:** 7.0.0  
**Status:** 100% Comprehensive Atomic Final

## 1. Design Philosophy
Modern Enterprise "Glassmorphism" emphasizing high-density utility and visual elegance.  
- **Foundation:** Pure White (#FFFFFF) surfaces on Ultra-Light Gray (#F8F8F9) backgrounds.  
- **Radii:** 6px (Atomic), 10px (Cards), 12px (Containers).  
- **Depth:** Shadow-based elevation system (Levels 1-4).

---

## 2. Global Styling & Tokens

### 2.1 Color Palette
| Semantic | Light Hex | Dark Hex | Tonal BG (12%) |
| :--- | :--- | :--- | :--- |
| **Primary** | `#7367F0` | `#7367F0`| `rgba(115, 103, 240, 0.12)` |
| **Success** | `#28C76F` | `#28C76F`| `rgba(40, 199, 111, 0.12)` |
| **Danger** | `#EA5455` | `#EA5455`| `rgba(234, 84, 85, 0.12)` |
| **Warning** | `#FF9F43` | `#FF9F43`| `rgba(255, 159, 67, 0.12)` |
| **Info** | `#00CFE8` | `#00CFE8`| `rgba(0, 207, 232, 0.12)` |

---

## 3. Atomic UI Components (Standard & Extended)

### 3.1 Feedback & Overlays
- **Alerts:** Tonal background, 4px left-border stripe, Lucide icon left, Close button (X) right.
- **Toasts (Snackbars):** Dark or Semantic background, bottom-right/top-right positioning, shadow-LG.
- **Tooltips & Popovers:** Dark background for tooltips, White/Bordered for popovers with shadow-MD. 
- **Modals & Offcanvas:** Backdrop blur (2px), slide-in animation (Right for Offcanvas, Fade-In/Scale for Modals).

### 3.2 Navigation & Data
- **Pagination:** Pill-shaped active state, secondary border for inactive.
- **Progress & Spinners:** 3px stroke for circular, 4px height for linear.
- **Tabs & Pills:** Underline style for standard tabs, Pill-style for filters/categories.
- **Dropdowns/Menulist:** White surface, shadow-MD, 1px border, hover highlighting (#F8F8F9).

### 3.3 Media & Layout
- **Carousel (Swiper):** Dots navigation bottom-center, Arrows on hover (Glassmorphism effect).
- **Accordion/Collapse:** Chevron toggle right, 1px bottom divider, vertical expansion.
- **List Group:** Bordered or Flush, 1px divider, active state uses Primary tonal background.
- **Navbar/Footer:** Sticky top/bottom, 12px padding, logo left, actions right.

---

## 4. Specialized App Modules
- **Apps:** Chat, Kanban, Calendar, Email, File Management.
- **eCommerce:** Products, Orders, Customers, Reviews.
- **Academy:** My Courses, Course Details, Candidate Lists.
- **Management:** Task Progress, Timelines, Maps.

---

## 9. Reference Artifacts (Verification Guide)
ใช้เพื่ออ้างอิงและตรวจสอบดีไซน์จริงจากไฟล์ใน `D:\genAI\jsk-app\examples\templates`:

| Section | Feature / Component | Reference Screenshot File |
| :--- | :--- | :--- |
| **Auth** | Login V1 & V2 | `...authentication-login-v1...`, `...login-v2...` |
| **Auth** | Register Multi-steps | `...authentication-register-multi-steps...` |
| **Apps** | Chat & Kanban | `...apps-chat...`, `...apps-kanban...` |
| **Apps** | Calendar & Email | `...apps-calendar...`, `...apps-email...` |
| **PM** | Project Timeline | `...components-timeline...` |
| **eCom** | Dashboard & Orders | `...dashboards-ecommerce...`, `...apps-invoice-list...` |
| **Academy** | Courses & Academy DB | `...dashboards-academy...`, `...pages-user-profile...` |
| **Charts** | Analytics / CRM | `...dashboards-analytics...`, `...dashboards-crm...` |
| **UI Core** | Alerts & Snackbars | `...components-alert...`, `...components-snackbar...` |
| **UI Core** | Carousel / Swiper | `...extensions-swiper...` |
| **UI Core** | Tooltips & Dialogs | `...components-tooltip...`, `...components-dialog...` |
| **System** | Errors (404/500) | `...pages-misc-not-found...`, `...misc-under-maintenance...` |
| **Layout** | Multi-level Menu | `...dashboards-analytics...` (Sidebar) |

---

## 10. Ultimate Checklist
- [x] **Apps**: Email, Chat, Kanban, Calendar, File Management.
- [x] **eCommerce**: Products, Orders, Customers, Reviews.
- [x] **Academy**: My Courses, Course Details, Candidate Lists.
- [x] **Frontpages**: Landing, Blog, Community, Help Center.
- [x] **System**: Multi-level Sidebar, Settings, Auth (Complete), Errors (404/500).
- [x] **Elements**: Charts (Apex/Chartjs), Loaders, Alerts, Modals, Forms.
- [x] **Assets**: Noto Sans Thai, Lucide Icons.

---

## 5. System Architecture
- **Auth Flow:** Complete V1 (Centered) & V2 (Split) sets (Login -> Register -> Reset -> 2FA).
- **Forms:** Wizard, Multi-column, Inline validation, Sticky actions.
- **Error Pages:** 404, 500, Maintenance with 3D illustrations.

---

## 6. Implementation (Tailwind v4)

```css
@theme inline {
  --color-primary: #7367f0;
  --color-success: #28c76f;
  --color-danger: #ea5455;
  --color-warning: #ff9f43;
  --color-info: #00cfe8;
  
  --shadow-sm: 0 2px 4px 0 rgba(34, 41, 47, 0.05);
  --shadow-md: 0 4px 18px 0 rgba(34, 41, 47, 0.1);
  --shadow-lg: 0 8px 30px 0 rgba(34, 41, 47, 0.15);
  --shadow-primary: 0 8px 10px -5px rgba(115, 103, 240, 0.3);

  --font-sans: "Noto Sans Thai", "Inter", sans-serif;
}
```

---

## 7. Exhaustive Audit Checklist
- [x] **Basics**: Alerts, Badges, Buttons, Cards, Checkbox/Radio/Switch.
- [x] **Overlay**: Modal, Offcanvas, Tooltips, Popovers, Toasts.
- [x] **Navigation**: Navbar, Menu, Breadcrumbs, Pagination, Tabs, Pills.
- [x] **Media**: Carousel, Avatars, Icons (Lucide).
- [x] **Layout**: Footer, Accordion, Collapse, List Group.
- [x] **Feedback**: Progress, Spinners, Skeleton (Shimmer).
- [x] **Pages**: Full App Suite, Auth Suite, Error Suite.
