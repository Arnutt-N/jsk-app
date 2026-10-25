# SAFE-01 / 02 / 03 — code evidence (read-only, no prod changes)

Source files read 2026-10-25. Quotes are verbatim with `file:line`.

## SAFE-01 — sidebar logout vs UserMenu logout

**Verdict: CONFIRMED** (two paths diverge; sidebar path has no confirm and no keyboard path)

Sidebar (`frontend/app/admin/layout.tsx:153-157`):

```tsx
<div
  className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group"
  onClick={() => logout?.()}
>
```

Element type is `div`, not `button`. No `role`, no `tabIndex`, no key handler. No confirmation step. Click fires `logout?.()` directly (`layout.tsx:146-147` owns `const { user, logout } = useAuth()` inside `SidebarUserInfo`).

UserMenu (`frontend/components/admin/UserMenu.tsx:188-195`):

```tsx
<button
  onClick={() => { setOpen(false); setConfirmingLogout(true); }}
  className="flex items-center gap-3 px-4 py-2.5 text-sm text-danger hover:bg-danger/5 transition-colors w-full text-left cursor-pointer"
  role="menuitem"
>
  <LogOut className="w-4 h-4" />
  ออกจากระบบ
</button>
```

Sign-out opens a confirm step instead of logging out (`UserMenu.tsx:200-204`):

```tsx
<LogoutConfirmDialog
  isOpen={confirmingLogout}
  onClose={() => setConfirmingLogout(false)}
  onConfirm={() => { setConfirmingLogout(false); logout?.(); }}
/>
```

The dialog is the shared warning variant (`components/admin/LogoutConfirmDialog.tsx`):

```tsx
title="ต้องการออกจากระบบหรือไม่?"
description="คุณจะต้องเข้าสู่ระบบอีกครั้งเพื่อกลับเข้าใช้งานหลังบ้าน"
variant="warning"
```

Keyboard support on the UserMenu path is real code, not assumption. Trigger is a native `button` with `aria-expanded`/`aria-haspopup` (`UserMenu.tsx:90-97`). Dropdown closes on Escape (`UserMenu.tsx:74-81`):

```tsx
function handleEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') setOpen(false);
}
```

So Tab reaches the avatar trigger and Enter/Space toggles it, while the sidebar `div` is unreachable by Tab and fires on click only. Actual Tab order still wants one browser pass, but the code split (confirm vs no-confirm, button vs div) is confirmed at source level.

## SAFE-02 — ConfirmDialog dismiss paths during isLoading

**Verdict: CONFIRMED** (Cancel locks, but Escape and backdrop stay open during pending)

`frontend/components/ui/ConfirmDialog.tsx:65`:

```tsx
<Modal isOpen={isOpen} onClose={onClose} maxWidth="sm" showCloseButton={false}>
```

No X button exists at any time (showCloseButton false). Cancel locks during loading (`ConfirmDialog.tsx:76-82`):

```tsx
<Button
  variant="outline"
  className="flex-1"
  onClick={onClose}
  disabled={isLoading}
>
```

Confirm shows spinner and self-disables via Button (`Button.tsx`: `disabled={isLoading || disabled}`), so the confirm click is guarded.

But the two Modal-level exits ignore isLoading. Escape always fires onClose (`Modal.tsx:51-53`):

```tsx
if (e.key === 'Escape') {
  onClose();
  return;
}
```

Backdrop defaults to closing (`Modal.tsx:27`: `closeOnBackdropClick = true`) and ConfirmDialog never overrides it, so this stays live (`Modal.tsx:131-134`):

```tsx
<div
  className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
  onClick={closeOnBackdropClick ? onClose : undefined}
/>
```

Net during `isLoading=true`: Cancel disabled, X absent, Escape still dismisses, backdrop click still dismisses. Browser throttle test (Task 3 Step 2) should confirm the user-visible effect, but the code paths are unambiguous.

## SAFE-03 — requests delete flow double-click guard

**Verdict: CONFIRMED** (no pending guard; double DELETE possible at code level)

`frontend/app/admin/requests/page.tsx:211-226`:

```tsx
const handleDelete = (req: ServiceRequest) => {
    setSelectedRequest(req);
    setDeleteModalOpen(true);
};

const confirmDelete = async () => {
    if (!selectedRequest) return;
    const result = await apiFetch(`/admin/requests/${selectedRequest.id}`, { method: 'DELETE' });
    if (result.ok) {
        setRequests(prev => prev.filter(r => r.id !== selectedRequest.id));
        setDeleteModalOpen(false);
        ...
```

No `isDeleting`/`isLoading` flag, no early return while a DELETE is in flight. The dialog call site passes no loading state (`page.tsx:562-578`):

```tsx
<ConfirmDialog
    isOpen={deleteModalOpen}
    onClose={() => setDeleteModalOpen(false)}
    onConfirm={confirmDelete}
    title="ยืนยันการลบ"
    ...
    confirmText="ยืนยันลบ"
    cancelText="ยกเลิก"
    variant="danger"
/>
```

`isLoading` is absent so it defaults to `false`; the confirm button never enters the `disabled={isLoading || disabled}` state. Two fast clicks on ยืนยันลบ therefore issue two `apiFetch ... { method: 'DELETE' }` calls. Counting actual DELETEs on the wire still needs the throttled browser run (Task 3 Step 3).
