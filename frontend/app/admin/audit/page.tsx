"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { StaggerContainer, StaggerItem } from "@/components/ui/PageTransition";
import PageHeader from "../components/PageHeader";

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
  "send_message": "bg-success/12 text-success",
  "create": "bg-brand-500/12 text-brand-600",
  "update": "bg-warning/12 text-warning",
  "delete": "bg-danger/12 text-danger",
  "login": "bg-muted text-text-secondary",
  "logout": "bg-muted text-text-secondary",
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [days, setDays] = useState(7);
  const [filter, setFilter] = useState({
    action: "",
    resource_type: ""
  });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        days: String(days)
      });
      if (filter.action) params.append("action", filter.action);
      if (filter.resource_type) params.append("resource_type", filter.resource_type);

      const [logsRes, statsRes] = await Promise.all([
        fetch(`/api/v1/admin/audit/logs?${params}`),
        fetch(`/api/v1/admin/audit/stats?days=${days}`)
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
      console.error("Failed to fetch audit logs:", error);
    } finally {
      setLoading(false);
    }
  }, [days, filter.action, filter.resource_type, limit, offset]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Logs">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-tertiary">Last</span>
          <Input
            type="number"
            value={days}
            onChange={(e) => {
              setDays(Number(e.target.value));
              setOffset(0);
            }}
            className="w-20"
            min={1}
            max={90}
          />
          <span className="text-sm text-text-tertiary">days</span>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </PageHeader>

      {/* Stats Cards */}
      {stats && (
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StaggerItem>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-tertiary">
                Total Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_actions}</div>
            </CardContent>
          </Card>
          </StaggerItem>

          <StaggerItem>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-tertiary">
                Top Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {Object.entries(stats.action_breakdown)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([action, count]) => (
                    <Badge key={action} variant="secondary" className="text-xs">
                      {action}: {count}
                    </Badge>
                  ))}
              </div>
            </CardContent>
          </Card>
          </StaggerItem>

          <StaggerItem>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-tertiary">
                By Resource Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {Object.entries(stats.resource_breakdown)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([type, count]) => (
                    <Badge key={type} variant="secondary" className="text-xs">
                      {type}: {count}
                    </Badge>
                  ))}
              </div>
            </CardContent>
          </Card>
          </StaggerItem>
        </StaggerContainer>
      )}

      {/* Filters */}
      <div className="bg-surface rounded-2xl border border-border-default p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4">
          <Input
            placeholder="Filter by action..."
            value={filter.action}
            onChange={(e) => {
              setFilter({ ...filter, action: e.target.value });
              setOffset(0);
            }}
            className="w-full sm:w-48"
          />
          <Input
            placeholder="Filter by resource type..."
            value={filter.resource_type}
            onChange={(e) => {
              setFilter({ ...filter, resource_type: e.target.value });
              setOffset(0);
            }}
            className="w-full sm:w-48"
          />
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
                        {new Date(log.created_at).toLocaleString()}
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
