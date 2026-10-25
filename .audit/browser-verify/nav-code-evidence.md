# NAV-01 + NAV-02 code evidence (Task 2)

Source: `frontend/app/admin/layout.tsx` plus `frontend/lib/nav-access.ts`.
Read directly from the repo files on 2026-10-25. No prod code changed.

## NAV-01: mobile search is a dead-end input

Verdict: CONFIRMED.

What the code shows. The mobile button only toggles an input open. The input has no submit path. The desktop button opens the command palette instead.

Mobile button (lines 416-422):

```tsx
<button
  className="md:hidden p-2 bg-surface rounded-xl ..."
  aria-label="Search"
  onClick={() => setIsMobileSearchOpen(true)}
>
```

Mobile input (lines 407-413). Its only handler closes it on blur:

```tsx
<input
  type="text"
  placeholder="ค้นหา..."
  className="bg-transparent text-sm ..."
  autoFocus
  onBlur={() => setIsMobileSearchOpen(false)}
/>
```

There is no `onChange`, no `onKeyDown`, no `onSubmit`, no form wrapper, and no results list anywhere in this branch. Typing text goes nowhere. Leaving the field closes it and discards the text.

Desktop trigger (lines 426-427). Hidden below `md`, so phones never see it:

```tsx
<button
  onClick={() => document.dispatchEvent(new Event('jsk:open-command-palette'))}
  className="hidden md:flex ..."
```

So the 360px flow and the 1280px flow do not share a backend. Desktop dispatches `jsk:open-command-palette`. Mobile renders a bare input with no dispatch.

Browser still needs to confirm the felt UX (typed text visibly does nothing, blur collapses it). The code leaves no other path, so browser time should be short.

## NAV-02: AGENT sees Appointments but the guard bounces it

Verdict: CONFIRMED.

Sidebar offers Appointments to AGENT (line 224):

```tsx
{ name: 'Appointments', href: '/admin/bookings', icon: CalendarCheck, allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'HEAD', 'AGENT', 'VIEWER'] },
```

Live Chat also lists AGENT (line 231):

```tsx
{ name: 'Live Chat', href: '/admin/live-chat', icon: MessageCircle, openInNewTab: true, allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'AGENT'] },
```

Visibility runs through `isNavItemVisible` (`frontend/lib/nav-access.ts`). It returns true when the role is in the list. So an AGENT login renders both Appointments and Live Chat in the menu.

The auth gate contradicts this. Redirect effect (lines 86-92):

```tsx
if (user.role !== 'AGENT') {
  return;
}

if (pathname !== '/admin/live-chat') {
  router.replace('/admin/live-chat');
}
```

Render gate (lines 132-140). While the redirect is in flight the page shows only a spinner, never the target page:

```tsx
if (user?.role === 'AGENT' && pathname !== '/admin/live-chat') {
  return (
    <div className="h-screen flex items-center justify-center ...">
      <LoadingSpinner label="กำลังโหลด..." fullPage={false} />
    </div>
  );
}
```

Mismatch in one sentence. The menu says AGENT may open `/admin/bookings`. The guard says every non-`/admin/live-chat` path for AGENT redirects to live chat and renders a spinner meanwhile. Clicking the visible Appointments entry therefore bounces straight back.

Note: `isViewerPathAllowed` lists `/admin/bookings` too (line 49), but that allow-list gates the VIEWER role only (lines 81-84, 124-130). It does not exempt AGENT.

Browser still needs to confirm the felt loop (click Appointments as AGENT, watch the URL snap back). The code path is unconditional, so expect the redirect on every non-live-chat route.

## Line index

- Mobile input branch: `frontend/app/admin/layout.tsx:404-414`
- Mobile search button: `frontend/app/admin/layout.tsx:416-422`
- Desktop palette trigger: `frontend/app/admin/layout.tsx:426-429`
- AGENT redirect effect: `frontend/app/admin/layout.tsx:86-92`
- AGENT render gate: `frontend/app/admin/layout.tsx:132-140`
- Appointments menu row: `frontend/app/admin/layout.tsx:224`
- Live Chat menu row: `frontend/app/admin/layout.tsx:231`
- Visibility predicate: `frontend/lib/nav-access.ts` (`isNavItemVisible`)
