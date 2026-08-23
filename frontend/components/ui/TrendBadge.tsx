'use client';

import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export interface TrendValue {
  current: number;
  previous: number;
  change_percent: number;
}

export interface TrendMetric {
  current: number;
  previous: number;
  delta: number;
  delta_percent: number;
}

interface TrendBadgeProps {
  /** Reports-style trend value; renders nothing when absent */
  trend?: TrendValue | null;
  /** Analytics-style metric; renders `placeholder` when absent */
  metric?: TrendMetric | null;
  placeholder?: React.ReactNode;
}

export function TrendBadge({ trend, metric, placeholder }: TrendBadgeProps) {
  if (trend) {
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
  if (metric) {
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
  return placeholder ?? null;
}

export default TrendBadge;
