'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import PageHeader from '@/app/admin/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import {
  FileText,
  MessageSquare,
  Users,
  Headphones,
  UserPlus,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  TrendingUp,
  Calendar,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrendValue {
  current: number;
  previous: number;
  change_percent: number;
}

interface OverviewData {
  total_requests: number;
  requests_by_status: Record<string, number>;
  total_messages_today: number;
  messages_incoming_today: number;
  messages_outgoing_today: number;
  total_followers: number;
  active_sessions: number;
  requests_trend: TrendValue;
  messages_trend: TrendValue;
  followers_trend: TrendValue;
  sessions_trend: TrendValue;
  daily_activity: { day: string; requests: number; messages: number }[];
}

interface ServiceRequestReport {
  by_status: Record<string, number>;
  by_category: { category: string; count: number }[];
  over_time: { period: string; count: number }[];
  avg_resolution_days: number;
  top_categories: { category: string; count: number }[];
}

interface MessagesReport {
  over_time: { period: string; incoming: number; outgoing: number }[];
  incoming_total: number;
  outgoing_total: number;
  peak_hours: { hour: number; count: number }[];
}

interface OperatorRow {
  operator_id: number;
  operator_name: string;
  sessions_handled: number;
  avg_response_seconds: number;
  messages_sent: number;
}

interface OperatorsReport {
  operators: OperatorRow[];
}

interface FollowersReport {
  total_followers: number;
  new_this_period: number;
  lost_this_period: number;
  refollow_this_period: number;
  net_growth: number;
  refollow_rate: number;
  over_time: { period: string; gained: number; lost: number }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_COLORS = [
  'hsl(262 83% 58%)',  // brand
  'hsl(142 71% 45%)',  // success
  'hsl(38 92% 50%)',   // warning
  'hsl(0 84% 60%)',    // danger
  'hsl(199 89% 48%)',  // info
  'hsl(280 65% 60%)',  // purple
];

const PIE_COLORS = ['#7c3aed', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#14b8a6', '#f97316'];

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'รอดำเนินการ',
  IN_PROGRESS: 'กำลังดำเนินการ',
  AWAITING_APPROVAL: 'รออนุมัติ',
  COMPLETED: 'เสร็จสิ้น',
  REJECTED: 'ปฏิเสธ',
};

type DatePreset = '7d' | '30d' | '90d' | 'year' | 'custom';

function presetToDates(preset: DatePreset): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  switch (preset) {
    case '7d':
      start.setDate(end.getDate() - 7);
      break;
    case '30d':
      start.setDate(end.getDate() - 30);
      break;
    case '90d':
      start.setDate(end.getDate() - 90);
      break;
    case 'year':
      start.setMonth(0, 1);
      break;
    default:
      start.setDate(end.getDate() - 30);
  }
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '-';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TrendBadge({ trend }: { trend?: TrendValue }) {
  if (!trend) return null;
  const up = trend.change_percent >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const cls = up ? 'text-success' : 'text-danger';
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${cls}`}>
      <Icon className="w-3.5 h-3.5" />
      {Math.abs(trend.change_percent).toFixed(1)}%
    </span>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  color = 'brand',
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  trend?: TrendValue;
  color?: 'brand' | 'success' | 'warning' | 'danger';
}) {
  const colorMap = {
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10',
    success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10',
    warning: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10',
    danger: 'bg-red-50 text-red-600 dark:bg-red-500/10',
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className={`p-2.5 rounded-xl ${colorMap[color]}`}>
            <Icon className="w-5 h-5" />
          </div>
          <TrendBadge trend={trend} />
        </div>
        <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-1 thai-no-break">{label}</p>
        <p className="text-2xl font-bold text-text-primary">{value}</p>
      </CardContent>
    </Card>
  );
}

function ExportButton({
  type,
  startDate,
  endDate,
  token,
}: {
  type: string;
  startDate: string;
  endDate: string;
  token: string | null;
}) {
  const handleExport = async () => {
    const params = new URLSearchParams({ type, start_date: startDate, end_date: endDate });
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`/api/v1/admin/reports/export?${params}`, { headers });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${type}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
      <Download className="w-4 h-4" />
      ดาวน์โหลด CSV
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [datePreset, setDatePreset] = useState<DatePreset>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [loading, setLoading] = useState(false);

  // Data
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [srReport, setSrReport] = useState<ServiceRequestReport | null>(null);
  const [msgReport, setMsgReport] = useState<MessagesReport | null>(null);
  const [opsReport, setOpsReport] = useState<OperatorsReport | null>(null);
  const [folReport, setFolReport] = useState<FollowersReport | null>(null);

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : ({} as Record<string, string>)),
    [token],
  );

  const { start: startDate, end: endDate } = useMemo(() => {
    if (datePreset === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    return presetToDates(datePreset);
  }, [datePreset, customStart, customEnd]);

  const fetchTab = useCallback(
    async (tab: string) => {
      setLoading(true);
      const qs = `start_date=${startDate}&end_date=${endDate}&period=${period}`;
      try {
        switch (tab) {
          case 'overview': {
            const res = await fetch(`/api/v1/admin/reports/overview`, { headers: authHeaders });
            if (res.ok) setOverview(await res.json());
            break;
          }
          case 'requests': {
            const res = await fetch(`/api/v1/admin/reports/service-requests?${qs}`, { headers: authHeaders });
            if (res.ok) setSrReport(await res.json());
            break;
          }
          case 'messages': {
            const res = await fetch(`/api/v1/admin/reports/messages?${qs}`, { headers: authHeaders });
            if (res.ok) setMsgReport(await res.json());
            break;
          }
          case 'operators': {
            const res = await fetch(`/api/v1/admin/reports/operators?start_date=${startDate}&end_date=${endDate}`, { headers: authHeaders });
            if (res.ok) setOpsReport(await res.json());
            break;
          }
          case 'followers': {
            const res = await fetch(`/api/v1/admin/reports/followers?${qs}`, { headers: authHeaders });
            if (res.ok) setFolReport(await res.json());
            break;
          }
        }
      } catch (err) {
        console.error('Failed to fetch report:', err);
      } finally {
        setLoading(false);
      }
    },
    [authHeaders, startDate, endDate, period],
  );

  useEffect(() => {
    fetchTab(activeTab);
  }, [activeTab, fetchTab]);

  // ---------------------------------------------------------------------------
  // Render Helpers
  // ---------------------------------------------------------------------------

  const renderDateSelector = () => (
    <div className="flex items-center gap-2 flex-wrap">
      {([
        ['7d', '7 วัน'],
        ['30d', '30 วัน'],
        ['90d', '90 วัน'],
        ['year', 'ปีนี้'],
        ['custom', 'กำหนดเอง'],
      ] as [DatePreset, string][]).map(([key, label]) => (
        <Button
          key={key}
          variant={datePreset === key ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setDatePreset(key)}
          className="text-xs"
        >
          {label}
        </Button>
      ))}
      {datePreset === 'custom' && (
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="text-xs border border-border-default rounded-lg px-2 py-1.5 bg-surface text-text-primary"
          />
          <span className="text-text-tertiary text-xs">-</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="text-xs border border-border-default rounded-lg px-2 py-1.5 bg-surface text-text-primary"
          />
        </div>
      )}
    </div>
  );

  const renderPeriodSelector = () => (
    <div className="flex items-center gap-1">
      {([
        ['daily', 'รายวัน'],
        ['weekly', 'รายสัปดาห์'],
        ['monthly', 'รายเดือน'],
      ] as ['daily' | 'weekly' | 'monthly', string][]).map(([key, label]) => (
        <Button
          key={key}
          variant={period === key ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setPeriod(key)}
          className="text-xs"
        >
          {label}
        </Button>
      ))}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------------

  const renderOverview = () => {
    if (!overview) return null;
    return (
      <div className="space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="คำร้องทั้งหมด"
            value={overview.total_requests}
            icon={FileText}
            trend={overview.requests_trend}
            color="brand"
          />
          <StatCard
            label="ข้อความวันนี้"
            value={overview.total_messages_today}
            icon={MessageSquare}
            trend={overview.messages_trend}
            color="success"
          />
          <StatCard
            label="ผู้ติดตาม"
            value={overview.total_followers}
            icon={Users}
            trend={overview.followers_trend}
            color="warning"
          />
          <StatCard
            label="เซสชันแชทที่ใช้งาน"
            value={overview.active_sessions}
            icon={Headphones}
            trend={overview.sessions_trend}
            color="danger"
          />
        </div>

        {/* Quick charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-brand-500" />
                กิจกรรม 7 วันล่าสุด
              </CardTitle>
            </CardHeader>
            <CardContent className="h-64 pr-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overview.daily_activity}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="requests" name="คำร้อง" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="messages" name="ข้อความ" stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-500" />
                คำร้องแยกตามสถานะ
              </CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={Object.entries(overview.requests_by_status).map(([k, v]) => ({
                      name: STATUS_LABELS[k] || k,
                      value: v,
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {Object.keys(overview.requests_by_status).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderRequests = () => {
    if (!srReport) return null;
    const statusData = Object.entries(srReport.by_status).map(([k, v]) => ({
      name: STATUS_LABELS[k] || k,
      value: v,
    }));

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          {renderPeriodSelector()}
          <ExportButton type="service-requests" startDate={startDate} endDate={endDate} token={token} />
        </div>

        {/* Avg resolution */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="เวลาแก้ปัญหาเฉลี่ย"
            value={`${srReport.avg_resolution_days} วัน`}
            icon={Clock}
            color="brand"
          />
          <StatCard
            label="คำร้องทั้งหมดในช่วง"
            value={srReport.over_time.reduce((a, c) => a + c.count, 0)}
            icon={FileText}
            color="success"
          />
          <StatCard
            label="หมวดหมู่ยอดนิยม"
            value={srReport.top_categories[0]?.category || '-'}
            icon={TrendingUp}
            color="warning"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar chart by status */}
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold">คำร้องแยกตามสถานะ</CardTitle></CardHeader>
            <CardContent className="h-64 pr-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" name="จำนวน" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Pie by category */}
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold">คำร้องแยกตามหมวดหมู่</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={srReport.by_category.slice(0, 8)}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="count"
                    nameKey="category"
                    label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}
                  >
                    {srReport.by_category.slice(0, 8).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Line chart over time */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">คำร้องตามช่วงเวลา</CardTitle></CardHeader>
          <CardContent className="h-64 pr-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={srReport.over_time}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" name="จำนวนคำร้อง" stroke={CHART_COLORS[0]} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top categories table */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">หมวดหมู่ยอดนิยม</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>หมวดหมู่</TableHead>
                  <TableHead className="text-right">จำนวน</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {srReport.top_categories.map((cat, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium text-text-tertiary">{idx + 1}</TableCell>
                    <TableCell>{cat.category}</TableCell>
                    <TableCell className="text-right font-semibold">{cat.count}</TableCell>
                  </TableRow>
                ))}
                {srReport.top_categories.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-text-tertiary py-8">ไม่มีข้อมูล</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderMessages = () => {
    if (!msgReport) return null;
    const totalMessages = msgReport.incoming_total + msgReport.outgoing_total;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          {renderPeriodSelector()}
          <ExportButton type="messages" startDate={startDate} endDate={endDate} token={token} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="ข้อความทั้งหมด" value={totalMessages} icon={MessageSquare} color="brand" />
          <StatCard label="ข้อความขาเข้า" value={msgReport.incoming_total} icon={ArrowDownRight} color="success" />
          <StatCard label="ข้อความขาออก" value={msgReport.outgoing_total} icon={ArrowUpRight} color="warning" />
        </div>

        {/* Line chart incoming vs outgoing */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">ข้อความตามช่วงเวลา</CardTitle></CardHeader>
          <CardContent className="h-72 pr-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={msgReport.over_time}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="incoming" name="ขาเข้า" stroke={CHART_COLORS[1]} strokeWidth={2} />
                <Line type="monotone" dataKey="outgoing" name="ขาออก" stroke={CHART_COLORS[0]} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Peak hours */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">ชั่วโมงที่มีข้อความมากที่สุด</CardTitle></CardHeader>
          <CardContent className="h-64 pr-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={msgReport.peak_hours}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(h) => `${String(h).padStart(2, '0')}:00`}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={(h) => `${String(h).padStart(2, '0')}:00 น.`} />
                <Bar dataKey="count" name="จำนวนข้อความ" fill={CHART_COLORS[4]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderOperators = () => {
    if (!opsReport) return null;
    const chartData = opsReport.operators.map((op) => ({
      name: op.operator_name,
      sessions: op.sessions_handled,
      messages: op.messages_sent,
    }));

    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <ExportButton type="operators" startDate={startDate} endDate={endDate} token={token} />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="จำนวนเจ้าหน้าที่"
            value={opsReport.operators.length}
            icon={Headphones}
            color="brand"
          />
          <StatCard
            label="เซสชันทั้งหมด"
            value={opsReport.operators.reduce((a, o) => a + o.sessions_handled, 0)}
            icon={MessageSquare}
            color="success"
          />
          <StatCard
            label="ข้อความส่งทั้งหมด"
            value={opsReport.operators.reduce((a, o) => a + o.messages_sent, 0)}
            icon={ArrowUpRight}
            color="warning"
          />
        </div>

        {/* Bar chart */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">เซสชันต่อเจ้าหน้าที่</CardTitle></CardHeader>
          <CardContent className="h-64 pr-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="sessions" name="เซสชัน" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="messages" name="ข้อความ" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">รายละเอียดเจ้าหน้าที่</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>เจ้าหน้าที่</TableHead>
                  <TableHead className="text-center">เซสชัน</TableHead>
                  <TableHead className="text-center">เวลาตอบเฉลี่ย</TableHead>
                  <TableHead className="text-center">ข้อความส่ง</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opsReport.operators.map((op) => (
                  <TableRow key={op.operator_id}>
                    <TableCell className="font-medium">{op.operator_name}</TableCell>
                    <TableCell className="text-center">{op.sessions_handled}</TableCell>
                    <TableCell className="text-center">{formatDuration(op.avg_response_seconds)}</TableCell>
                    <TableCell className="text-center">{op.messages_sent}</TableCell>
                  </TableRow>
                ))}
                {opsReport.operators.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-text-tertiary py-8">ไม่มีข้อมูล</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderFollowers = () => {
    if (!folReport) return null;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          {renderPeriodSelector()}
          <ExportButton type="followers" startDate={startDate} endDate={endDate} token={token} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="ผู้ติดตามทั้งหมด" value={folReport.total_followers} icon={Users} color="brand" />
          <StatCard label="ผู้ติดตามใหม่" value={folReport.new_this_period} icon={UserPlus} color="success" />
          <StatCard label="ยกเลิกติดตาม" value={folReport.lost_this_period} icon={ArrowDownRight} color="danger" />
          <StatCard
            label="อัตราติดตามกลับ"
            value={`${folReport.refollow_rate}%`}
            icon={TrendingUp}
            color="warning"
          />
        </div>

        {/* Net growth */}
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${folReport.net_growth >= 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' : 'bg-red-50 text-red-600 dark:bg-red-500/10'}`}>
              {folReport.net_growth >= 0 ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownRight className="w-6 h-6" />}
            </div>
            <div>
              <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider thai-no-break">การเติบโตสุทธิ</p>
              <p className="text-2xl font-bold text-text-primary">
                {folReport.net_growth >= 0 ? '+' : ''}{folReport.net_growth}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Line chart */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">การเติบโตผู้ติดตาม</CardTitle></CardHeader>
          <CardContent className="h-72 pr-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={folReport.over_time}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="gained" name="ได้รับ" stroke={CHART_COLORS[1]} strokeWidth={2} />
                <Line type="monotone" dataKey="lost" name="สูญเสีย" stroke={CHART_COLORS[3]} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="thai-text space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="รายงานแบบสมบูรณ์"
        subtitle="ภาพรวมข้อมูลคำร้อง ข้อความ เจ้าหน้าที่ และผู้ติดตาม"
      >
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-text-tertiary" />
          {renderDateSelector()}
        </div>
      </PageHeader>

      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto flex-wrap">
          <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
          <TabsTrigger value="requests">คำร้อง</TabsTrigger>
          <TabsTrigger value="messages">ข้อความ</TabsTrigger>
          <TabsTrigger value="operators">เจ้าหน้าที่</TabsTrigger>
          <TabsTrigger value="followers">ผู้ติดตาม</TabsTrigger>
        </TabsList>

        {loading ? (
          <div className="py-16">
            <LoadingSpinner label="กำลังโหลดข้อมูล..." />
          </div>
        ) : (
          <>
            <TabsContent value="overview">{renderOverview()}</TabsContent>
            <TabsContent value="requests">{renderRequests()}</TabsContent>
            <TabsContent value="messages">{renderMessages()}</TabsContent>
            <TabsContent value="operators">{renderOperators()}</TabsContent>
            <TabsContent value="followers">{renderFollowers()}</TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
