---
name: react_19_patterns
description: >
  Modern React 19 patterns including new hooks, Server Actions, React Compiler, and best practices for Next.js 16.
  Reference standard for SKN App. Use when needing general guidance, 
  "อ้างอิง", "ดูคู่มือ", "standard".
compatibility: SKN App Project
metadata:
  category: reference
  tags: [reference, react-19-patterns]
---

# React 19 Patterns


## Context7 Docs

Context7 MCP is active. Always attempt to use `mcp__context7__resolve-library-id` for any libraries discussed in this standard to retrieve the most up-to-date documentation.

> **React 19.2.x + Next.js 16.1.x (January 2026)**

## 1. React Compiler (Auto-Memoization)

React 19 introduces the React Compiler for automatic memoization. **No more manual `useMemo`/`useCallback`**.

### Enable in Next.js
```typescript
// next.config.ts
const nextConfig = {
  reactCompiler: true,
};
```

### Before (React 18)
```tsx
'use client'
import { useMemo, useCallback } from 'react';

function ProductList({ products, filter }) {
  const filtered = useMemo(() => products.filter(p => p.name.includes(filter)), [products, filter]);
  const handleClick = useCallback((id) => console.log(id), []);
  return <List items={filtered} onClick={handleClick} />;
}
```

### After (React 19)
```tsx
'use client'
// Compiler handles optimization automatically
function ProductList({ products, filter }) {
  const filtered = products.filter(p => p.name.includes(filter));
  const handleClick = (id) => console.log(id);
  return <List items={filtered} onClick={handleClick} />;
}
```

---

## 2. New Hooks Overview

| Hook | Purpose | Use Case |
|------|---------|----------|
| `use()` | Unwrap Promises/Context | Data fetching, Context consumption |
| `useOptimistic()` | Optimistic UI | Instant feedback before server confirms |
| `useFormStatus()` | Form pending state | Submit button loading states |
| `useActionState()` | Action state management | Form errors, success states |

---

## 3. The `use()` Hook

Unwrap **Promises** and **Context** directly in render.

```tsx
'use client'
import { use, Suspense } from 'react';

const userPromise = fetchUser(1);

function UserProfile() {
  const user = use(userPromise);  // No useEffect needed
  return <div>{user.name}</div>;
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <UserProfile />
    </Suspense>
  );
}
```

### Context Consumption
```tsx
'use client'
import { use, createContext } from 'react';

const ThemeContext = createContext('light');

function Button() {
  const theme = use(ThemeContext);  // Replaces useContext
  return <button className={theme}>Click me</button>;
}
```

---

## 4. useOptimistic() for UI Updates

Show instant feedback while waiting for server confirmation.

```tsx
'use client'
import { useOptimistic, useRef } from 'react';
import { sendMessage } from './actions';

interface Message {
  id: string;
  text: string;
  sending?: boolean;
}

export function Chat({ initialMessages }: { initialMessages: Message[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [messages, addOptimistic] = useOptimistic(
    initialMessages,
    (state, msg: Message) => [...state, { ...msg, sending: true }]
  );
  
  async function formAction(formData: FormData) {
    const text = formData.get('message') as string;
    addOptimistic({ id: crypto.randomUUID(), text });  // Show instantly
    formRef.current?.reset();
    await sendMessage(text);
  }
  
  return (
    <>
      {messages.map(msg => (
        <div key={msg.id} style={{ opacity: msg.sending ? 0.5 : 1 }}>
          {msg.text}
        </div>
      ))}
      <form ref={formRef} action={formAction}>
        <input name="message" />
        <button type="submit">Send</button>
      </form>
    </>
  );
}
```

---

## 5. Server Actions

Form mutations without API endpoints.

```tsx
// app/actions.ts
'use server'
import { revalidatePath } from 'next/cache';

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string;
  const content = formData.get('content') as string;
  if (!title || title.length < 3) {
    return { error: 'Title must be at least 3 characters' };
  }
  await db.post.create({ data: { title, content } });
  revalidatePath('/posts');
}
```

```tsx
// app/posts/new/page.tsx
'use client'
import { createPost } from './actions';
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? 'Saving...' : 'Submit'}</button>;
}

export default function NewPostPage() {
  return (
    <form action={createPost}>
      <input name="title" placeholder="Title" required />
      <textarea name="content" placeholder="Content" />
      <SubmitButton />
    </form>
  );
}
```

---

## 6. useActionState() for Form Handling

Manage form submission state with errors and success messages.

```tsx
'use client'
import { useActionState } from 'react';
import { createUser } from './actions';

interface FormState {
  error?: string;
  success?: boolean;
  fieldErrors?: { email?: string; name?: string };
}

export function SignupForm() {
  const [state, formAction, pending] = useActionState(createUser, {});
  
  return (
    <form action={formAction}>
      <input name="email" type="email" placeholder="Email" />
      {state?.fieldErrors?.email && <span className="error">{state.fieldErrors.email}</span>}
      <input name="name" placeholder="Name" />
      {state?.fieldErrors?.name && <span className="error">{state.fieldErrors.name}</span>}
      
      <button type="submit" disabled={pending}>
        {pending ? 'Signing up...' : 'Sign Up'}
      </button>
      
      {state?.error && <div className="error">{state.error}</div>}
      {state?.success && <div className="success">Account created!</div>}
    </form>
  );
}
```

---

## 7. Ref as Prop (No forwardRef)

React 19 allows passing `ref` as a normal prop.

```tsx
// Before (React 18) - forwardRef boilerplate
const Input = forwardRef<HTMLInputElement, { label: string }>(
  ({ label }, ref) => <label>{label}<input ref={ref} /></label>
);

// After (React 19) - ref is just a prop
interface InputProps {
  label: string;
  ref?: React.Ref<HTMLInputElement>;
}

function Input({ label, ref }: InputProps) {
  return <label>{label}<input ref={ref} /></label>;
}

// Usage
function Form() {
  const inputRef = useRef<HTMLInputElement>(null);
  return <Input label="Name" ref={inputRef} />;
}
```

---

## Quick Reference

| Scenario | Pattern |
|----------|---------|
| Fetch data on initial render | Server Component (async) |
| Client-side data fetching | `use()` hook with Promise |
| Form submission | Server Action + `useActionState()` |
| Loading states | `useFormStatus()` |
| Instant UI feedback | `useOptimistic()` |
| Access Context | `use(Context)` instead of `useContext` |
| Pass ref to component | Direct prop (no `forwardRef`) |
| Memoization | React Compiler |

### Migration Checklist
- [ ] Enable `reactCompiler: true` in Next.js config
- [ ] Remove manual `useMemo`/`useCallback`
- [ ] Replace `forwardRef` with direct `ref` prop
- [ ] Use `use()` for Promise/Context unwrapping
- [ ] Migrate API endpoints to Server Actions
- [ ] Use `useOptimistic()` for instant feedback
- [ ] Use `useActionState()` for form state

---

## References

- **Hooks API Reference**: See [references/hooks_api.md](references/hooks_api.md) for detailed API specs
- **Server Actions Patterns**: See [references/server_actions.md](references/server_actions.md) for extended patterns
