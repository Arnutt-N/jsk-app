# Server Actions Patterns

Extended patterns and best practices for Server Actions in Next.js.

---

## Overview

Server Actions allow you to define server-side logic that can be called directly from client components. No API routes needed.

```tsx
// Define with 'use server'
'use server'

export async function actionName(formData: FormData) {
  // Runs on server
  // Can access database, call APIs, etc.
}
```

---

## Form Actions with useActionState

### Basic Pattern

```tsx
// app/actions.ts
'use server'

export async function createTodo(
  prevState: { error?: string; success?: boolean },
  formData: FormData
) {
  const title = formData.get('title') as string;
  
  if (!title.trim()) {
    return { error: 'Title is required' };
  }
  
  await db.todo.create({ data: { title } });
  return { success: true };
}
```

```tsx
// app/todos/form.tsx
'use client'
import { useActionState } from 'react';
import { createTodo } from './actions';

export function TodoForm() {
  const [state, formAction, pending] = useActionState(createTodo, {});
  
  return (
    <form action={formAction}>
      <input name="title" placeholder="New todo" />
      <button disabled={pending}>Add</button>
      {state.error && <p className="error">{state.error}</p>}
      {state.success && <p className="success">Todo added!</p>}
    </form>
  );
}
```

### Field-Level Validation

```tsx
// app/actions.ts
'use server'

interface FormState {
  fieldErrors?: {
    email?: string;
    password?: string;
  };
  error?: string;
}

export async function signup(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  
  const fieldErrors: FormState['fieldErrors'] = {};
  
  // Field validation
  if (!email.includes('@')) {
    fieldErrors.email = 'Invalid email format';
  }
  if (password.length < 8) {
    fieldErrors.password = 'Password must be at least 8 characters';
  }
  
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }
  
  // Process signup...
  try {
    await createUser(email, password);
    return {};
  } catch {
    return { error: 'Failed to create account' };
  }
}
```

---

## Optimistic Updates with Server Actions

### Full Implementation Pattern

```tsx
// app/messages/chat.tsx
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
  
  const [messages, optimisticAddMessage] = useOptimistic(
    initialMessages,
    (state, newMessage: Message) => [
      ...state,
      { ...newMessage, sending: true }
    ]
  );
  
  async function formAction(formData: FormData) {
    const text = formData.get('message') as string;
    const tempId = crypto.randomUUID();
    
    // 1. Show optimistic update immediately
    optimisticAddMessage({ id: tempId, text });
    
    // 2. Reset form
    formRef.current?.reset();
    
    // 3. Server action (on error, React reverts optimistic state)
    await sendMessage(text);
  }
  
  return (
    <div className="chat">
      {messages.map(msg => (
        <div 
          key={msg.id} 
          className={`message ${msg.sending ? 'sending' : ''}`}
        >
          {msg.text}
          {msg.sending && <span className="indicator">...</span>}
        </div>
      ))}
      <form ref={formRef} action={formAction}>
        <input name="message" required />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

### With Error Handling

```tsx
async function formAction(formData: FormData) {
  const text = formData.get('text') as string;
  const tempId = crypto.randomUUID();
  
  // Optimistic update
  optimisticAdd({ id: tempId, text });
  
  try {
    const result = await updateItem(tempId, text);
    // Success - optimistic state becomes permanent
  } catch (error) {
    // Error - React automatically reverts optimistic state
    // Show error to user
    toast.error('Failed to update');
  }
}
```

---

## Error Handling in Server Actions

### Try-Catch Patterns

```tsx
'use server'

// Pattern 1: Return error object
export async function safeAction(formData: FormData) {
  try {
    await riskyOperation();
    return { success: true };
  } catch (error) {
    return { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Pattern 2: Re-throw for error boundaries
export async function throwingAction(formData: FormData) {
  try {
    await riskyOperation();
  } catch (error) {
    // Log to monitoring service
    logError(error);
    // Re-throw to trigger error boundary
    throw error;
  }
}
```

### Validation Errors

```tsx
'use server'

import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  age: z.number().min(18),
});

export async function validatedAction(formData: FormData) {
  const data = Object.fromEntries(formData);
  
  const result = schema.safeParse(data);
  
  if (!result.success) {
    return {
      error: 'Validation failed',
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }
  
  // Process valid data
  await saveUser(result.data);
  return { success: true };
}
```

---

## Revalidation Patterns

### Path Revalidation

```tsx
'use server'

import { revalidatePath } from 'next/cache';

export async function createPost(formData: FormData) {
  await db.post.create({
    data: { title: formData.get('title') as string }
  });
  
  // Revalidate specific path
  revalidatePath('/posts');
  // Revalidate with layout
  revalidatePath('/posts', 'layout');
}
```

### Tag-Based Revalidation

```tsx
'use server'

import { revalidateTag } from 'next/cache';

// In your data fetching
async function getPosts() {
  const res = await fetch('/api/posts', {
    next: { tags: ['posts'] }
  });
  return res.json();
}

// Revalidate by tag
export async function updatePost(formData: FormData) {
  await db.post.update({ ... });
  revalidateTag('posts');
}
```

### On-Demand Revalidation

```tsx
'use server'

import { revalidatePath, revalidateTag } from 'next/cache';

export async function bulkUpdate(formData: FormData) {
  // Multiple operations
  await db.batchUpdate();
  
  // Revalidate everything
  revalidatePath('/', 'layout');
  revalidateTag('posts');
  revalidateTag('users');
}
```

---

## Complex Form Examples

### Multi-Step Form

```tsx
'use client'
import { useActionState } from 'react';
import { submitStep } from './actions';

interface StepState {
  step: number;
  data: Record<string, any>;
  error?: string;
}

export function MultiStepForm() {
  const [state, formAction, pending] = useActionState(
    submitStep,
    { step: 1, data: {} }
  );
  
  return (
    <form action={formAction}>
      <input type="hidden" name="step" value={state.step} />
      
      {state.step === 1 && (
        <StepOne defaultData={state.data} />
      )}
      {state.step === 2 && (
        <StepTwo defaultData={state.data} />
      )}
      
      <button disabled={pending}>
        {state.step === 2 ? 'Submit' : 'Next'}
      </button>
      
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
```

### File Upload with Progress

```tsx
'use client'
import { useState } from 'react';

export function UploadForm() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  async function handleSubmit(formData: FormData) {
    setUploading(true);
    
    // Use XMLHttpRequest for progress tracking
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress((e.loaded / e.total) * 100);
      }
    };
    
    // Or use Server Action for simple uploads
    await uploadFile(formData);
    setUploading(false);
  }
  
  return (
    <form action={handleSubmit}>
      <input type="file" name="file" required />
      {uploading && <ProgressBar value={progress} />}
      <button disabled={uploading}>
        {uploading ? 'Uploading...' : 'Upload'}
      </button>
    </form>
  );
}
```

### Dynamic Array Fields

```tsx
'use client'
import { useState } from 'react';
import { saveItems } from './actions';

export function DynamicForm() {
  const [fields, setFields] = useState([{ id: 1, value: '' }]);
  
  const addField = () => {
    setFields([...fields, { id: Date.now(), value: '' }]);
  };
  
  const removeField = (id: number) => {
    setFields(fields.filter(f => f.id !== id));
  };
  
  return (
    <form action={saveItems}>
      {fields.map((field, index) => (
        <div key={field.id}>
          <input 
            name={`items[${index}]`} 
            defaultValue={field.value}
            placeholder={`Item ${index + 1}`}
          />
          <button type="button" onClick={() => removeField(field.id)}>
            Remove
          </button>
        </div>
      ))}
      
      <button type="button" onClick={addField}>
        Add Item
      </button>
      <button type="submit">Save All</button>
    </form>
  );
}
```

---

## Best Practices

1. **Always validate input** - Never trust client data
2. **Return structured state** - Use consistent error/success patterns
3. **Use revalidation** - Keep cache in sync with mutations
4. **Handle errors gracefully** - Provide clear feedback to users
5. **Combine with optimistic updates** - For better perceived performance
6. **Progressive enhancement** - Forms work without JavaScript
