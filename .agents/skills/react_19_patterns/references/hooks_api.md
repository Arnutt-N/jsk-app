# Hooks API Reference

Detailed API specifications for React 19 hooks.

---

## `use()` Hook

Unwrap Promises and Context directly in render. Can be used conditionally.

### API Signature

```tsx
const value = use(resource);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `resource` | `Promise<T>` or `Context<T>` | A Promise or React Context to unwrap |

| Returns | Type | Description |
|---------|------|-------------|
| `value` | `T` | The resolved value |

### Error Handling

```tsx
'use client'
import { use, Suspense } from 'react';

function UserProfile({ userPromise }) {
  // If promise rejects, error bubbles to nearest Error Boundary
  const user = use(userPromise);
  return <div>{user.name}</div>;
}

// Wrap in Error Boundary for error handling
export default function Page() {
  return (
    <ErrorBoundary fallback={<ErrorView />}>
      <Suspense fallback={<Skeleton />}>
        <UserProfile userPromise={fetchUser()} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

### Conditional Context Consumption

```tsx
'use client'
import { use, createContext } from 'react';

const UserContext = createContext(null);

function Greeting({ userPromise }) {
  // Can use conditionally (unlike hooks)
  if (userPromise) {
    const user = use(userPromise);
    return <h1>Hello, {user.name}</h1>;
  }
  return <h1>Hello, Guest</h1>;
}
```

---

## `useOptimistic()` Hook

Add optimistic updates for instant UI feedback before server confirmation.

### API Signature

```tsx
const [optimisticState, addOptimistic] = useOptimistic(
  state,
  updateFn
);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `state` | `T` | The initial/current state |
| `updateFn` | `(currentState: T, optimisticValue: any) => T` | Function to compute optimistic state |

| Returns | Type | Description |
|---------|------|-------------|
| `optimisticState` | `T` | The current optimistic state |
| `addOptimistic` | `(value: any) => void` | Trigger an optimistic update |

### State Update Patterns

```tsx
'use client'
import { useOptimistic, useState } from 'react';

// Pattern 1: Array append
function MessageList({ initialMessages }) {
  const [messages, addOptimisticMessage] = useOptimistic(
    initialMessages,
    (state, newMessage) => [...state, { ...newMessage, sending: true }]
  );
}

// Pattern 2: Update existing item
function TodoList({ initialTodos }) {
  const [todos, addOptimisticTodo] = useOptimistic(
    initialTodos,
    (state, updatedTodo) =>
      state.map(t => t.id === updatedTodo.id ? { ...updatedTodo, pending: true } : t)
  );
}

// Pattern 3: Delete with rollback support
function ItemList({ items }) {
  const [optimisticItems, addOptimisticDelete] = useOptimistic(
    items,
    (state, itemId) => state.filter(item => item.id !== itemId)
  );
}
```

### Reverting Optimistic Updates

React automatically reverts optimistic updates if the action throws:

```tsx
async function formAction(formData: FormData) {
  const message = formData.get('message') as string;
  
  // 1. Show optimistic update immediately
  addOptimisticMessage({ id: tempId, text: message });
  
  try {
    // 2. Server confirms
    await sendMessage(message);
  } catch (error) {
    // 3. React automatically reverts optimistic state on error
    console.error('Failed to send:', error);
  }
}
```

---

## `useActionState()` Hook

Manage form action state with support for pending states and error handling.

### API Signature

```tsx
const [state, formAction, pending] = useActionState(
  action,
  initialState,
  permalink?
);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | `(state: State, formData: FormData) => Promise<State>` | The action function |
| `initialState` | `State` | Initial state value |
| `permalink?` | `string` | URL for progressive enhancement |

| Returns | Type | Description |
|---------|------|-------------|
| `state` | `State` | Current state returned by action |
| `formAction` | `(formData: FormData) => void` | Action to pass to form |
| `pending` | `boolean` | Whether action is in progress |

### State Shape Patterns

```tsx
// Simple error state
interface SimpleState {
  error?: string;
}

// Field-level errors
interface FieldState {
  fieldErrors?: {
    email?: string;
    password?: string;
  };
}

// Success with data
interface SuccessState<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Combined comprehensive state
interface FormState {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  data?: unknown;
}
```

### Server Action Integration

```tsx
// app/actions.ts
'use server'

export async function loginUser(
  prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  
  // Validation
  if (!email || !password) {
    return { error: 'All fields required' };
  }
  
  // Authentication
  try {
    await authenticate(email, password);
    return {}; // Success
  } catch {
    return { error: 'Invalid credentials' };
  }
}
```

---

## `useFormStatus()` Hook

Access form submission status from any child component of a form.

### API Signature

```tsx
const { pending, data, method, action } = useFormStatus();
```

| Property | Type | Description |
|----------|------|-------------|
| `pending` | `boolean` | True while form is submitting |
| `data` | `FormData \| null` | The form data being submitted |
| `method` | `string` | HTTP method ('get' or 'post') |
| `action` | `string \| ((formData: FormData) => void) \| null` | Form action |

### Component Usage Patterns

```tsx
'use client'
import { useFormStatus } from 'react-dom';

// Submit button with loading state
function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Saving...' : children}
    </button>
  );
}

// Progress indicator showing what's being saved
function SaveIndicator() {
  const { pending, data } = useFormStatus();
  
  if (!pending) return null;
  
  const title = data?.get('title') as string;
  return <span>Saving "{title}"...</span>;
}

// Multiple status components share same status
function FormStatusBar() {
  const { pending, method } = useFormStatus();
  
  return (
    <div className="status-bar">
      {pending && (
        <>
          <Spinner />
          <span>{method === 'post' ? 'Creating' : 'Updating'}...</span>
        </>
      )}
    </div>
  );
}
```

### Important Notes

- Only works inside `<form>` elements
- Returns status of the **nearest parent form**
- Multiple components can read the same status
- Data is `null` when not pending

---

## Hook Comparison Table

| Hook | When to Use | Key Benefit |
|------|-------------|-------------|
| `use()` | Unwrap Promises/Context in render | No useEffect needed, works conditionally |
| `useOptimistic()` | Instant feedback before server confirm | Better perceived performance |
| `useActionState()` | Form submissions with server actions | Built-in pending/error states |
| `useFormStatus()` | Access form status from child components | Decouple submit buttons from forms |

### Decision Flow

```
Need to handle a form submission?
├── Using Server Actions?
│   ├── Need form errors/success state? → useActionState()
│   └── Need pending state in button? → useFormStatus()
├── Want instant UI feedback? → useOptimistic() + useActionState()
└── Standard form? → useFormStatus() for pending state

Need to read data in render?
├── Promise or Context? → use()
└── Other state? → useState/useReducer
```
