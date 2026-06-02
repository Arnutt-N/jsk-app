'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'navy';
  link?: string;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

const colorMap = {
  primary: {
    iconBg: 'bg-brand-50 dark:bg-brand-900/20',
    text: 'text-brand-600',
  },
  success: {
    iconBg: 'bg-success/10 dark:bg-success/15',
    text: 'text-success-text',
  },
  warning: {
    iconBg: 'bg-warning/10 dark:bg-warning/15',
    text: 'text-warning-text',
  },
  danger: {
    iconBg: 'bg-danger/10 dark:bg-danger/15',
    text: 'text-danger-text',
  },
  info: {
    iconBg: 'bg-info/10 dark:bg-info/15',
    text: 'text-info-text',
  },
  navy: {
    iconBg: 'bg-brand-50 dark:bg-brand-900/20',
    text: 'text-brand-600',
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
          'transition-transform duration-200 group-hover:scale-105',
          colors.iconBg,
          colors.text,
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
    'shadow-sm',
    'transition-all duration-200 ease-out',
    'group cursor-pointer',
    'hover:-translate-y-1 hover:shadow-lg',
    'hover:border-brand-200',
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
