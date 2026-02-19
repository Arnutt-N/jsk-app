"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import PageHeader from "@/app/admin/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table";
import {
  Users,
  Clock,
  MessageSquare,
  CheckCircle,
  Star,
  BarChart3,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import { MessageType, WebSocketMessage } from "@/lib/websocket/types";

interface KPIData {
  waiting: number;
  active: number;
  avg_first_response_seconds: number;
  avg_resolution_seconds: number;
  csat_average: number;
  csat_percentage: number;
  fcr_rate: number;
  abandonment_rate?: number;
  sla_breach_events_24h?: number;
  sessions_today: number;
  human_mode_users: number;
  timestamp: string;
}

interface OperatorPerformance {
  operator_id: number;
  operator_name: string;
  total_sessions: number;
  avg_first_response_seconds: number;
  avg_resolution_seconds: number;
  avg_queue_wait_seconds: number;
  availability_seconds: number;
  availability_percent: number;
}

interface TrendMetric {
  current: number;
  previous: number;
  delta: number;
  delta_percent: number;
}

interface DashboardData {
  trends: {
    sessions_today: TrendMetric;
    avg_first_response_seconds: TrendMetric;
    avg_resolution_seconds: TrendMetric;
    csat_percentage: TrendMetric;
    fcr_rate: TrendMetric;
    abandonment_rate: TrendMetric;
  };
  session_volume: { day: string; sessions: number }[];
  peak_hours: { day_of_week: number; hour: number; message_count: number }[];
  funnel: { bot_entries: number; human_handoff: number; resolved: number };
  percentiles: {
    frt: { p50: number; p90: number; p99: number };
    resolution: { p50: number; p90: number; p99: number };
  };
}

// Semantic chart colors matching design tokens
const CHART_BRAND = 'hsl(262 83% 58%)';   // --color-brand-600
const CHART_SUCCESS = 'hsl(142 71% 45%)'; // --color-success
const CHART_BRAND_RGB = '124, 58, 237';   // brand-600 for rgba heatmap

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function TrendBadge({ metric }: { metric?: TrendMetric }) {
  if (!metric) return <span className="text-xs text-text-tertiary">vs yesterday</span>;
  const positive = metric.delta >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  const cls = positive ? "text-success-text" : "text-danger-text";
  return (
    <span className={`text-xs inline-flex items-center gap-1 ${cls}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(metric.delta_percent).toFixed(1)}%
    </span>
  );
}

export default function AnalyticsPage() {
  const { user, token } = useAuth();
  const [kpis, setKpis] = useState<KPIData | null>(null);
  const [operators, setOperators] = useState<OperatorPerformance[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(7);
  const [selectedOperator, setSelectedOperator] = useState<number | null>(null);

  const authHeaders = useMemo<HeadersInit>(
    () => (token ? { Authorization: `Bearer ${token}` } : ({} as HeadersInit)),
    [token]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const opQuery = selectedOperator ? `&operator_id=${selectedOperator}` : "";
      const [kpisRes, opsRes, dashRes] = await Promise.all([
        fetch("/api/v1/admin/analytics/live-kpis", { headers: authHeaders }),
        fetch(`/api/v1/admin/analytics/operator-performance?days=${days}${opQuery}`, { headers: authHeaders }),
        fetch(`/api/v1/admin/analytics/dashboard?days=${days}`, { headers: authHeaders }),
      ]);

      if (kpisRes.ok) setKpis(await kpisRes.json());
      if (opsRes.ok) setOperators(await opsRes.json());
      if (dashRes.ok) setDashboard(await dashRes.json());
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, days, selectedOperator]);

  const wsUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/api/v1/ws/live-chat`;
  }, []);

  const { connectionState, send } = useWebSocket({
    url: wsUrl,
    adminId: user?.id || "1",
    token: token || undefined,
    onMessage: (message: WebSocketMessage) => {
      if (message.type === MessageType.ANALYTICS_UPDATE) {
        setKpis(message.payload as KPIData);
      }
    },
  });

  useEffect(() => {
    if (connectionState === "connected") send(MessageType.SUBSCRIBE_ANALYTICS, {});
    return () => {
      if (connectionState === "connected") send(MessageType.UNSUBSCRIBE_ANALYTICS, {});
    };
  }, [connectionState, send]);

  useEffect(() => {
    fetchData();
    const shouldPoll = connectionState !== "connected";
    let interval: ReturnType<typeof setInterval> | undefined;
    if (shouldPoll) interval = setInterval(fetchData, 30000);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [connectionState, fetchData]);

  const heatmap = useMemo(() => {
    const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    (dashboard?.peak_hours || []).forEach((entry) => {
      matrix[entry.day_of_week][entry.hour] = entry.message_count;
    });
    const max = matrix.flat().reduce((acc, v) => (v > acc ? v : acc), 0);
    return { matrix, max };
  }, [dashboard]);

  const funnelRows = useMemo(
    () => [
      { stage: "Bot", value: dashboard?.funnel.bot_entries ?? 0 },
      { stage: "Human", value: dashboard?.funnel.human_handoff ?? 0 },
      { stage: "Resolved", value: dashboard?.funnel.resolved ?? 0 },
    ],
    [dashboard]
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader title="Live Analytics Dashboard">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-tertiary">Last</span>
            <Input
              type="number"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-20"
              min={1}
              max={30}
            />
            <span className="text-sm text-text-tertiary">days</span>
          </div>
          {selectedOperator && (
            <Button variant="outline" size="sm" onClick={() => setSelectedOperator(null)}>
              Clear Operator Filter
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </PageHeader>

      {loading && !kpis ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="h-32 rounded-xl border border-border-default bg-gray-100 dark:bg-gray-700 animate-pulse" />
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <Card className={kpis?.waiting ? "border-danger" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-text-tertiary flex items-center gap-2">
              <Users className="w-4 h-4" /> Waiting
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-danger">{kpis?.waiting ?? "-"}</div>
            <p className="text-xs text-text-tertiary mt-1">users in queue</p>
          </CardContent>
        </Card>

        <Card className={kpis?.active ? "border-success" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-text-tertiary flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Active Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-success">{kpis?.active ?? "-"}</div>
            <p className="text-xs text-text-tertiary mt-1">ongoing conversations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-text-tertiary flex items-center justify-between">
              <span className="flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Sessions Today</span>
              <TrendBadge metric={dashboard?.trends.sessions_today} />
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{kpis?.sessions_today ?? "-"}</div></CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-text-tertiary flex items-center gap-2">
              <Users className="w-4 h-4" /> Human Mode
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{kpis?.human_mode_users ?? "-"}</div></CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-text-tertiary flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> SLA Breaches (24h)
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{kpis?.sla_breach_events_24h ?? "-"}</div></CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-text-tertiary flex items-center justify-between">
              <span className="flex items-center gap-2"><Clock className="w-4 h-4" /> Avg First Response</span>
              <TrendBadge metric={dashboard?.trends.avg_first_response_seconds} />
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{kpis ? formatDuration(kpis.avg_first_response_seconds) : "-"}</div></CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-text-tertiary flex items-center justify-between">
              <span className="flex items-center gap-2"><Clock className="w-4 h-4" /> Avg Resolution</span>
              <TrendBadge metric={dashboard?.trends.avg_resolution_seconds} />
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{kpis ? formatDuration(kpis.avg_resolution_seconds) : "-"}</div></CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-text-tertiary flex items-center justify-between">
              <span className="flex items-center gap-2"><Star className="w-4 h-4" /> CSAT</span>
              <TrendBadge metric={dashboard?.trends.csat_percentage} />
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{kpis ? `${kpis.csat_percentage}%` : "-"}</div></CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-text-tertiary flex items-center justify-between">
              <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4" /> FCR</span>
              <TrendBadge metric={dashboard?.trends.fcr_rate} />
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{kpis ? `${kpis.fcr_rate}%` : "-"}</div></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Session Volume (Last {days} Days)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dashboard?.session_volume || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="sessions" stroke={CHART_BRAND} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Conversation Funnel</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="stage" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill={CHART_SUCCESS} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Peak Hours Heatmap</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
              {heatmap.matrix.map((row, day) =>
                row.map((value, hour) => {
                  const intensity = heatmap.max ? Math.max(0.08, value / heatmap.max) : 0;
                  return (
                    <div
                      key={`${day}-${hour}`}
                      className="h-4 rounded-sm"
                      title={`D${day} ${hour}:00 = ${value}`}
                      style={{ backgroundColor: `rgba(${CHART_BRAND_RGB}, ${intensity})` }}
                    />
                  );
                })
              )}
            </div>
            <p className="text-xs text-text-tertiary mt-3">Rows are day-of-week (0=Sun), columns are hour (0-23).</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Latency Percentiles</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium mb-1">First Response Time</p>
              <p className="text-sm text-text-secondary">
                P50: {formatDuration(dashboard?.percentiles.frt.p50 ?? 0)} | P90: {formatDuration(dashboard?.percentiles.frt.p90 ?? 0)} | P99: {formatDuration(dashboard?.percentiles.frt.p99 ?? 0)}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium mb-1">Resolution Time</p>
              <p className="text-sm text-text-secondary">
                P50: {formatDuration(dashboard?.percentiles.resolution.p50 ?? 0)} | P90: {formatDuration(dashboard?.percentiles.resolution.p90 ?? 0)} | P99: {formatDuration(dashboard?.percentiles.resolution.p99 ?? 0)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Operator Performance{selectedOperator ? ` (Operator #${selectedOperator})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {operators.length === 0 ? (
            <div className="text-center py-8 text-text-tertiary">No operator data available.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operator</TableHead>
                  <TableHead className="text-center">Sessions</TableHead>
                  <TableHead className="text-center">Avg First Response</TableHead>
                  <TableHead className="text-center">Avg Resolution</TableHead>
                  <TableHead className="text-center">Avg Queue Wait</TableHead>
                  <TableHead className="text-center">Availability</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operators.map((op) => (
                  <TableRow
                    key={op.operator_id}
                    className={cn(
                      'cursor-pointer',
                      selectedOperator === op.operator_id
                        ? 'bg-brand-50 dark:bg-brand-900/20'
                        : ''
                    )}
                    onClick={() => setSelectedOperator(op.operator_id)}
                  >
                    <TableCell>{op.operator_name}</TableCell>
                    <TableCell className="text-center">{op.total_sessions}</TableCell>
                    <TableCell className="text-center">{formatDuration(op.avg_first_response_seconds)}</TableCell>
                    <TableCell className="text-center">{formatDuration(op.avg_resolution_seconds)}</TableCell>
                    <TableCell className="text-center">{formatDuration(op.avg_queue_wait_seconds)}</TableCell>
                    <TableCell className="text-center">{op.availability_percent.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {kpis?.timestamp ? (
        <p className="text-xs text-text-tertiary text-right">Last updated: {new Date(kpis.timestamp).toLocaleString()}</p>
      ) : null}
    </div>
  );
}
