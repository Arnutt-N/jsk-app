# Design System Cookbook

Updated: 2026-02-15  
Scope: Practical recipes for current JSK admin primitives (including Wave 1-3 migration additions).

## 1. How to Use This

- Prefer `frontend/components/ui` primitives before creating page-local UI.
- Use semantic tokens from `frontend/app/globals.css` (`brand`, `text-*`, `border-*`, `surface`, `status`).
- Keep high-usage components (`Button`, `Card`, `Badge`, `Modal`, `Toast`) unchanged unless explicitly planned.

## 2. Core Recipes

### 2.1 Action Row

```tsx
<div className="flex items-center justify-between gap-3">
  <h2 className="text-lg font-semibold text-text-primary">Section title</h2>
  <div className="flex items-center gap-2">
    <Button variant="secondary" size="sm">Cancel</Button>
    <Button variant="primary" size="sm">Save</Button>
  </div>
</div>
```

### 2.2 Form Field (RHF + Form primitives)

```tsx
<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
    <FormField
      control={form.control}
      name="email"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Email</FormLabel>
          <FormControl>
            <Input {...field} placeholder="user@example.com" />
          </FormControl>
          <FormDescription>Used for notifications.</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  </form>
</Form>
```

### 2.3 Data Table + Pagination

```tsx
<div className="space-y-3">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Status</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>Ticket #123</TableCell>
        <TableCell>
          <Badge variant="success">ACTIVE</Badge>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>

  <Pagination>
    <PaginationContent>
      <PaginationItem><PaginationPrevious href="#" /></PaginationItem>
      <PaginationItem><PaginationLink href="#" isActive>1</PaginationLink></PaginationItem>
      <PaginationItem><PaginationLink href="#">2</PaginationLink></PaginationItem>
      <PaginationItem><PaginationNext href="#" /></PaginationItem>
    </PaginationContent>
  </Pagination>
</div>
```

### 2.4 Popover + Calendar Date Filter

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" size="sm">Select date</Button>
  </PopoverTrigger>
  <PopoverContent className="w-auto p-0">
    <Calendar mode="single" selected={date} onSelect={setDate} />
  </PopoverContent>
</Popover>
```

### 2.5 Sheet (Detail/Settings Panel)

```tsx
<Sheet>
  <SheetTrigger asChild>
    <Button variant="secondary">Open Panel</Button>
  </SheetTrigger>
  <SheetContent side="right">
    <SheetHeader>
      <SheetTitle>Edit Profile</SheetTitle>
      <SheetDescription>Update user data and save changes.</SheetDescription>
    </SheetHeader>
    <div className="mt-4 space-y-3">
      <Input placeholder="Display name" />
      <Textarea placeholder="Internal notes" />
    </div>
  </SheetContent>
</Sheet>
```

### 2.6 Accordion Sections

```tsx
<Accordion type="single" collapsible>
  <AccordionItem value="general">
    <AccordionTrigger>General Settings</AccordionTrigger>
    <AccordionContent>Content for general settings.</AccordionContent>
  </AccordionItem>
</Accordion>
```

### 2.7 Command Palette

```tsx
<CommandDialog open={open} onOpenChange={setOpen}>
  <CommandInput placeholder="Search commands..." />
  <CommandList>
    <CommandEmpty>No results.</CommandEmpty>
    <CommandGroup heading="Navigation">
      <CommandItem onSelect={() => router.push('/admin')}>Dashboard</CommandItem>
      <CommandItem onSelect={() => router.push('/admin/live-chat')}>Live Chat</CommandItem>
    </CommandGroup>
  </CommandList>
</CommandDialog>
```

### 2.8 Destructive Confirmation (ConfirmDialog)

Use `ConfirmDialog` for ALL delete / cancel-cannot-be-undone actions. It
guarantees the same chrome across pages: danger icon, title, formatted
description, outline-Cancel + danger-Confirm buttons, optional loading
spinner. The `description` prop accepts `ReactNode` so the caller can
bold the item identifier and add a red warning footnote.

```tsx
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

<ConfirmDialog
  isOpen={isOpen}
  onClose={() => setOpen(false)}
  onConfirm={handleDelete}
  title="ยืนยันการลบ"
  description={
    <>
      คุณต้องการลบคำร้องของ <b>{name}</b> ใช่หรือไม่?
      <br />
      <span className="text-xs text-red-500 mt-2 block">
        คำร้องที่ลบไปแล้วจะไม่สามารถกู้คืนได้
      </span>
    </>
  }
  confirmText="ยืนยันลบ"
  cancelText="ยกเลิก"
  variant="danger"
  isLoading={submitting}
/>
```

Rules:
- One canonical wording for the warning: `X ที่ลบไปแล้วจะไม่สามารถกู้คืนได้`
  (positive negation, applied consistently across request / file /
  broadcast / integration).
- Use `<b>` to highlight the item identifier in the question, not red text.
- Use `variant="danger"` (default) for destructive intents. Use
  `variant="warning"` for irreversible but non-destructive actions (e.g.
  sending a broadcast).
- Do NOT use raw `<Modal>` for confirmations; reserve `Modal` for forms
  and content-bearing dialogs.

### 2.9 Chart Container

```tsx
<ChartContainer
  className="h-64"
  config={{
    messages: { label: 'Messages', color: 'hsl(var(--chart-1))' },
  }}
>
  <LineChart data={data}>
    <CartesianGrid vertical={false} />
    <XAxis dataKey="name" />
    <Line dataKey="messages" stroke="var(--color-messages)" strokeWidth={2} />
    <ChartTooltip content={<ChartTooltipContent />} />
  </LineChart>
</ChartContainer>
```

## 3. Text and Density Recipes

- Table metadata: `text-[10px] font-medium text-text-secondary`
- Chat timestamp: `text-[10px] text-text-tertiary`
- Section label: `text-xs font-semibold uppercase tracking-wider text-text-secondary`
- KPI value: `text-2xl font-bold text-text-primary`
- KPI label: `text-xs text-text-secondary`

## 4. Adoption Rules

- Additive-first: introduce new primitives without replacing richer existing ones.
- Import from `@/components/ui` index for consistency.
- Keep Thai readability with `thai-text` or `thai-no-break` on dense UI blocks.
