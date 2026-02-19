'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDown } from 'lucide-react';

const selectVariants = cva(
  [
    'w-full appearance-none rounded-xl border bg-surface',
    'text-sm text-text-primary',
    'transition-all duration-200 ease-out',
    'focus:outline-none focus:ring-2',
    'hover:border-border-hover',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-bg',
    'pr-10',
  ],
  {
    variants: {
      variant: {
        outline: [
          'border-border-default',
          'focus:border-brand-500 focus:ring-brand-500/20',
        ],
        filled: [
          'border-transparent bg-gray-100 dark:bg-gray-700',
          'focus:bg-white dark:focus:bg-gray-800 focus:border-brand-500 focus:ring-brand-500/20',
        ],
      },
      size: {
        sm: 'h-9 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-12 px-5 text-base',
      },
      state: {
        default: '',
        error: [
          'border-red-500 focus:border-red-500 focus:ring-red-500/20',
          'animate-shake',
        ],
        success: [
          'border-green-500 focus:border-green-500 focus:ring-green-500/20',
        ],
      },
    },
    defaultVariants: {
      variant: 'outline',
      size: 'md',
      state: 'default',
    },
  }
);

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>,
    VariantProps<typeof selectVariants> {
  options: SelectOption[];
  placeholder?: string;
  leftIcon?: React.ReactNode;
  errorMessage?: string;
  helperText?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      variant,
      size,
      state,
      options,
      placeholder,
      leftIcon,
      errorMessage,
      helperText,
      ...props
    },
    ref
  ) => {
    return (
      <div className="w-full">
        <div className="relative">
          {leftIcon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors duration-200 pointer-events-none">
              {leftIcon}
            </span>
          )}
          <select
            ref={ref}
            className={cn(
              selectVariants({ variant, size, state }),
              leftIcon && 'pl-10',
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
        </div>
        {(errorMessage || helperText) && (
          <p
            className={cn(
              'mt-1.5 text-xs',
              errorMessage ? 'text-danger-text dark:text-danger-light' : 'text-text-secondary'
            )}
          >
            {errorMessage || helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export { Select, selectVariants };
export default Select;
