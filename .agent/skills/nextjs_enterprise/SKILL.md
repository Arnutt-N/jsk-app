---
name: nextjs_enterprise
description: >
  Best practices for building scalable Next.js applications using the App Router.
  Reference standard for SKN App. Use when needing general guidance, 
  "อ้างอิง", "ดูคู่มือ", "standard".
compatibility: SKN App Project
metadata:
  category: reference
  tags: [reference, nextjs-enterprise]
---

# Next.js 16 + React 19 Enterprise Development Standards


## Context7 Docs

Context7 MCP is active. Always attempt to use `mcp__context7__resolve-library-id` for any libraries discussed in this standard to retrieve the most up-to-date documentation.

> **Updated for Next.js 16.1.x and React 19.2.x (January 2026)**

## 1. Project Structure (App Router)

```text
frontend/
├── app/
│   ├── (auth)/             # Route Group (Clean URL structure)
│   │   └── login/page.tsx
│   ├── admin/
│   │   ├── page.tsx
│   │   └── layout.tsx
│   ├── api/                # Route Handlers (Back-for-Front)
│   │   └── users/route.ts
│   ├── globals.css         # Tailwind v4 entry point
│   ├── layout.tsx          # Root layout with Metadata
│   ├── page.tsx
│   └── providers.tsx       # Client-side providers (TanStack Query)
├── components/
│   └── ui/                 # shadcn/ui components
├── hooks/                  # Custom React Hooks
├── lib/
│   ├── prisma.ts           # Prisma singleton
│   ├── axios.ts            # Axios instance
│   └── utils.ts            # cn() helper
├── services/               # API service functions
├── types/                  # Global TypeScript interfaces
├── next.config.ts          # TypeScript config (not .js)
├── postcss.config.mjs      # ESM PostCSS config
├── eslint.config.mjs       # ESLint flat config
├── tsconfig.json
└── package.json
```

## 2. Next.js 16 Configuration (`next.config.ts`)

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',        // Docker-ready output
  reactCompiler: true,         // NEW: React Compiler for auto-memoization
  cacheComponents: true,       // NEW: Cache Components feature
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
    ],
  },
};

export default nextConfig;
```

## 3. Tailwind CSS v4 Setup

### 3.1 `postcss.config.mjs`
```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},  // NEW: v4 uses dedicated postcss plugin
  },
};
export default config;
```

### 3.2 `globals.css`
```css
@import "tailwindcss";  /* NEW: v4 uses @import instead of @tailwind directives */

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
}

@layer base {
  body {
    @apply bg-background text-foreground;
  }
}
```

### 3.3 `package.json` Dependencies
```json
{
  "dependencies": {
    "next": "16.1.1",
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "tailwindcss": "^4",
    "typescript": "^5",
    "@types/react": "19.2.7",
    "@types/react-dom": "19.2.3"
  },
  "overrides": {
    "@types/react": "19.2.7",
    "@types/react-dom": "19.2.3"
  }
}
```

## 4. ESLint Flat Config (`eslint.config.mjs`)

```javascript
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
```

## 5. Coding Standards

### 5.1 Server Components vs Client Components
- **Default to Server Components**: Fetch data in `page.tsx` or `layout.tsx`.
- Use `"use client"` **only** for interactive leaves (buttons, forms, hooks).
- Pass data from Server → Client via props.

### 5.2 API Route Handlers (`route.ts`)
```typescript
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  const data = await prisma.user.findMany();
  return NextResponse.json({ success: true, data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  // validation & create
  return NextResponse.json({ success: true }, { status: 201 });
}
```

### 5.3 Prisma Singleton Pattern
```typescript
// src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const prismaClientSingleton = () => new PrismaClient();

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;

export default prisma;
```

### 5.4 TanStack Query Provider
```typescript
// app/providers.tsx
'use client'

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

export default function AppQueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

### 5.5 Utils (`cn()` helper)
```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

## 6. React 19 Features

- **React Compiler**: Enabled via `reactCompiler: true` in `next.config.ts`. Provides automatic memoization.
- **`use()` Hook**: Can unwrap Promises and Context directly.
- **Server Actions**: Preferred for form mutations.
- **`useOptimistic()`**: For optimistic UI updates.
- **`useFormStatus()`**: Access form pending state.

## 7. shadcn/ui Integration

Install components as needed:
```bash
npx shadcn@latest init
npx shadcn@latest add button card
```

Use with the `cn()` utility for conditional classes:
```tsx
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

<Button className={cn("w-full", isLoading && "opacity-50")}>
  Submit
</Button>
```

## 8. LIFF Integration (Unchanged)
- Load LIFF SDK only on the client side (`useEffect`).
- Handle `liff.init()` promise errors gracefully.
- Show a "Loading" skeleton while verifying LIFF context.
