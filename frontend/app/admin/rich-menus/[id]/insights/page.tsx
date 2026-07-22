"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format, subDays } from 'date-fns';
import {
  Eye,
  MousePointerClick,
  Users,
  ArrowLeft,
  AlertTriangle,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { DateRange } from 'react-day-picker';
import PageHeader from '@/app/admin/components/PageHeader';
import StatsCard from '@/app/admin/components/StatsCard';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { Card } from '@/components/ui/Card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { logger } from '@/lib/logger';
import { readErrorMessage } from '@/lib/api-error';

interface InsightMetric {
  count: number;
  unique_users: number;
}

interface InsightClickBound {
  bound: string;
  count: number;
  unique_users: number;
}

interface InsightSummary {
  rich_menu_id: string;
  metrics_from: string | null;
  metrics_to: string | null;
  impression: InsightMetric | null;
  clicks: InsightClickBound[] | null;
  privacy_restricted: boolean;
}

interface DailyMetricPoint {
  date: string;
  count: number;
  unique_users: number;
}

interface InsightDaily {
  rich_menu_id: string;
  metrics_from: string | null;
  metrics_to: string | null;
  impression: { metrics: DailyMetricPoint[] } | null;
  clicks: { bound: string; metrics: DailyMetricPoint[] }[] | null;
  privacy_restricted: boolean;
}

const BOUND_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

const insightPresets = [
  { label: '7 วัน', days: 7 },
  { label: '14 วัน', days: 14 },
  { label: '30 วัน', days: 30 },
  { label: '60 วัน', days: 60 },
  { label: '90 วัน', days: 90 },
];

function formatYyyymmdd(d: Date): string {
  return format(d, 'yyyyMMdd');
}

function formatDisplayDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}`;
}

export default function RichMenuInsightsPage() {
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();

  const [summary, setSummary] = useState<InsightSummary | null>(null);
  const [daily, setDaily] = useState<InsightDaily | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  const fetchInsights = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    setLoading(true);

    const from = formatYyyymmdd(dateRange.from);
    const to = formatYyyymmdd(dateRange.to);

    try {
      const [summaryRes, dailyRes] = await Promise.all([
        fetch(`/api/v1/admin/rich-menus/${id}/insights/summary?from=${from}&to=${to}`),
        fetch(`/api/v1/admin/rich-menus/${id}/insights/daily?from=${from}&to=${to}`),
      ]);

      if (summaryRes.ok) {
        setSummary(await summaryRes.json());
      } else {
        const msg = await readErrorMessage(summaryRes, 'ไม่สามารถโหลดข้อมูลสรุปได้');
        toast({ title: 'ผิดพลาด', description: msg, variant: 'error' });
      }

      if (dailyRes.ok) {
        setDaily(await dailyRes.json());
      } else {
        const msg = await readErrorMessage(dailyRes, 'ไม่สามารถโหลดข้อมูลรายวันได้');
        toast({ title: 'ผิดพลาด', description: msg, variant: 'error' });
      }
    } catch (error) {
      logger.error('Failed to fetch rich menu insights', error);
      toast({ title: 'ผิดพลาด', description: 'เกิดข้อผิดพลาดในการโหลดข้อมูล', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [id, dateRange, toast]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const chartData = daily?.impression?.metrics.map((m) => ({
    date: formatDisplayDate(m.date),
    impressions: m.count,
    uniqueUsers: m.unique_users,
  })) ?? [];

  const clickChartData = (() => {
    if (!daily?.clicks?.length) return [];
    const dateMap = new Map<string, Record<string, number>>();
    for (const click of daily.clicks) {
      for (const m of click.metrics) {
        const key = formatDisplayDate(m.date);
        if (!dateMap.has(key)) dateMap.set(key, { date: key } as unknown as Record<string, number>);
        const entry = dateMap.get(key)!;
        entry[`bound_${click.bound}`] = m.count;
      }
    }
    return Array.from(dateMap.values());
  })();

  const totalClicks = summary?.clicks?.reduce((sum, c) => sum + c.count, 0) ?? 0;
  const isRestricted = summary?.privacy_restricted || daily?.privacy_restricted;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 thai-text">
      <PageHeader title="สถิติ Rich Menu" subtitle="ข้อมูลการใช้งานจาก LINE Insight API">
        <div className="flex items-center gap-3">
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
            presets={insightPresets}
          />
          <Link
            href="/admin/rich-menus"
            className="flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </Link>
        </div>
      </PageHeader>

      {isRestricted && (
        <Card variant="default" className="p-4 border-amber-200 bg-amber-50/50 dark:bg-amber-500/5 dark:border-amber-500/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                ข้อมูลไม่เพียงพอ
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                LINE จะแสดงสถิติเมื่อมีผู้ใช้งานอย่างน้อย 20 คนในช่วงเวลาที่เลือก
              </p>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <LoadingSpinner label="กำลังโหลดสถิติ..." />
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatsCard
              title="Impressions"
              value={summary?.impression?.count?.toLocaleString() ?? '—'}
              icon={<Eye className="w-6 h-6" />}
              color="primary"
            />
            <StatsCard
              title="Unique Viewers"
              value={summary?.impression?.unique_users?.toLocaleString() ?? '—'}
              icon={<Users className="w-6 h-6" />}
              color="info"
            />
            <StatsCard
              title="Total Clicks"
              value={totalClicks.toLocaleString()}
              icon={<MousePointerClick className="w-6 h-6" />}
              color="success"
            />
          </div>

          {/* Charts */}
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
              <TabsTrigger value="clicks">คลิกตามปุ่ม</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <Card variant="default" className="p-5">
                <h3 className="text-sm font-semibold text-text-secondary mb-4">
                  Impressions รายวัน
                </h3>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorImpressions" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorUnique" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="impressions"
                        name="Impressions"
                        stroke="#6366f1"
                        fill="url(#colorImpressions)"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="uniqueUsers"
                        name="Unique Users"
                        stroke="#10b981"
                        fill="url(#colorUnique)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-text-tertiary text-sm">
                    <Info className="w-4 h-4 mr-2" />
                    ไม่มีข้อมูลในช่วงเวลาที่เลือก
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="clicks">
              <Card variant="default" className="p-5">
                <h3 className="text-sm font-semibold text-text-secondary mb-4">
                  คลิกแยกตามปุ่ม (Bounds)
                </h3>
                {clickChartData.length > 0 && daily?.clicks ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={clickChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      {daily.clicks.map((click, i) => (
                        <Bar
                          key={click.bound}
                          dataKey={`bound_${click.bound}`}
                          name={`ปุ่ม ${click.bound}`}
                          fill={BOUND_COLORS[i % BOUND_COLORS.length]}
                          radius={[2, 2, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-text-tertiary text-sm">
                    <Info className="w-4 h-4 mr-2" />
                    ไม่มีข้อมูลคลิกในช่วงเวลาที่เลือก
                  </div>
                )}
              </Card>

              {/* Click summary per bound */}
              {summary?.clicks && summary.clicks.length > 0 && (
                <Card variant="default" className="p-5 mt-4">
                  <h3 className="text-sm font-semibold text-text-secondary mb-3">
                    สรุปคลิกตามปุ่ม
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                    {summary.clicks.map((c, i) => (
                      <div
                        key={c.bound}
                        className="rounded-xl border border-border-default p-3 text-center"
                      >
                        <div
                          className="w-3 h-3 rounded-full mx-auto mb-1.5"
                          style={{ backgroundColor: BOUND_COLORS[i % BOUND_COLORS.length] }}
                        />
                        <p className="text-xs text-text-tertiary">ปุ่ม {c.bound}</p>
                        <p className="text-lg font-bold text-text-primary">{c.count.toLocaleString()}</p>
                        <p className="text-[10px] text-text-tertiary">{c.unique_users.toLocaleString()} users</p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </TabsContent>
          </Tabs>

          {/* Data range note */}
          {(summary?.metrics_from || daily?.metrics_from) && (
            <p className="text-xs text-text-tertiary flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              ช่วงข้อมูลจริง: {summary?.metrics_from ? formatDisplayDate(summary.metrics_from) : '—'} – {summary?.metrics_to ? formatDisplayDate(summary.metrics_to) : '—'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
