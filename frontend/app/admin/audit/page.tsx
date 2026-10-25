"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select, type SelectOption } from "@/components/ui/Select";
import { DatePresetFilter } from "@/components/admin/DatePresetFilter";
import { resolveDateRangeWithFallback } from "@/lib/date-range";
import { RefreshCw, Calendar, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { StaggerContainer, StaggerItem } from "@/components/ui/PageTransition";
import PageHeader from "../components/PageHeader";
import { logger } from '@/lib/logger';

interface AuditLog {
  id: number;
  admin_id: number;
  admin_name: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, unknown>;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

interface AuditStats {
  total_actions: number;
  action_breakdown: Record<string, number>;
  resource_breakdown: Record<string, number>;
  period_days: number;
}

const ACTION_COLORS: Record<string, string> = {
  "claim_session": "bg-info/12 text-info",
  "close_session": "bg-danger/12 text-danger",
  "transfer_session": "bg-warning/12 text-warning",
  "send_message": "bg-success/12 text-success",
  "create": "bg-brand-500/12 text-brand-600",
  "update": "bg-warning/12 text-warning",
  "delete": "bg-danger/12 text-danger",
  "login": "bg-muted text-text-secondary",
  "logout": "bg-muted text-text-secondary",
  // Request workflow. `status_change` is routine; `status_change_forced`
  // means a supervisor skipped workflow steps (the "บังคับเสร็จสิ้น" /
  // "ย้อนกลับ รอรับเรื่อง" kebab items) and is the row an auditor is
  // actually scanning for — so it gets danger, not another muted chip.
  "status_change": "bg-info/12 text-info",
  "status_change_forced": "bg-danger/12 text-danger",
  "revert_approval": "bg-warning/12 text-warning",
  "edit_request_details": "bg-brand-500/12 text-brand-600",
  "unassign": "bg-muted text-text-secondary",
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [datePreset, setDatePreset] = useState('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [filter, setFilter] = useState({
    action: "",
    resource_type: ""
  });

  const { start: startDate, end: endDate } = useMemo(() => {
    return resolveDateRangeWithFallback(datePreset, customStart, customEnd);
  }, [datePreset, customStart, customEnd]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      const statsParams = new URLSearchParams();
      params.append("start_date", startDate);
      params.append("end_date", endDate);
      statsParams.append("start_date", startDate);
      statsParams.append("end_date", endDate);
      if (filter.action) params.append("action", filter.action);
      if (filter.resource_type) params.append("resource_type", filter.resource_type);

      const [logsRes, statsRes] = await Promise.all([
        fetch(`/api/v1/admin/audit/logs?${params}`),
        fetch(`/api/v1/admin/audit/stats?${statsParams}`)
      ]);

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setLogs(logsData.logs);
        setTotal(logsData.total);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (error) {
      logger.error("Failed to fetch audit logs:", error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, filter.action, filter.resource_type, limit, offset]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const actionOptions: SelectOption[] = [
    { value: "", label: "ทุกการกระทำ" },
    ...Object.keys(stats?.action_breakdown ?? {}).sort((a, b) => a.localeCompare(b)).map((a) => ({ value: a, label: a })),
  ];
  const resourceOptions: SelectOption[] = [
    { value: "", label: "ทุกประเภททรัพยากร" },
    ...Object.keys(stats?.resource_breakdown ?? {}).sort((a, b) => a.localeCompare(b)).map((r) => ({ value: r, label: r })),
  ];
  const hasActiveFilter = filter.action !== "" || filter.resource_type !== "" || datePreset !== '30d' || customStart !== '' || customEnd !== '';

  const clearFilters = () => {
    setFilter({ action: "", resource_type: "" });
    setDatePreset('30d');
    setCustomStart('');
    setCustomEnd('');
    setOffset(0);
  };

  const renderDateSelector = () => (
    <DatePresetFilter
      preset={datePreset}
      customStart={customStart}
      customEnd={customEnd}
      onPresetChange={(key) => { setDatePreset(key); setOffset(0); }}
      onCustomStartChange={(v) => { setCustomStart(v); setOffset(0); }}
      onCustomEndChange={(v) => { setCustomEnd(v); setOffset(0); }}
      showClear={datePreset !== '30d' || customStart !== '' || customEnd !== '' || filter.action !== '' || filter.resource_type !== ''}
      onClear={clearFilters}
    />
  );

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  // Ranked breakdowns for the summary cards: top 3 rows each so all
  // three cards stay the same height regardless of data volume.
  const rankedActions = Object.entries(stats?.action_breakdown ?? {}).sort((a, b) => b[1] - a[1]);
  const topActions = rankedActions.slice(0, 3);
  const remainingActions = rankedActions.length - topActions.length;
  const rankedResources = Object.entries(stats?.resource_breakdown ?? {}).sort((a, b) => b[1] - a[1]);
  const topResources = rankedResources.slice(0, 3);
  const remainingResources = rankedResources.length - topResources.length;

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Logs">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-text-tertiary" />
          {renderDateSelector()}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchLogs}
          disabled={loading}
          leftIcon={<RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />}
        >
          รีเฟรช
        </Button>
      </PageHeader>

      {/* Stats Cards */}
      {stats && (
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
          <StaggerItem className="h-full">
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-tertiary">
                Total Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="text-2xl font-bold">{stats.total_actions}</div>
              <p className="mt-1 text-xs text-text-tertiary">
                ในช่วง {stats.period_days} วัน · เฉลี่ย {stats.period_days > 0 ? Math.round(stats.total_actions / stats.period_days) : stats.total_actions} รายการ/วัน
              </p>
            </CardContent>
          </Card>
          </StaggerItem>

          <StaggerItem className="h-full">
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-tertiary">
                Top Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              {topActions.length === 0 ? (
                <p className="text-xs text-text-tertiary">ไม่มีข้อมูลในช่วงนี้</p>
              ) : (
                <ol className="space-y-1.5">
                  {topActions.map(([action, count], idx) => (
                    <li key={action} className="flex items-center justify-between gap-2 rounded-lg bg-bg px-2.5 py-1.5 text-xs">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="font-bold text-text-tertiary">{idx + 1}.</span>
                        <span className="truncate font-medium text-text-primary" title={action}>{action}</span>
                      </span>
                      <Badge variant="secondary" className="shrink-0">{count}</Badge>
                    </li>
                  ))}
                </ol>
              )}
              {remainingActions > 0 && (
                <p className="mt-1.5 text-[11px] text-text-tertiary">+ อีก {remainingActions} รายการ</p>
              )}
            </CardContent>
          </Card>
          </StaggerItem>

          <StaggerItem className="h-full">
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-tertiary">
                By Resource Type
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              {topResources.length === 0 ? (
                <p className="text-xs text-text-tertiary">ไม่มีข้อมูลในช่วงนี้</p>
              ) : (
                <ol className="space-y-1.5">
                  {topResources.map(([type, count], idx) => (
                    <li key={type} className="flex items-center justify-between gap-2 rounded-lg bg-bg px-2.5 py-1.5 text-xs">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="font-bold text-text-tertiary">{idx + 1}.</span>
                        <span className="truncate font-medium text-text-primary" title={type}>{type}</span>
                      </span>
                      <Badge variant="secondary" className="shrink-0">{count}</Badge>
                    </li>
                  ))}
                </ol>
              )}
              {remainingResources > 0 && (
                <p className="mt-1.5 text-[11px] text-text-tertiary">+ อีก {remainingResources} รายการ</p>
              )}
            </CardContent>
          </Card>
          </StaggerItem>
        </StaggerContainer>
      )}

      {/* Filters */}
      <div className="bg-surface rounded-2xl border border-border-default p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row flex-wrap sm:items-center gap-4">
          <Select
            value={filter.action}
            onChange={(e) => {
              setFilter({ ...filter, action: e.target.value });
              setOffset(0);
            }}
            options={actionOptions}
            aria-label="เลือกการกระทำ"
            wrapperClassName="w-full sm:w-48"
          />
          <Select
            value={filter.resource_type}
            onChange={(e) => {
              setFilter({ ...filter, resource_type: e.target.value });
              setOffset(0);
            }}
            options={resourceOptions}
            aria-label="เลือกประเภททรัพยากร"
            wrapperClassName="w-full sm:w-48"
          />
          {hasActiveFilter && (
            <Button variant="ghost" size="sm" onClick={clearFilters} leftIcon={<RotateCcw className="w-4 h-4" />}>
              ล้างตัวกรอง
            </Button>
          )}
        </div>
      </div>

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-bg/50 border-b border-border-default">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Time</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Admin</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Action</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Resource</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Details</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">IP Address</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center px-6 py-8 text-text-tertiary">
                      No audit logs found.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-b border-border-default hover:bg-bg/50 transition-colors">
                      <td className="px-6 py-4 text-sm">
                        {new Date(log.created_at).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {log.admin_name || `Admin ${log.admin_id}`}
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          className={ACTION_COLORS[log.action] || "bg-gray-100 text-gray-800"}
                        >
                          {log.action}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className="text-text-tertiary">{log.resource_type}</span>
                        {log.resource_id && (
                          <span className="text-xs ml-1">({log.resource_id})</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm max-w-xs truncate">
                        {log.details ? JSON.stringify(log.details).slice(0, 50) + "..." : "-"}
                      </td>
                      <td className="px-6 py-4 text-sm text-text-tertiary">
                        {log.ip_address}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between py-4 px-4 border-t">
            <div className="text-sm text-text-tertiary">
              Showing {logs.length} of {total} results
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm">
                Page {currentPage} of {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
