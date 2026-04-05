'use client';

import React, { useState } from 'react';
import {
  Avatar,
  AvatarGroup,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Progress,
  Select,
  Separator,
  Skeleton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
} from '@/components/ui';
import { Alert } from '@/components/ui/Alert';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Timeline } from '@/components/ui/Timeline';
import PageAccessGuard from '@/components/admin/PageAccessGuard';
import { StaggerContainer, StaggerItem } from '@/components/ui/PageTransition';

/* ── Color token data ── */
const brandColors = [
  { name: '50',  bg: 'bg-brand-50' },
  { name: '100', bg: 'bg-brand-100' },
  { name: '200', bg: 'bg-brand-200' },
  { name: '300', bg: 'bg-brand-300' },
  { name: '400', bg: 'bg-brand-400' },
  { name: '500', bg: 'bg-brand-500' },
  { name: '600', bg: 'bg-brand-600' },
  { name: '700', bg: 'bg-brand-700' },
  { name: '800', bg: 'bg-brand-800' },
  { name: '900', bg: 'bg-brand-900' },
];

const semanticColors = [
  { name: 'Success', bg: 'bg-success' },
  { name: 'Warning', bg: 'bg-warning' },
  { name: 'Danger',  bg: 'bg-danger'  },
  { name: 'Info',    bg: 'bg-info'    },
  { name: 'Accent',  bg: 'bg-accent'  },
];

const statusColors = [
  { name: 'Online',  bg: 'bg-online'  },
  { name: 'Away',    bg: 'bg-away'    },
  { name: 'Busy',    bg: 'bg-busy'    },
  { name: 'Offline', bg: 'bg-offline' },
];

const chatColors = [
  { name: 'User',   bg: 'bg-chat-user'   },
  { name: 'Admin',  bg: 'bg-chat-admin'  },
  { name: 'Bot',    bg: 'bg-chat-bot'    },
  { name: 'System', bg: 'bg-chat-system' },
];

const chartColors = [
  { name: 'chart-1', bg: 'bg-chart-1' },
  { name: 'chart-2', bg: 'bg-chart-2' },
  { name: 'chart-3', bg: 'bg-chart-3' },
  { name: 'chart-4', bg: 'bg-chart-4' },
  { name: 'chart-5', bg: 'bg-chart-5' },
  { name: 'chart-6', bg: 'bg-chart-6' },
  { name: 'chart-7', bg: 'bg-chart-7' },
  { name: 'chart-8', bg: 'bg-chart-8' },
];

/* ── Component inventory ── */
const uiComponents = [
  'Accordion', 'ActionIconButton', 'Alert', 'Avatar', 'Badge', 'Button',
  'Calendar', 'Card', 'Chart', 'Checkbox', 'Command', 'ConfirmDialog',
  'DateRangePicker', 'DropdownMenu', 'EmptyState', 'ErrorBoundary',
  'FileUploadZone', 'Form', 'Input', 'Label', 'LoadingSpinner', 'Modal',
  'ModalAlert', 'PageTransition', 'Pagination', 'Popover', 'Progress',
  'RadioGroup', 'Select', 'Separator', 'Sheet', 'Skeleton', 'Switch',
  'Table', 'Tabs', 'Textarea', 'Timeline', 'Toast', 'Tooltip',
];

const adminComponents = [
  'AdminLanguageToggle', 'AdminSearchFilterBar', 'AdminTableHead',
  'AssignModal', 'BotStatusIndicator', 'CannedResponsePicker',
  'ConversationActionMenu', 'CredentialForm', 'PageAccessGuard',
  'SessionTimeoutWarning', 'SidebarItem', 'ThemeToggleSwitch', 'TypingIndicator',
];

/* ── Timeline demo data ── */
const timelineItems = [
  { date: '2026-04-05 10:30', title: 'User followed', type: 'follow' as const },
  { date: '2026-04-04 14:20', title: 'User unfollowed', type: 'unfollow' as const },
  { date: '2026-04-03 09:15', title: 'User re-followed', type: 'refollow' as const },
];

/* ── Color swatch component ── */
function ColorSwatch({ name, className }: { name: string; className: string }) {
  return (
    <div className="text-center">
      <div className={`h-10 w-full rounded-lg border border-gray-200 dark:border-gray-600 ${className}`} />
      <p className="mt-1 text-[10px] font-medium text-gray-500 dark:text-gray-400">{name}</p>
    </div>
  );
}

export default function DesignSystemPage() {
  const [switchChecked, setSwitchChecked] = useState(true);
  const [checkboxChecked, setCheckboxChecked] = useState(true);

  return (
    <PageAccessGuard allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
      <div className="ds-page">
        {/* ── Hero ── */}
        <section className="ds-hero">
          <p className="text-sm/6 text-white/80">Frontend Design System</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">JSK Admin UI Language</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/90">
            HSL token system, CVA component variants, responsive layouts,
            and dark mode support for the JskApp admin dashboard.
          </p>
        </section>

        {/* ── KPI Cards ── */}
        <StaggerContainer className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StaggerItem>
            <div className="ds-kpi">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Color Model</p>
              <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">HSL Tokens</p>
              <Badge variant="info" size="sm" className="mt-2">AA-ready text roles</Badge>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="ds-kpi">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">UI Primitives</p>
              <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{uiComponents.length} components</p>
              <Badge variant="success" size="sm" className="mt-2">CVA variants</Badge>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="ds-kpi">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Admin Components</p>
              <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{adminComponents.length} components</p>
              <Badge variant="warning" size="sm" className="mt-2">Domain-specific</Badge>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="ds-kpi">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Theme Support</p>
              <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">Light + Dark</p>
              <Badge variant="primary" size="sm" className="mt-2">Shared tokens</Badge>
            </div>
          </StaggerItem>
        </StaggerContainer>

        {/* ── Main Tabs ── */}
        <Tabs defaultValue="colors" className="ds-panel p-5">
          <TabsList>
            <TabsTrigger value="colors">Colors</TabsTrigger>
            <TabsTrigger value="components">Components</TabsTrigger>
            <TabsTrigger value="patterns">Patterns</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
          </TabsList>

          {/* ═══ Colors Tab ═══ */}
          <TabsContent value="colors" className="mt-5 space-y-6">
            {/* Brand Palette */}
            <Card variant="default" hover="none">
              <CardHeader>
                <CardTitle>Brand Palette</CardTitle>
                <CardDescription>Navy Blue — 10-step HSL scale with WCAG AA text token</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                  {brandColors.map((c) => (
                    <ColorSwatch key={c.name} name={c.name} className={c.bg} />
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Semantic Colors */}
            <Card variant="default" hover="none">
              <CardHeader>
                <CardTitle>Semantic Colors</CardTitle>
                <CardDescription>Success, Warning, Danger, Info, Accent — each with light/dark/text variants</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-4">
                  {semanticColors.map((c) => (
                    <div key={c.name} className="space-y-2">
                      <div className={`h-12 w-full rounded-lg ${c.bg}`} />
                      <p className="text-center text-xs font-medium text-gray-600 dark:text-gray-400">{c.name}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Status & Chat Colors */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card variant="default" hover="none">
                <CardHeader>
                  <CardTitle>Live Chat Status</CardTitle>
                  <CardDescription>Presence indicators</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4">
                    {statusColors.map((c) => (
                      <div key={c.name} className="flex items-center gap-2">
                        <div className={`h-3 w-3 rounded-full ${c.bg}`} />
                        <span className="text-sm text-gray-600 dark:text-gray-400">{c.name}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card variant="default" hover="none">
                <CardHeader>
                  <CardTitle>Chat Bubble Colors</CardTitle>
                  <CardDescription>Message source identification</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4">
                    {chatColors.map((c) => (
                      <div key={c.name} className="flex items-center gap-2">
                        <div className={`h-6 w-12 rounded-full ${c.bg}`} />
                        <span className="text-sm text-gray-600 dark:text-gray-400">{c.name}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Chart Colors */}
            <Card variant="default" hover="none">
              <CardHeader>
                <CardTitle>Chart Palette</CardTitle>
                <CardDescription>8-color series for Recharts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-8 gap-2">
                  {chartColors.map((c) => (
                    <ColorSwatch key={c.name} name={c.name} className={c.bg} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ Components Tab ═══ */}
          <TabsContent value="components" className="mt-5 space-y-5">
            {/* Buttons */}
            <Card variant="default" hover="none">
              <CardHeader>
                <CardTitle>Buttons</CardTitle>
                <CardDescription>9 variants × 4 sizes — gradient primary, semantic colors, ghost, link</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm">Primary</Button>
                  <Button variant="secondary" size="sm">Secondary</Button>
                  <Button variant="outline" size="sm">Outline</Button>
                  <Button variant="ghost" size="sm">Ghost</Button>
                  <Button variant="soft" size="sm">Soft</Button>
                  <Button variant="danger" size="sm">Danger</Button>
                  <Button variant="success" size="sm">Success</Button>
                  <Button variant="warning" size="sm">Warning</Button>
                  <Button variant="link" size="sm">Link</Button>
                </div>
                <Separator />
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="xs">XS</Button>
                  <Button size="sm">SM</Button>
                  <Button size="md">MD</Button>
                  <Button size="lg">LG</Button>
                  <Button size="sm" isLoading>Loading</Button>
                  <Button size="sm" disabled>Disabled</Button>
                </div>
              </CardContent>
            </Card>

            {/* Inputs & Forms */}
            <Card variant="default" hover="none">
              <CardHeader>
                <CardTitle>Inputs &amp; Forms</CardTitle>
                <CardDescription>Text input, textarea, select, checkbox, switch</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Input placeholder="Default input" />
                  <Input state="error" errorMessage="Invalid email format" placeholder="Error state" />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Textarea placeholder="Textarea component..." rows={2} />
                  <Select
                    options={[
                      { value: 'admin', label: 'Admin' },
                      { value: 'agent', label: 'Agent' },
                      { value: 'user', label: 'User' },
                    ]}
                    placeholder="Select role..."
                  />
                </div>
                <div className="flex flex-wrap items-center gap-6">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <Switch checked={switchChecked} onCheckedChange={setSwitchChecked} />
                    Switch {switchChecked ? 'On' : 'Off'}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <Checkbox checked={checkboxChecked} onCheckedChange={(val) => setCheckboxChecked(val === true)} />
                    Checkbox
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Badges */}
            <Card variant="default" hover="none">
              <CardHeader>
                <CardTitle>Badges</CardTitle>
                <CardDescription>7 semantic variants × 4 sizes × 3 appearances (filled, outline, soft)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="primary">Primary</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="success">Success</Badge>
                  <Badge variant="warning">Warning</Badge>
                  <Badge variant="danger">Danger</Badge>
                  <Badge variant="info">Info</Badge>
                  <Badge variant="gray">Gray</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="primary" appearance="outline">Outline</Badge>
                  <Badge variant="success" appearance="outline">Outline</Badge>
                  <Badge variant="danger" appearance="outline">Outline</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Alerts */}
            <Card variant="default" hover="none">
              <CardHeader>
                <CardTitle>Alerts</CardTitle>
                <CardDescription>5 variants with icon, title, and closable support</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Alert variant="primary" title="Information">This is a primary alert message.</Alert>
                <Alert variant="success" title="Success">Operation completed successfully.</Alert>
                <Alert variant="warning" title="Warning">Please check your configuration.</Alert>
                <Alert variant="danger" title="Error">Something went wrong.</Alert>
                <Alert variant="info">A simple info alert without title.</Alert>
              </CardContent>
            </Card>

            {/* Avatar */}
            <Card variant="default" hover="none">
              <CardHeader>
                <CardTitle>Avatars</CardTitle>
                <CardDescription>6 sizes, circle/square shape, fallback initials, AvatarGroup</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <Avatar size="xs" fallback="A" />
                  <Avatar size="sm" fallback="B" />
                  <Avatar size="md" fallback="C" />
                  <Avatar size="lg" fallback="D" />
                  <Avatar size="xl" fallback="E" />
                  <Avatar size="2xl" fallback="F" />
                </div>
                <div className="flex items-center gap-4">
                  <AvatarGroup>
                    <Avatar size="md" fallback="A" />
                    <Avatar size="md" fallback="B" />
                    <Avatar size="md" fallback="C" />
                    <Avatar size="md" fallback="+3" />
                  </AvatarGroup>
                  <span className="text-sm text-gray-500 dark:text-gray-400">AvatarGroup overlap</span>
                </div>
              </CardContent>
            </Card>

            {/* Progress, Skeleton, Spinner */}
            <Card variant="default" hover="none">
              <CardHeader>
                <CardTitle>Feedback</CardTitle>
                <CardDescription>Progress, Skeleton, LoadingSpinner, Tooltip</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Progress (72%)</p>
                  <Progress value={72} />
                </div>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Skeleton</p>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center gap-6">
                  <LoadingSpinner size="sm" fullPage={false} />
                  <Tooltip content="This is a tooltip!">
                    <Button variant="outline" size="sm">Hover for tooltip</Button>
                  </Tooltip>
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card variant="default" hover="none">
              <CardHeader>
                <CardTitle>Timeline</CardTitle>
                <CardDescription>Friend event history with follow/unfollow/refollow/block types</CardDescription>
              </CardHeader>
              <CardContent>
                <Timeline items={timelineItems} variant="compact" />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ Patterns Tab ═══ */}
          <TabsContent value="patterns" className="mt-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card variant="gradient" hover="none">
                <CardHeader>
                  <CardTitle>Dashboard KPI Block</CardTitle>
                  <CardDescription>Compact stat cells with semantic backgrounds</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-brand-50 dark:bg-brand-900/30 p-3">
                      <p className="text-xs text-brand-text dark:text-brand-300">Orders</p>
                      <p className="text-lg font-semibold text-brand-text dark:text-brand-200">12,740</p>
                    </div>
                    <div className="rounded-xl bg-success/10 p-3">
                      <p className="text-xs text-success-text dark:text-success-light">Resolved</p>
                      <p className="text-lg font-semibold text-success-text dark:text-success-light">3,421</p>
                    </div>
                    <div className="rounded-xl bg-danger/10 p-3">
                      <p className="text-xs text-danger-text dark:text-danger-light">Escalations</p>
                      <p className="text-lg font-semibold text-danger-text dark:text-danger-light">42</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card variant="elevated" hover="none">
                <CardHeader>
                  <CardTitle>Status Language</CardTitle>
                  <CardDescription>Consistent meaning across dashboard, chat, requests</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="warning">Waiting</Badge>
                    <Badge variant="success">Active</Badge>
                    <Badge variant="gray">Closed</Badge>
                    <Badge variant="info">Bot</Badge>
                    <Badge variant="danger">Urgent</Badge>
                    <Badge variant="primary">Assigned</Badge>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Queue Completion</p>
                    <Progress value={72} />
                  </div>
                </CardContent>
              </Card>

              <Card variant="default" hover="none">
                <CardHeader>
                  <CardTitle>Panel Rhythm</CardTitle>
                  <CardDescription>Layout and spacing conventions</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <p>• Rounded 2xl panels, subtle borders, low-contrast shadows</p>
                  <p>• Reserve gradients for high-value CTAs and summary surfaces</p>
                  <p>• StaggerContainer + StaggerItem for entrance animations</p>
                  <p>• Responsive sidebar collapses below 1024px</p>
                </CardContent>
              </Card>

              <Card variant="default" hover="none">
                <CardHeader>
                  <CardTitle>Typography</CardTitle>
                  <CardDescription>Fluid clamp scale with Thai font support</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">XS — <code className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1 rounded">var(--text-xs)</code></p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">SM — <code className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1 rounded">var(--text-sm)</code></p>
                  <p className="text-base text-gray-700 dark:text-gray-300">Base — <code className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1 rounded">var(--text-base)</code></p>
                  <p className="text-lg text-gray-800 dark:text-gray-200">LG — <code className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1 rounded">var(--text-lg)</code></p>
                  <p className="text-xl text-gray-900 dark:text-white">XL — <code className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1 rounded">var(--text-xl)</code></p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">2XL — <code className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1 rounded font-normal">var(--text-2xl)</code></p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ═══ Inventory Tab ═══ */}
          <TabsContent value="inventory" className="mt-5 space-y-5">
            <Card variant="default" hover="none">
              <CardHeader>
                <CardTitle>UI Primitives</CardTitle>
                <CardDescription>{uiComponents.length} components in <code className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs">components/ui/</code></CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {uiComponents.map((name) => (
                    <Badge key={name} variant="primary" appearance="outline" size="sm">{name}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card variant="default" hover="none">
              <CardHeader>
                <CardTitle>Admin Components</CardTitle>
                <CardDescription>{adminComponents.length} components in <code className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs">components/admin/</code></CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {adminComponents.map((name) => (
                    <Badge key={name} variant="info" appearance="outline" size="sm">{name}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card variant="default" hover="none">
              <CardHeader>
                <CardTitle>Design Tokens</CardTitle>
                <CardDescription>Token categories defined in <code className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs">globals.css @theme</code></CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { category: 'Brand Colors', count: 10, desc: 'Navy blue HSL scale 50-900' },
                    { category: 'Semantic Colors', count: 15, desc: 'Success, Warning, Danger, Info, Accent' },
                    { category: 'Text Colors', count: 5, desc: 'WCAG AA accessible text roles' },
                    { category: 'Gray Scale', count: 12, desc: 'Neutral 0-950' },
                    { category: 'Chart Palette', count: 8, desc: 'Recharts color series' },
                    { category: 'Chat Colors', count: 4, desc: 'User, Admin, Bot, System' },
                    { category: 'Status Colors', count: 4, desc: 'Online, Away, Busy, Offline' },
                    { category: 'Shadows', count: 8, desc: 'xs → 2xl + glow variants' },
                    { category: 'Spacing', count: 22, desc: '0px → 160px scale' },
                    { category: 'Border Radius', count: 9, desc: 'none → full' },
                    { category: 'Animations', count: 6, desc: 'Duration + easing curves' },
                    { category: 'Typography', count: 7, desc: 'Fluid clamp xs → 3xl' },
                  ].map((item) => (
                    <div key={item.category} className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{item.category}</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{item.count} tokens</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageAccessGuard>
  );
}
