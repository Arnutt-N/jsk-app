'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple';
  link?: string;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

const colorMap = {
  primary: {
    iconBg: 'bg-gradient-to-br from-brand-100 to-brand-50',
    text: 'text-brand-600',
    glow: 'group-hover:shadow-brand-500/20',
  },
  success: {
    iconBg: 'bg-gradient-to-br from-success/15 to-success/5',
    text: 'text-success-text',
    glow: 'group-hover:shadow-success/20',
  },
  warning: {
    iconBg: 'bg-gradient-to-br from-warning/15 to-warning/5',
    text: 'text-warning-text',
    glow: 'group-hover:shadow-warning/20',
  },
  danger: {
    iconBg: 'bg-gradient-to-br from-danger/15 to-danger/5',
    text: 'text-danger-text',
    glow: 'group-hover:shadow-danger/20',
  },
  info: {
    iconBg: 'bg-gradient-to-br from-info/15 to-info/5',
    text: 'text-info-text',
    glow: 'group-hover:shadow-info/20',
  },
  purple: {
    iconBg: 'bg-gradient-to-br from-brand-100 to-brand-50',
    text: 'text-brand-600',
    glow: 'group-hover:shadow-brand-500/20',
  },
};

export default function StatsCard({
  title,
  value,
  icon,
  color,
  link,
  description,
  trend
}: StatsCardProps) {
  const colors = colorMap[color];

  const Content = (
    <div className="grid grid-cols-[auto_1fr] items-start gap-4 h-full">
      <div
        className={cn(
          'w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0',
          'transition-all duration-300',
          'group-hover:scale-110 group-hover:shadow-lg',
          colors.iconBg,
          colors.text,
          colors.glow
        )}
      >
        {icon}
      </div>

      <div className="min-w-0 flex flex-col justify-start">
        <p className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider">
          {title}
        </p>
        <p className="text-2xl font-bold text-text-primary mt-0.5 tracking-tight">
          {value}
        </p>

        <div className="mt-1 min-h-[18px]">
          {description && (
            <p className="text-text-tertiary text-xs">{description}</p>
          )}

          {trend && (
            <div className="flex items-center gap-1">
              {trend.isPositive ? (
                <ArrowUpRight className="w-3.5 h-3.5 text-success" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 text-danger" />
              )}
              <span
                className={cn(
                  'text-xs font-medium',
                  trend.isPositive ? 'text-success' : 'text-danger'
                )}
              >
                {trend.value}%
              </span>
              <span className="text-text-tertiary text-xs">vs last month</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const containerClasses = cn(
    'bg-surface rounded-2xl p-5',
    'border border-border-default',
    'shadow-sm shadow-gray-200/50 dark:shadow-none',
    'transition-all duration-300 ease-out',
    'group cursor-pointer',
    'hover:-translate-y-1 hover:shadow-lg',
    'hover:border-border-hover',
    'block h-full'
  );

  if (link) {
    return (
      <Link href={link} className={containerClasses}>
        {Content}
      </Link>
    );
  }

  return <div className={containerClasses}>{Content}</div>;
}
