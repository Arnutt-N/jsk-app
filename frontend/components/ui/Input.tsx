'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const inputVariants = cva(
  [
    'w-full rounded-xl border bg-surface',
    'text-sm text-text-primary',
    'placeholder:text-text-tertiary',
    'transition-all duration-200 ease-out',
    'focus:outline-none focus:ring-2',
    'hover:border-border-hover',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-bg',
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
        flushed: [
          'rounded-none border-0 border-b-2 border-gray-200 dark:border-gray-600 bg-transparent px-0',
          'focus:border-brand-500 focus:ring-0',
        ],
      },
      size: {
        sm: 'h-9 px-3 text-xs',
        md: 'h-10 px-4 py-2.5',
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

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  errorMessage?: string;
  helperText?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      variant,
      size,
      state,
      leftIcon,
      rightIcon,
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
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors duration-200">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            className={cn(
              inputVariants({ variant, size, state }),
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              {rightIcon}
            </span>
          )}
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

Input.displayName = 'Input';

export { Input };
export default Input;
