# Create-category flow redesign — /admin/auto-replies

**Date:** 2026-07-03 · **Scope:** frontend-only · **Origin:** user-reported UX friction + 5-lens agent brainstorm (ux / a11y / react / design-system / product), all "ship-with-changes".

## Problem
After creating an Intent Category and clicking OK, the user lands back on the list and must hunt for the just-created category to open it and add keywords + responses. An empty category does nothing — creation is really step 1 of 3 (category → keyword → response). The redirect fix also exposes a real hazard: it funnels users into a live category with a keyword and zero responses — the exact state the webhook silently swallows (see Out of scope).

## Decisions (locked with user)
- **Default action = continue setup** (Option A) via a redirect; keep a "create only" path (Option D).
- **Secondary "สร้างอย่างเดียว" = create then close modal** (not keep-open batch).
- **Backend silent-swallow bug → separate GitHub issue**, not fixed here.

## Design (frontend-only; 3 files)

### 1. Create-modal footer — two stacked submit buttons, no explicit Cancel
- PRIMARY (top, full-width, `variant="primary"`, `type="submit"`, `value="configure"`): **"สร้างและตั้งค่าต่อ"** → POST, then `router.push('/admin/auto-replies/${created.id}?created=1')`.
- SECONDARY (below, full-width, `variant="secondary"`, `type="submit"`, `value="only"`): **"สร้างอย่างเดียว"** → POST, then refetch list + close modal + reset form.
- `flex flex-col gap-2`. Remove the explicit "ยกเลิก" button (Modal already gives X + Esc + backdrop). Vertical stack avoids the long Thai label wrapping at 320–400px.
- **Enter/default = PRIMARY** (first in DOM; a null `submitter` resolves to `configure`). The action is recoverable (user can navigate back).

### 2. One submit path, branch by `submitter`
Both buttons are real submit buttons. `onSubmit` reads `(e.nativeEvent as SubmitEvent).submitter?.value` → `'only' | 'configure'` (default `configure`). Keeps the name Input's native `required` on both paths (a `type="button"` secondary would bypass it and allow a blank POST). No ref mutated during render (React-Compiler-safe). Add a `formData.name.trim()` guard (required blocks empty, not whitespace-only).

### 3. Double-submit guard + per-button spinner via one `pendingMode` state
`useState<null | 'configure' | 'only'>(null)`. Set at top of `submit`, cleared in `finally`, guard `if (pendingMode) return`. Both buttons `disabled={pendingMode !== null}`; `isLoading={pendingMode === 'configure'|'only'}` respectively. setState runs in an async event handler (not render / not in an effect).

### 4. Landing = VIEW mode `?created=1` (NOT `?mode=edit`)
`isEditing` in `[id]/page.tsx` gates ONLY the name/description "Save Changes" meta-editor; the keyword/response add UI + the keyword empty-state CTA render in all modes. `?mode=edit` would re-open an editor for the name/description just typed (noise). On `searchParams.get('created') === '1'` and after the category loads, render a dismissible **next-step banner** (`role="status"`, `tabIndex={-1}`, ref, auto-focused after load): "สร้างหมวดหมู่แล้ว — เพิ่มคีย์เวิร์ดและข้อความตอบกลับเพื่อเปิดใช้งาน". Also add an "Add one now" CTA to the **Responses** empty-state to mirror the Keywords one.

### 5. Error handling — inline in the modal, mapped by status code, all Thai
Wrap POST in try/catch. On `!res.ok`: `400` → Thai "ชื่อ Category นี้ถูกใช้แล้ว หรือข้อมูลไม่ถูกต้อง" (mapped by **status code**, never by string-matching the English detail); else `getHttpStatusMessage(res.status)`. Keep the modal open + `formData` intact. Render `<p role="alert" id="category-name-error">` under the name Input; set `aria-invalid` + `aria-describedby`; move focus to the name on error (WCAG 3.3.1). Guard `await res.json()`: missing `id` on the configure path → fall back to refetch + close + a Thai warning instead of pushing to `/undefined`.

### 6. Create as draft; drop the "เปิดใช้งาน" checkbox
Both buttons POST `is_active: false`; remove the checkbox from the create modal. A fresh draft with zero keywords is inert, the readiness badge means "draft/not-ready" cleanly, and it avoids the active-but-0-responses silent-swallow window.

### 7. Readiness badge in the Category cell (under the name)
Existing `<Badge>` (token-based, light/dark-safe). Pure helper `getReadiness(cat)`:
- both counts > 0 → `null` (no badge).
- `response_count === 0` → "ยังไม่มีข้อความตอบกลับ"; `keyword_count === 0` → "ยังไม่มีคีย์เวิร์ด"; both zero → "ยังไม่พร้อมใช้งาน".
- variant: `is_active && incomplete` → `danger` (live-but-broken); `!is_active && incomplete` → `warning`.
- Placed on a second line under the name — never beside the ON/OFF toggle (reads as a contradiction).

### 8. Gate the list activation toggle
In `handleToggleStatus`, when enabling (`false→true`) a row with `keyword_count === 0 || response_count === 0`, block the PUT and show a Thai warning toast ("ต้องมีอย่างน้อย 1 คีย์เวิร์ดและ 1 ข้อความตอบกลับก่อนเปิดใช้งาน"). Forward-protective UX guard only (bypassable via API — see the follow-up issue).

### 9. ToastViewport a11y fix
`frontend/components/ui/Toast.tsx`: change `if (!mounted || toasts.length === 0) return null` → `if (!mounted) return null`, rendering the `role="region" aria-live="polite"` wrapper unconditionally so the first toast (the toggle-block warning) is announced.

## Tests (vitest + RTL; mock `next/navigation` useRouter, stub fetch, wrap in ToastProvider)
1. primary → POST body `is_active:false`, `push('/admin/auto-replies/123?created=1')`, no refetch, no reset.
2. secondary → POST then refetch, modal closed, form reset, no push.
3. double-click primary (controllable promise) → exactly one POST, buttons disabled in-flight.
4. 400 → `role="alert"` Thai duplicate message, no push, modal stays open, focus on name.
5. ok but body `{}` on configure → no push to `/undefined`, fallback refetch + warning.
6. `getReadiness`: warning when `!is_active && incomplete`, danger when `is_active && response_count===0`, null when both > 0.
7. toggle enable on incomplete row → warning toast, no PUT.
- Flush the mount-time `fetchCategories` (`setTimeout(0)`) before asserting click-triggered fetches.

## Out of scope → GitHub follow-up issue
`find_intent_keyword` has no `is_active` filter, and `webhook.py:382` (inactive category) / `:389` (no active responses) `return` without falling back to legacy AutoReply → an inactive/incomplete category whose keyword matches **silently swallows** the message. The list's `response_count` also counts inactive responses, so the badge is a heuristic (may show "ready" when all responses are inactive). This design minimizes exposure (draft-by-default + badge + toggle gate) but cannot fix it from the frontend.

## Rejected (YAGNI / out of scope)
`?mode=edit` landing; keep-modal-open batch; both inline-alert AND toast for create errors; auto-open the keyword add-form via URL param; hand-rolled amber badge classes; `loading.tsx` skeleton; backend `active_response_count` / PUT guard (deferred to the issue).
