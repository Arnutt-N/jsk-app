'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Progress,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import PageAccessGuard from '@/components/admin/PageAccessGuard';
import { StaggerContainer, StaggerItem } from '@/components/ui/PageTransition';

const screenshotFamilies = [
  { family: 'Dashboards', count: 5, path: 'examples/templates/*dashboards*' },
  { family: 'Apps', count: 17, path: 'examples/templates/*apps*' },
  { family: 'Pages', count: 27, path: 'examples/templates/*pages*' },
  { family: 'Forms', count: 22, path: 'examples/templates/*forms*' },
  { family: 'Components', count: 16, path: 'examples/templates/*components*' },
  { family: 'Wizard', count: 6, path: 'examples/templates/*wizard*' },
  { family: 'Front', count: 5, path: 'examples/templates/*front-pages*' },
  { family: 'Tables', count: 2, path: 'examples/templates/*tables*' },
  { family: 'Charts', count: 2, path: 'examples/templates/*charts*' },
  { family: 'Extensions', count: 1, path: 'examples/templates/*extensions*' },
];

export default function DesignSystemPage() {
  return (
    <PageAccessGuard allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
      <div className="ds-page">
        <section className="ds-hero">
        <p className="text-sm/6 text-white/80">Frontend Design System</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">JSK Admin UI Language</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/90">
          Tokenized components and layout patterns derived from screenshot references in
          {' '}
          <code className="rounded bg-white/15 px-1.5 py-0.5">examples/templates</code>.
        </p>
      </section>

      <StaggerContainer className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem>
        <div className="ds-kpi">
          <p className="text-xs font-medium text-gray-500">Color Model</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">HSL Tokens</p>
          <Badge variant="info" size="sm" className="mt-2">AA-ready text roles</Badge>
        </div>
        </StaggerItem>
        <StaggerItem>
        <div className="ds-kpi">
          <p className="text-xs font-medium text-gray-500">Component Set</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">20+ primitives</p>
          <Badge variant="success" size="sm" className="mt-2">CVA variants</Badge>
        </div>
        </StaggerItem>
        <StaggerItem>
        <div className="ds-kpi">
          <p className="text-xs font-medium text-gray-500">Reference Inputs</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">105 screenshots</p>
          <Badge variant="warning" size="sm" className="mt-2">Vuexy style families</Badge>
        </div>
        </StaggerItem>
        <StaggerItem>
        <div className="ds-kpi">
          <p className="text-xs font-medium text-gray-500">Theme Support</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">Light + Dark</p>
          <Badge variant="primary" size="sm" className="mt-2">Shared tokens</Badge>
        </div>
        </StaggerItem>
      </StaggerContainer>

      <Tabs defaultValue="components" className="ds-panel p-5">
        <TabsList>
          <TabsTrigger value="components">Components</TabsTrigger>
          <TabsTrigger value="patterns">Patterns</TabsTrigger>
          <TabsTrigger value="references">References</TabsTrigger>
        </TabsList>

        <TabsContent value="components" className="mt-5 space-y-5">
          <Card variant="default" hover="none">
            <CardHeader>
              <CardTitle>Buttons and Inputs</CardTitle>
              <CardDescription>Primary actions + clean form states</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button size="sm">Primary</Button>
                <Button variant="secondary" size="sm">Secondary</Button>
                <Button variant="outline" size="sm">Outline</Button>
                <Button variant="ghost" size="sm">Ghost</Button>
                <Button variant="danger" size="sm">Danger</Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input placeholder="Search customers..." />
                <Input state="error" errorMessage="Invalid email format" placeholder="name@example.com" />
              </div>
            </CardContent>
          </Card>

          <Card variant="default" hover="none">
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
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Queue Completion</p>
                <Progress value={72} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="patterns" className="mt-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card variant="gradient" hover="none">
              <CardHeader>
                <CardTitle>Dashboard Block</CardTitle>
                <CardDescription>Large hero card + compact KPI cells</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-brand-50 p-3">
                    <p className="text-xs text-brand-text">Orders</p>
                    <p className="text-lg font-semibold text-brand-text">12,740</p>
                  </div>
                  <div className="rounded-xl bg-success/10 p-3">
                    <p className="text-xs text-success-text">Resolved</p>
                    <p className="text-lg font-semibold text-success-text">3,421</p>
                  </div>
                  <div className="rounded-xl bg-danger/10 p-3">
                    <p className="text-xs text-danger-text">Escalations</p>
                    <p className="text-lg font-semibold text-danger-text">42</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card variant="elevated" hover="none">
              <CardHeader>
                <CardTitle>Panel Rhythm</CardTitle>
                <CardDescription>Header, content, and footer spacing scale</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-gray-600">
                  Use rounded 2xl panels, subtle borders, and low-contrast shadows for readable enterprise density.
                </p>
                <p className="text-sm text-gray-600">
                  Reserve gradients for high-value CTAs and summary surfaces.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="references" className="mt-5">
          <StaggerContainer className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {screenshotFamilies.map((item) => (
              <StaggerItem key={item.family}>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{item.family}</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{item.count} references</p>
                <code className="mt-2 block text-xs text-gray-600">{item.path}</code>
              </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </TabsContent>
        </Tabs>
      </div>
    </PageAccessGuard>
  );
}
