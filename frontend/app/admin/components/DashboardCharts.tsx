'use client';

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area,
} from 'recharts';

interface DashboardChartsProps {
    statusData: Array<{ name: string; value: number }>;
    monthlyData: Array<{ month: string; count: number }>;
}

const CHART_COLORS = {
    grid: 'var(--color-border-subtle, #f1f5f9)',
    tick: 'var(--color-text-tertiary, #64748b)',
    cursor: 'var(--color-muted, #f8fafc)',
    bar: 'var(--color-brand-500, #7367F0)',
    area: 'var(--color-success, #28C76F)',
};

export default function DashboardCharts({ statusData, monthlyData }: DashboardChartsProps) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6">
            {/* Request Status Chart */}
            <div className="bg-surface rounded-2xl p-6 shadow-sm border border-border-default">
                <h3 className="text-lg font-semibold text-text-primary mb-6 flex items-center gap-2">
                    <span className="w-1 h-5 bg-brand-500 rounded-full"></span>
                    Request Status Distribution
                </h3>
                <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={statusData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_COLORS.grid} />
                            <XAxis
                                dataKey="name"
                                tick={{ fill: CHART_COLORS.tick, fontSize: 12 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tick={{ fill: CHART_COLORS.tick, fontSize: 12 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                cursor={{ fill: CHART_COLORS.cursor }}
                            />
                            <Bar
                                dataKey="value"
                                fill={CHART_COLORS.bar}
                                radius={[4, 4, 0, 0]}
                                barSize={40}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Monthly Trends Chart */}
            <div className="bg-surface rounded-2xl p-6 shadow-sm border border-border-default">
                <h3 className="text-lg font-semibold text-text-primary mb-6 flex items-center gap-2">
                    <span className="w-1 h-5 bg-success rounded-full"></span>
                    Monthly Request Trends
                </h3>
                <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={monthlyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={CHART_COLORS.area} stopOpacity={0.2} />
                                    <stop offset="95%" stopColor={CHART_COLORS.area} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_COLORS.grid} />
                            <XAxis
                                dataKey="month"
                                tick={{ fill: CHART_COLORS.tick, fontSize: 12 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tick={{ fill: CHART_COLORS.tick, fontSize: 12 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="count"
                                stroke={CHART_COLORS.area}
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorRequests)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
