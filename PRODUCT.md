# Product: JskApp — Community Justice Services

## Register

product

## Surfaces

- **Product** (primary): Admin dashboard, LIFF mini-apps, live-chat operator interface, settings, and internal tools — design SERVES the workflow.
- **Brand** (primary): Landing page (`/`) and login page (`/login`) — design IS the product for citizen trust and institutional credibility.

## Users

- **Citizens (ประชาชน)**: Submit service requests via LINE LIFF on mobile. Need clarity, speed, and reassurance that their request reached the right place.
- **Staff (เจ้าหน้าที่)**: Process requests, handle live chat handoffs, manage broadcast messaging, and operate the admin panel. Need efficiency, density, and clear status indicators.
- **Admins (SUPER_ADMIN, ADMIN, AGENT)**: Configure the system, manage users, review analytics, and maintain integrations (LINE, Telegram, n8n). Need control, audit trails, and fault tolerance.

## Product Purpose

A LINE Official Account system with LIFF integration that lets citizens submit service requests to Community Justice Services, routes those requests through a Kanban workflow, and provides staff with live chat, chatbot intent matching, rich menu management, broadcast messaging, and analytics.

Success means: a citizen can submit a request in under 90 seconds; a staff member can see, assign, and update that request without leaving the admin panel; and administrators can audit every action.

## Brand Personality

Professional · Efficient · Approachable · Modern · Thai-first

The interface should feel like a competent government service that happens to be well-designed: trustworthy without being stiff, modern without being flashy, and always respectful of Thai language and cultural context.

## Anti-references

- Overly complex enterprise dashboards with dense data grids as the default view
- Generic SaaS templates that feel interchangeable and anonymous
- Thai government websites that sacrifice usability for visual ornament
- LINE OA admin tools that bury configuration three menus deep

## Design Principles

1. **Clarity over density** — Every screen has one primary action. Secondary tools are available but not competing for attention.
2. **Mobile-first for citizens, desktop-optimized for staff** — The LIFF experience is thumb-driven and scroll-friendly; the admin panel assumes a keyboard, mouse, and larger viewport.
3. **Trust through transparency** — Status badges, audit logs, and real-time updates let users see what the system is doing. Never hide state behind a loading spinner without context.
4. **Thai typography is not an afterthought** — Noto Sans Thai carries equal weight to Inter. Line-height, word-breaking, and spacing are tuned for Thai script.
5. **Motion with purpose** — Animations guide attention, confirm actions, and soften state transitions. Never decorative motion that delays interaction.

## Accessibility & Inclusion

- WCAG 2.1 AA compliance target
- Thai language primary; English secondary where appropriate
- Reduced-motion support for all animations (`prefers-reduced-motion`)
- Color-blind safe status indicators (shape + text, not color alone)
- Skip-to-content link and keyboard navigation in admin shell
