'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Clock, Zap, CheckCircle2 } from 'lucide-react';
import PageAccessGuard from '@/components/admin/PageAccessGuard';
import { StaggerContainer, StaggerItem } from '@/components/ui/PageTransition';
import StatsCard from './components/StatsCard';
import ChartsWrapper from './components/ChartsWrapper';

async function fetchWithTimeout(url: string, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const res = await fetch(url, {
            cache: 'no-store',
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);
        return res;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

type RequestStats = Record<string, number>;
type MonthlyDataPoint = { month: string; count: number };

function getErrorMessage(error: unknown): string {
    if (error instanceof DOMException && error.name === 'AbortError') {
        return 'The request timed out. Please try again.';
    }

    if (error instanceof TypeError) {
        return 'Could not connect to the backend server.';
    }

    return 'Failed to load service data.';
}

async function getRequestData() {
    const API_BASE = '/api/v1';

    // Use Promise.allSettled to handle partial failures gracefully
    const [statsResult, monthlyResult] = await Promise.allSettled([
        fetchWithTimeout(`${API_BASE}/admin/requests/stats`),
        fetchWithTimeout(`${API_BASE}/admin/requests/stats/monthly`)
    ]);

    // Process stats result
    let requestStats: RequestStats | null = null;
    let errorMessage: string | null = null;
    if (statsResult.status === 'fulfilled' && statsResult.value.ok) {
        try {
            requestStats = await statsResult.value.json();
        } catch {
            errorMessage ??= 'Received an invalid stats response from the backend.';
        }
    } else if (statsResult.status === 'rejected') {
        errorMessage ??= getErrorMessage(statsResult.reason);
    }

    // Process monthly data result
    let monthlyData: MonthlyDataPoint[] = [];
    if (monthlyResult.status === 'fulfilled' && monthlyResult.value.ok) {
        try {
            monthlyData = await monthlyResult.value.json();
        } catch {
            errorMessage ??= 'Received an invalid monthly stats response from the backend.';
        }
    } else if (monthlyResult.status === 'rejected') {
        errorMessage ??= getErrorMessage(monthlyResult.reason);
    }

    // Only show error if both requests failed
    const bothFailed = statsResult.status === 'rejected' && monthlyResult.status === 'rejected';
    const error = bothFailed
        ? errorMessage ?? 'Failed to load service data. Please check if the backend is running.'
        : null;

    return { requestStats, monthlyData, error };
}

export default function ServiceDashboard() {
    const [requestStats, setRequestStats] = useState<RequestStats | null>(null);
    const [monthlyData, setMonthlyData] = useState<MonthlyDataPoint[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchDashboardData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getRequestData();
            setRequestStats(data.requestStats);
            setMonthlyData(data.monthlyData);
            setError(data.error);
        } catch {
            setRequestStats(null);
            setMonthlyData([]);
            setError('Failed to load service data. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => { void fetchDashboardData(); }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchDashboardData]);

    if (loading) {
        return (
            <PageAccessGuard allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
                <div className="flex min-h-[320px] items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
                </div>
            </PageAccessGuard>
        );
    }

    const statusData = requestStats ? [
        { name: 'Pending', value: requestStats.pending },
        { name: 'Active', value: requestStats.in_progress },
        { name: 'Completed', value: requestStats.completed },
        { name: 'Rejected', value: requestStats.rejected }
    ] : [];

    const content = error ? (
                <div className="p-8 text-center bg-red-50 text-red-600 rounded-2xl border border-red-100 animate-fade-in-up dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400">
                <h2 className="text-lg font-bold mb-2 text-red-800 dark:text-red-300">Connection Error</h2>
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
    ) : (
        <div className="space-y-6 animate-fade-in-up thai-text">
            <div className="ds-panel ds-panel-body flex justify-between items-center hover:shadow-md transition-shadow duration-300">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight thai-no-break dark:text-gray-100">Service Requests</h1>
                    <p className="text-gray-500 text-sm mt-0.5 dark:text-gray-400">Citizen service management and analytics</p>
                </div>
                <div className="text-sm text-gray-500 font-medium dark:text-gray-400">
                    {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
                </div>
            </div>

            {/* Stats Cards Row */}
            <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                <StaggerItem>
                    <StatsCard
                        title="Total Requests"
                        value={requestStats?.total || 0}
                        icon={<FileText className="w-6 h-6" />}
                        color="primary"
                        link="/admin/requests"
                    />
                </StaggerItem>
                <StaggerItem>
                    <StatsCard
                        title="Pending Approval"
                        value={requestStats?.pending || 0}
                        icon={<Clock className="w-6 h-6" />}
                        color="warning"
                        link="/admin/requests?status=PENDING"
                        description="Requires Attention"
                    />
                </StaggerItem>
                <StaggerItem>
                    <StatsCard
                        title="In Progress"
                        value={requestStats?.in_progress || 0}
                        icon={<Zap className="w-6 h-6" />}
                        color="info"
                        link="/admin/requests?status=IN_PROGRESS"
                        description="Currently Active"
                    />
                </StaggerItem>
                <StaggerItem>
                    <StatsCard
                        title="Completed"
                        value={requestStats?.completed || 0}
                        icon={<CheckCircle2 className="w-6 h-6" />}
                        color="success"
                        link="/admin/requests?status=COMPLETED"
                        description="Successfully Resolved"
                    />
                </StaggerItem>
            </StaggerContainer>

            {/* Analytics Charts */}
            <ChartsWrapper statusData={statusData} monthlyData={monthlyData} />

        </div>
    );

    return (
        <PageAccessGuard allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
            {content}
        </PageAccessGuard>
    );
}
