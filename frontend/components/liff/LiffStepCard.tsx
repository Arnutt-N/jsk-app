'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

interface LiffStepCardProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export function LiffStepCard({ icon, title, children, className, action }: LiffStepCardProps) {
  return (
    <Card glass className={cn('overflow-visible', className)}>
      <CardHeader className="bg-bg/50 border-b border-border-subtle rounded-t-2xl">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="text-text-tertiary" aria-hidden="true">
              {icon}
            </span>
            {title}
          </CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className="pt-6">{children}</CardContent>
    </Card>
  );
}
