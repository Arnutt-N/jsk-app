'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import PageHeader from '@/app/admin/components/PageHeader';
import { StaggerContainer, StaggerItem } from '@/components/ui/PageTransition';
import { apiFetch } from '@/lib/api-error';
import {
  Activity,
  Database,
  Wifi,
  Radio,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
} from 'lucide-react';

interface ServiceHealth {
  status: string;
  latency_ms?: number;
  connected?: boolean;
  error?: string;
  [key: string]: unknown;
}

interface DetailedHealth {
  timestamp: string;
  status: string;
  services: {
    database?: ServiceHealth;
    redis?: ServiceHealth;
    websocket?: ServiceHealth;
  };
}

type StatusLevel = 'healthy' | 'degraded' | 'unhealthy';

function statusToLevel(status: string): StatusLevel {
  if (status === 'healthy') return 'healthy';
  if (status === 'degraded') return 'degraded';
  return 'unhealthy';
}

const STATUS_VARIANT: Record<StatusLevel, 'success' | 'warning' | 'danger'> = {
  healthy: 'success',
  degraded: 'warning',
  unhealthy: 'danger',
};

const STATUS_LABEL: Record<StatusLevel, string> = {
  healthy: 'สถานะปกติ',
  degraded: 'ทำงานบางส่วน',
  unhealthy: 'มีปัญหา',
};
const STATUS_ICON: Record<StatusLevel, typeof CheckCircle> = {
  healthy: CheckCircle,
  degraded: AlertTriangle,
  unhealthy: XCircle,
};

const REFRESH_INTERVAL_MS = 30_000;

function ServiceCard({
  name,
  icon: Icon,
  service,
}: {
  name: string;
  icon: typeof Database;
  service?: ServiceHealth;
}) {
  const level = service ? statusToLevel(service.status) : 'unhealthy';
  const StatusIcon = STATUS_ICON[level];
  return (
    <StaggerItem>
      <Card variant="default" radius="lg" padding="md" className="h-full">
        <CardHeader divider>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className="w-5 h-5 text-text-secondary" />
              <CardTitle className="text-base">{name}</CardTitle>
            </div>
            <Badge variant={STATUS_VARIANT[level]} size="sm">
              <StatusIcon className="w-3 h-3" />
              {STATUS_LABEL[level]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-2">
          {service?.latency_ms !== undefined && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-text-tertiary" />
              <span className="text-text-secondary">Latency:</span>
              <span className="font-mono font-medium text-text-primary">{service.latency_ms} ms</span>
            </div>
          )}
          {service?.connected !== undefined && (
            <div className="flex items-center gap-2 text-sm">
              <Radio className="w-4 h-4 text-text-tertiary" />
              <span className="text-text-secondary">Connected:</span>
              <span className="font-mono font-medium text-text-primary">{service.connected ? 'Yes' : 'No'}</span>
            </div>
          )}
          {service?.error && (
            <div className="text-xs text-danger-text bg-danger/5 rounded-lg p-2 break-all">{service.error}</div>
          )}
          {!service && <div className="text-sm text-text-tertiary">ไม่พบข้อมูลสถานะ</div>}
        </CardContent>
      </Card>
    </StaggerItem>
  );
}
export default function HealthCheckPage() {
  const [health, setHealth] = useState<DetailedHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHealth = useCallback(async () => {
    const result = await apiFetch<DetailedHealth>('/api/v1/health/detailed');
    if (result.ok) { setHealth(result.data); setError(null); } else { setError(result.message); }
    setLoading(false);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    // Initial fetch on mount — setState inside async callback (not synchronous).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchHealth();
    intervalRef.current = setInterval(fetchHealth, REFRESH_INTERVAL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchHealth]);

  const overallLevel = health ? statusToLevel(health.status) : 'unhealthy';
  const OverallIcon = STATUS_ICON[overallLevel];
  const handleRefresh = () => { setLoading(true); fetchHealth(); };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title="Health Check" subtitle="ตรวจสอบสถานะระบบ — Database, Redis, WebSocket">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={loading}
          leftIcon={<RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />}
        >
          รีเฟรช
        </Button>
      </PageHeader>

      <Card variant="default" radius="lg" padding="lg" className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className={`flex items-center justify-center w-14 h-14 rounded-2xl ${overallLevel === 'healthy' ? 'bg-success/10' : overallLevel === 'degraded' ? 'bg-warning/10' : 'bg-danger/10'}`}>
            <OverallIcon className={`w-7 h-7 ${overallLevel === 'healthy' ? 'text-success-text' : overallLevel === 'degraded' ? 'text-warning-text' : 'text-danger-text'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-bold text-text-primary">สถานะระบบโดยรวม</h2>
              <Badge variant={STATUS_VARIANT[overallLevel]} size="md">{STATUS_LABEL[overallLevel]}</Badge>
            </div>
            {lastUpdated && (
              <p className="text-xs text-text-tertiary mt-1">
                อัปเดตล่าสุด: {lastUpdated.toLocaleTimeString('th-TH')}{' · '}รีเฟรชอัตโนมัติทุก {REFRESH_INTERVAL_MS / 1000} วินาที
              </p>
            )}
          </div>
          {health?.timestamp && (
            <div className="text-xs text-text-tertiary font-mono">{new Date(health.timestamp).toLocaleString('th-TH')}</div>
          )}
        </div>
      </Card>

      {error && (
        <Card variant="default" radius="lg" padding="md" className="mb-6 border-danger/30">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-danger-text flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-danger-text">ไม่สามารถดึงข้อมูลสถานะได้</p>
              <p className="text-xs text-text-tertiary break-all">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {loading && !health && (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner label="กำลังโหลดข้อมูลสถานะ..." fullPage={false} />
        </div>
      )}

      {health && (
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ServiceCard name="Database" icon={Database} service={health.services?.database} />
          <ServiceCard name="Redis" icon={Wifi} service={health.services?.redis} />
          <ServiceCard name="WebSocket" icon={Radio} service={health.services?.websocket} />
        </StaggerContainer>
      )}

      <div className="mt-6 flex items-center gap-2 text-xs text-text-tertiary">
        <Activity className="w-3.5 h-3.5" />
        <span>ข้อมูลจาก <code className="px-1 py-0.5 rounded bg-bg-secondary text-text-secondary font-mono">GET /api/v1/health/detailed</code></span>
      </div>
    </div>
  );
}
