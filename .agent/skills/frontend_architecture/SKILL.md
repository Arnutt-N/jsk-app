---
name: frontend_architecture
description: >
  Enterprise standards for building scalable frontends with Next.js App Router, Tailwind, and React.
  Reference standard for SKN App. Use when needing general guidance, 
  "อ้างอิง", "ดูคู่มือ", "standard".
compatibility: SKN App Project
metadata:
  category: reference
  tags: [reference, frontend-architecture]
---

# Frontend Architecture (Next.js 16 + React 19)


## Context7 Docs

Context7 MCP is active. Always attempt to use `mcp__context7__resolve-library-id` for any libraries discussed in this standard to retrieve the most up-to-date documentation.

> **Updated for Next.js 16.1.x, React 19.2.x, and Tailwind CSS v4 (January 2026)**

## 1. Project Structure

```text
frontend/
├── app/
│   ├── (auth)/             # Auth Feature Group
│   │   └── login/page.tsx
│   ├── (dashboard)/        # Admin Feature Group
│   │   ├── layout.tsx      # Admin Shell
│   │   └── requests/
│   │       ├── page.tsx
│   │       └── components/ # Local components
│   ├── api/                # Route Handlers
│   ├── globals.css         # Tailwind v4 entry
│   ├── layout.tsx          # Root layout
│   ├── page.tsx
│   └── providers.tsx       # Client providers
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── layout/             # Header, Sidebar
│   └── shared/             # DataTable, Pagination
├── hooks/                  # Custom hooks
├── lib/
│   ├── prisma.ts           # Prisma singleton
│   ├── utils.ts            # cn() helper
│   └── api.ts              # Typed fetcher
├── services/               # API service functions
├── stores/                 # Zustand stores
└── types/                  # TypeScript interfaces
```

## 2. Server Components vs Client Components

- **Server First**: Default to Server Components.
- **"use client" Boundary**: Push client logic down the tree.
- **Data Fetching**: Fetch in `page.tsx` (Server), pass via props.

```tsx
// app/requests/page.tsx (Server)
export default async function RequestsPage() {
  const data = await getServiceRequests();
  return <RequestsDataTable initialData={data} />;
}

// components/request-data-table.tsx (Client)
"use client";
export function RequestsDataTable({ initialData }) {
  const [data, setData] = useState(initialData);
  // ... interaction logic
}
```

## 3. React 19 Features

### 3.1 React Compiler (Auto-Memoization)
Enabled via `reactCompiler: true` in `next.config.ts`. No manual `useMemo`/`useCallback` needed.

### 3.2 New Hooks
- **`use()`**: Unwrap Promises and Context directly
- **`useOptimistic()`**: Optimistic UI updates
- **`useFormStatus()`**: Access form pending state
- **`useActionState()`**: Server Action state management

### 3.3 Server Actions (Preferred for Mutations)
```tsx
// app/actions.ts
'use server'

export async function createUser(formData: FormData) {
  const name = formData.get('name');
  await prisma.user.create({ data: { name: String(name) } });
  revalidatePath('/users');
}
```

## 4. Tailwind CSS v4 Setup

### 4.1 `postcss.config.mjs`
```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
export default config;
```

### 4.2 `globals.css`
```css
@import "tailwindcss";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-prompt), ui-sans-serif, system-ui, sans-serif;
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
}

@layer base {
  body { @apply bg-background text-foreground; }
}
```

### 4.3 Key Changes from Tailwind v3
- Use `@import "tailwindcss"` instead of `@tailwind` directives
- Use `@theme inline {}` for CSS variable mapping
- No `tailwind.config.js` needed (config via CSS)
- New color format: `oklch()`

## 5. Form Management

### 5.1 React Hook Form + Zod
```tsx
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const form = useForm({
  resolver: zodResolver(schema),
  defaultValues: { email: "", password: "" }
});
```

### 5.2 Server Actions with Forms
```tsx
<form action={createUser}>
  <input name="name" />
  <SubmitButton />
</form>

// SubmitButton.tsx
'use client'
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? 'Saving...' : 'Save'}</button>;
}
```

## 6. UI Library & Styling

- **Tailwind CSS v4**: Utility-first CSS
- **shadcn/ui**: Headless components
- **Icons**: Lucide React
- **Theme**: `next-themes` for Dark Mode

### 6.1 `cn()` Helper
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

## 7. State Management

| State Type | Solution |
|------------|----------|
| URL State (filter, pagination) | `useSearchParams()` |
| Server Data | Server Components / TanStack Query |
| Global UI State | Zustand |
| Form State | React Hook Form |
| Optimistic Updates | `useOptimistic()` |

## 8. Performance

- **Dynamic Imports**: `next/dynamic` for heavy components
- **Image Optimization**: `next/image` strictly
- **Fonts**: `next/font/google` (Prompt for Thai)
- **Cache Components**: `cacheComponents: true` in config
