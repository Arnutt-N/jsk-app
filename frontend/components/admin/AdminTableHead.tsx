'use client';

import React from 'react';

import { cn } from '@/lib/utils';

export interface AdminTableHeadColumn {
  key: string;
  label: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

interface AdminTableHeadProps {
  columns: AdminTableHeadColumn[];
  rowClassName?: string;
}

export function AdminTableHead({ columns, rowClassName }: AdminTableHeadProps) {
  const alignClass: Record<NonNullable<AdminTableHeadColumn['align']>, string> = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  return (
    <thead className="bg-muted/50 border-b border-border-default">
      <tr className={cn('text-xs font-semibold text-text-secondary tracking-wider', rowClassName)}>
        {columns.map((column) => (
          <th
            key={column.key}
            className={cn(
              'px-5 py-3',
              alignClass[column.align ?? 'left'],
              column.className,
            )}
          >
            {column.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}
