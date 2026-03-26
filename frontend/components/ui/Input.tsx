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
          'border-transparent bg-bg',
          'focus:bg-surface focus:border-brand-500 focus:ring-brand-500/20',
        ],
        flushed: [
          'rounded-none border-0 border-b-2 border-border-subtle bg-transparent px-0',
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
          'border-danger focus:border-danger focus:ring-danger/20',
          'animate-shake',
        ],
        success: [
          'border-success focus:border-success focus:ring-success/20',
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
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary transition-colors duration-200">
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
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary">
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
