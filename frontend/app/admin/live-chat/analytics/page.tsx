'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
    Users, MessageSquare, Clock, CheckCircle
} from 'lucide-react';
import { logger } from '@/lib/logger';
import CalendarPickerTH from '@/components/ui/CalendarPickerTH';
import { isoToYMD } from '@/lib/utils';

const CHART = {
    grid: 'var(--color-border-subtle, #e5e7eb)',
    tick: 'var(--color-text-tertiary, #94a3b8)',
    cursor: 'var(--color-muted, #f1f5f9)',
    line: 'var(--color-chart-1)',
    bar: 'var(--color-chart-2)',
};

interface AnalyticsSummary {
    total_sessions: number;
    avg_response_time: number;
    avg_resolution_time: number;
    total_messages: number;
}

interface DailyStat {
    date: string;
    total_sessions: number;
}

interface OperatorStat {
    operator_name?: string;
    total_sessions: number;
    avg_response_time: number;
    avg_resolution_time: number;
}

export default function AnalyticsPage() {
    const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
    const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
    const [operatorStats, setOperatorStats] = useState<OperatorStat[]>([]);
    const [dateRange, setDateRange] = useState({ from: '', to: '' });

    const API_BASE = '/api/v1';

    const fetchData = useCallback(async () => {
        try {
            const query = `?from_date=${dateRange.from}&to_date=${dateRange.to}`;

            const [analyticsRes, operatorsRes] = await Promise.all([
                fetch(`${API_BASE}/admin/live-chat/analytics${query}`),
                fetch(`${API_BASE}/admin/live-chat/analytics/operators${query}`)
            ]);

            if (analyticsRes.ok) {
                const data = await analyticsRes.json();
                setSummary(data.summary);
                setDailyStats(data.daily_stats);
            }

            if (operatorsRes.ok) {
                const data = await operatorsRes.json();
                setOperatorStats(data);
            }

        } catch (error) {
            logger.error("Failed to fetch analytics", error);
        }
    }, [API_BASE, dateRange.from, dateRange.to]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void fetchData();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchData]);

    return (
        <div className="h-full overflow-y-auto scrollbar-thin p-6 bg-bg thai-text">
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">Live Chat Analytics</h1>
                    <p className="text-text-secondary text-sm">monitor performance and team efficiency</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-44">
                        <CalendarPickerTH
                            value={dateRange.from || null}
                            onChange={(iso) => setDateRange(prev => ({ ...prev, from: isoToYMD(iso) }))}
                        />
                    </div>
                    <span className="self-center text-text-tertiary">-</span>
                    <div className="w-44">
                        <CalendarPickerTH
                            value={dateRange.to || null}
                            onChange={(iso) => setDateRange(prev => ({ ...prev, to: isoToYMD(iso) }))}
                        />
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard
                    title="Total Sessions"
                    value={summary?.total_sessions || 0}
                    icon={<MessageSquare className="w-5 h-5 text-primary" />}
                    color="bg-primary/8"
                />
                <StatCard
                    title="Avg Response Time"
                    value={`${summary?.avg_response_time || 0}s`}
                    icon={<Clock className="w-5 h-5 text-orange-600" />}
                    color="bg-orange-50"
                />
                <StatCard
                    title="Avg Resolution"
                    value={`${Math.round((summary?.avg_resolution_time || 0) / 60)}m`}
                    icon={<CheckCircle className="w-5 h-5 text-emerald-600" />}
                    color="bg-emerald-50"
                />
                <StatCard
                    title="Messages Sent"
                    value={summary?.total_messages || 0}
                    icon={<Users className="w-5 h-5 text-brand-600" />}
                    color="bg-brand-50"
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-surface p-6 rounded-2xl shadow-sm border border-border-default">
                    <h3 className="font-bold text-text-primary mb-4">Sessions Trend</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={dailyStats}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
                                <XAxis dataKey="date" tick={{ fontSize: 12, fill: CHART.tick }} />
                                <YAxis tick={{ fontSize: 12, fill: CHART.tick }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="total_sessions"
                                    stroke={CHART.line}
                                    strokeWidth={3}
                                    dot={{ r: 4, fill: CHART.line }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-surface p-6 rounded-2xl shadow-sm border border-border-default">
                    <h3 className="font-bold text-text-primary mb-4">Operator Workload</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={operatorStats}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
                                <XAxis dataKey="operator_name" tick={{ fontSize: 12, fill: CHART.tick }} />
                                <YAxis tick={{ fontSize: 12, fill: CHART.tick }} />
                                <Tooltip
                                    cursor={{ fill: CHART.cursor }}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
                                />
                                <Bar dataKey="total_sessions" fill={CHART.bar} radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Operator Table */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border-default overflow-hidden">
                <div className="px-6 py-4 border-b border-border-default">
                    <h3 className="font-bold text-text-primary">Operator Performance</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-muted">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">Operator</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">Sessions</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">Avg Response</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">Avg Resolution</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                            {operatorStats.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-text-tertiary text-sm">No data available</td>
                                </tr>
                            ) : (
                                operatorStats.map((op, i) => (
                                    <tr key={i} className="hover:bg-muted/50">
                                        <td className="px-6 py-4 text-sm font-medium text-text-primary">{op.operator_name || 'System'}</td>
                                        <td className="px-6 py-4 text-sm text-text-secondary">{op.total_sessions}</td>
                                        <td className="px-6 py-4 text-sm text-text-secondary">{op.avg_response_time}s</td>
                                        <td className="px-6 py-4 text-sm text-text-secondary">{Math.round(op.avg_resolution_time / 60)}m</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        </div>
    );
}

function StatCard({ title, value, icon, color }: { title: string, value: string | number, icon: React.ReactNode, color: string }) {
    return (
        <div className="ds-kpi flex items-center justify-between">
            <div>
                <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider">{title}</p>
                <p className="text-2xl font-bold text-text-primary mt-1 tracking-tight">{value}</p>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
                {icon}
            </div>
        </div>
    );
}
