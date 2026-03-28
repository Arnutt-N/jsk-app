'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const skeletonVariants = cva(
  'animate-pulse bg-muted rounded',
  {
    variants: {
      variant: {
        text: 'h-4 w-full',
        circular: 'rounded-full',
        rectangular: 'rounded-none',
        rounded: 'rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'text',
    },
  }
);

interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {
  width?: string | number;
  height?: string | number;
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant, width, height, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(skeletonVariants({ variant }), className)}
        style={{
          width: width,
          height: height,
          ...style,
        }}
        {...props}
      />
    );
  }
);
Skeleton.displayName = 'Skeleton';

// Pre-built skeleton patterns
function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-surface rounded-2xl p-6 border border-border-default">
      <div className="flex items-center gap-4 mb-4">
        <Skeleton variant="circular" width={48} height={48} />
        <div className="flex-1">
          <Skeleton width="60%" height={16} className="mb-2" />
          <Skeleton width="40%" height={12} />
        </div>
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? '80%' : '100%'}
          height={12}
          className="mb-2"
        />
      ))}
    </div>
  );
}

function SkeletonStats() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-surface rounded-2xl p-5 border border-border-default">
          <div className="flex items-center gap-4">
            <Skeleton variant="rounded" width={48} height={48} />
            <div className="flex-1">
              <Skeleton width={80} height={12} className="mb-2" />
              <Skeleton width={60} height={28} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-surface rounded-2xl border border-border-default overflow-hidden">
      <div className="p-4 border-b border-border-default">
        <Skeleton width="30%" height={20} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 border-b border-border-default last:border-0">
          <div className="flex items-center gap-4">
            <Skeleton width="25%" height={16} />
            <Skeleton width="25%" height={16} />
            <Skeleton width="25%" height={16} />
            <Skeleton width="15%" height={16} />
          </div>
        </div>
      ))}
    </div>
  );
}

export { Skeleton, SkeletonCard, SkeletonStats, SkeletonTable };
