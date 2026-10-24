'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { format, subDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import type { TrendValue } from '@/components/ui/TrendBadge';
import StatsCard from '../components/StatsCard';
import PageHeader from '@/app/admin/components/PageHeader';
import { DateRangePicker, standardDatePresets } from '@/components/ui/DateRangePicker';
import { formatDuration } from '@/lib/format';
import { getStatusLabel } from '@/lib/constants/request-status';
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
import { StaggerContainer, StaggerItem } from '@/components/ui/PageTransition';
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
  RotateCcw,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-error';
import { useAuth } from '@/contexts/AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  'hsl(221 83% 53%)',  // brand (navy blue)
  'hsl(142 71% 45%)',  // success
  'hsl(38 92% 50%)',   // warning
  'hsl(0 84% 60%)',    // danger
  'hsl(199 89% 48%)',  // info
  'hsl(224 76% 48%)',  // brand-700
];

const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#2563eb', '#1d4ed8', '#14b8a6', '#f97316'];

type Period = 'daily' | 'weekly' | 'monthly';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function toTrend(trend?: TrendValue | null) {
  if (!trend) return undefined;
  return {
    value: Number(Math.abs(trend.change_percent).toFixed(1)),
    isPositive: trend.change_percent >= 0,
  };
}

async function downloadPDF(reportType: string, startDate: string, endDate: string) {
  const params = new URLSearchParams({
    report_type: reportType,
    start_date: startDate,
    end_date: endDate,
  });
  const result = await apiFetch<Response>(`/admin/reports/export/pdf?${params}`, { raw: true });
  if (!result.ok) return;
  const blob = await result.data.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `report_${reportType}_${new Date().toISOString().slice(0, 10)}.pdf`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function ExportButton({
  type,
  startDate,
  endDate,
}: {
  type: string;
  startDate: string;
  endDate: string;
}) {
  const { user } = useAuth();
  if (user?.role === 'VIEWER') return null;
  const handleExport = async () => {
    const params = new URLSearchParams({ type, start_date: startDate, end_date: endDate });
    const result = await apiFetch<Response>(`/admin/reports/export?${params}`, { raw: true });
    if (!result.ok) return;
    const blob = await result.data.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${type}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
        <Download className="w-4 h-4" />
        CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => downloadPDF(type, startDate, endDate)}
        className="gap-1.5"
      >
        <FileText className="w-4 h-4" />
        PDF
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const to = new Date();
    return { from: subDays(to, 30), to };
  });
  const [period, setPeriod] = useState<Period>('daily');
  const [loading, setLoading] = useState(false);

  // Data
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [srReport, setSrReport] = useState<ServiceRequestReport | null>(null);
  const [msgReport, setMsgReport] = useState<MessagesReport | null>(null);
  const [opsReport, setOpsReport] = useState<OperatorsReport | null>(null);
  const [folReport, setFolReport] = useState<FollowersReport | null>(null);

  const toYMD = (d: Date) => format(d, 'yyyy-MM-dd');
  const DEFAULT_RANGE_DAYS = 30;
  const isDefaultRange = (r: DateRange | undefined) => {
    if (!r?.from || !r.to) return false;
    const to = new Date();
    const diffDays = Math.round((to.getTime() - r.from.getTime()) / 86400000);
    return diffDays === DEFAULT_RANGE_DAYS && toYMD(r.to) === toYMD(to);
  };

  const { start: startDate, end: endDate } = useMemo(() => {
    const to = new Date();
    const from = range?.from ?? subDays(to, DEFAULT_RANGE_DAYS);
    const end = range?.to ?? range?.from ?? to;
    return { start: toYMD(from), end: toYMD(end) };
  }, [range]);

  const fetchTab = useCallback(
    async (tab: string) => {
      setLoading(true);
      const qs = `start_date=${startDate}&end_date=${endDate}&period=${period}`;
      try {
        switch (tab) {
          case 'overview': {
            const res = await apiFetch<OverviewData>('/admin/reports/overview');
            if (res.ok) setOverview(res.data);
            break;
          }
          case 'requests': {
            const res = await apiFetch<ServiceRequestReport>(`/admin/reports/service-requests?${qs}`);
            if (res.ok) setSrReport(res.data);
            break;
          }
          case 'messages': {
            const res = await apiFetch<MessagesReport>(`/admin/reports/messages?${qs}`);
            if (res.ok) setMsgReport(res.data);
            break;
          }
          case 'operators': {
            const res = await apiFetch<OperatorsReport>(`/admin/reports/operators?start_date=${startDate}&end_date=${endDate}`);
            if (res.ok) setOpsReport(res.data);
            break;
          }
          case 'followers': {
            const res = await apiFetch<FollowersReport>(`/admin/reports/followers?${qs}`);
            if (res.ok) setFolReport(res.data);
            break;
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [startDate, endDate, period],
  );

  useEffect(() => {
    fetchTab(activeTab);
  }, [activeTab, fetchTab]);

  // ---------------------------------------------------------------------------
  // Render Helpers
  // ---------------------------------------------------------------------------

  const hasActiveDateFilter = !isDefaultRange(range) || period !== 'daily';

  const clearDateFilters = () => {
    const to = new Date();
    setRange({ from: subDays(to, DEFAULT_RANGE_DAYS), to });
    setPeriod('daily');
  };

  const renderDateSelector = () => (
    <div className="flex items-center gap-2 flex-wrap">
      <DateRangePicker value={range} presets={standardDatePresets} onChange={(r) => setRange(r)} />
      {hasActiveDateFilter && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearDateFilters}
          leftIcon={<RotateCcw className="w-4 h-4" />}
          className="text-xs"
        >
          ล้างตัวกรอง
        </Button>
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
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StaggerItem>
            <StatsCard
              title="คำร้องทั้งหมด"
              value={overview.total_requests}
              icon={<FileText className="w-6 h-6" />}
              trend={toTrend(overview.requests_trend)}
              color="primary"
            />
          </StaggerItem>
          <StaggerItem>
            <StatsCard
              title="ข้อความวันนี้"
              value={overview.total_messages_today}
              icon={<MessageSquare className="w-6 h-6" />}
              trend={toTrend(overview.messages_trend)}
              color="success"
            />
          </StaggerItem>
          <StaggerItem>
            <StatsCard
              title="ผู้ติดตาม"
              value={overview.total_followers}
              icon={<Users className="w-6 h-6" />}
              trend={toTrend(overview.followers_trend)}
              color="warning"
            />
          </StaggerItem>
          <StaggerItem>
            <StatsCard
              title="เซสชันแชทที่ใช้งาน"
              value={overview.active_sessions}
              icon={<Headphones className="w-6 h-6" />}
              trend={toTrend(overview.sessions_trend)}
              color="danger"
            />
          </StaggerItem>
        </StaggerContainer>

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
                      name: getStatusLabel(k),
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
      name: getStatusLabel(k),
      value: v,
    }));

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          {renderPeriodSelector()}
          <ExportButton type="service-requests" startDate={startDate} endDate={endDate} />
        </div>

        {/* Avg resolution */}
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StaggerItem>
            <StatsCard
              title="เวลาแก้ปัญหาเฉลี่ย"
              value={`${srReport.avg_resolution_days} วัน`}
              icon={<Clock className="w-6 h-6" />}
              color="primary"
            />
          </StaggerItem>
          <StaggerItem>
            <StatsCard
              title="คำร้องทั้งหมดในช่วง"
              value={srReport.over_time.reduce((a, c) => a + c.count, 0)}
              icon={<FileText className="w-6 h-6" />}
              color="success"
            />
          </StaggerItem>
          <StaggerItem>
            <StatsCard
              title="หมวดหมู่ยอดนิยม"
              value={srReport.top_categories[0]?.category || '-'}
              icon={<TrendingUp className="w-6 h-6" />}
              color="warning"
            />
          </StaggerItem>
        </StaggerContainer>

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
          <ExportButton type="messages" startDate={startDate} endDate={endDate} />
        </div>

        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StaggerItem>
            <StatsCard title="ข้อความทั้งหมด" value={totalMessages} icon={<MessageSquare className="w-6 h-6" />} color="primary" />
          </StaggerItem>
          <StaggerItem>
            <StatsCard title="ข้อความขาเข้า" value={msgReport.incoming_total} icon={<ArrowDownRight className="w-6 h-6" />} color="success" />
          </StaggerItem>
          <StaggerItem>
            <StatsCard title="ข้อความขาออก" value={msgReport.outgoing_total} icon={<ArrowUpRight className="w-6 h-6" />} color="warning" />
          </StaggerItem>
        </StaggerContainer>

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
          <ExportButton type="operators" startDate={startDate} endDate={endDate} />
        </div>

        {/* Summary cards */}
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StaggerItem>
            <StatsCard
              title="จำนวนเจ้าหน้าที่"
              value={opsReport.operators.length}
              icon={<Headphones className="w-6 h-6" />}
              color="primary"
            />
          </StaggerItem>
          <StaggerItem>
            <StatsCard
              title="เซสชันทั้งหมด"
              value={opsReport.operators.reduce((a, o) => a + o.sessions_handled, 0)}
              icon={<MessageSquare className="w-6 h-6" />}
              color="success"
            />
          </StaggerItem>
          <StaggerItem>
            <StatsCard
              title="ข้อความส่งทั้งหมด"
              value={opsReport.operators.reduce((a, o) => a + o.messages_sent, 0)}
              icon={<ArrowUpRight className="w-6 h-6" />}
              color="warning"
            />
          </StaggerItem>
        </StaggerContainer>

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
          <ExportButton type="followers" startDate={startDate} endDate={endDate} />
        </div>

        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StaggerItem>
            <StatsCard title="ผู้ติดตามทั้งหมด" value={folReport.total_followers} icon={<Users className="w-6 h-6" />} color="primary" />
          </StaggerItem>
          <StaggerItem>
            <StatsCard title="ผู้ติดตามใหม่" value={folReport.new_this_period} icon={<UserPlus className="w-6 h-6" />} color="success" />
          </StaggerItem>
          <StaggerItem>
            <StatsCard title="ยกเลิกติดตาม" value={folReport.lost_this_period} icon={<ArrowDownRight className="w-6 h-6" />} color="danger" />
          </StaggerItem>
          <StaggerItem>
            <StatsCard
              title="อัตราติดตามกลับ"
              value={`${folReport.refollow_rate}%`}
              icon={<TrendingUp className="w-6 h-6" />}
              color="warning"
            />
          </StaggerItem>
        </StaggerContainer>

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
