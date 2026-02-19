'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  // Base styles - comprehensive
  [
    'inline-flex items-center justify-center',
    'relative overflow-hidden',
    'font-medium tracking-wide whitespace-nowrap',
    'rounded-xl',
    'cursor-pointer select-none',
    'transition-all duration-200 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed',
    'active:scale-[0.98]',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-gradient-to-br from-brand-500 to-brand-600',
          'text-white shadow-md shadow-brand-500/20',
          'hover:shadow-lg hover:shadow-brand-500/30 hover:-translate-y-0.5',
          'hover:from-brand-400 hover:to-brand-500',
          'focus-visible:ring-brand-500/50',
        ],
        secondary: [
          'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200',
          'border border-gray-200 dark:border-gray-600',
          'shadow-sm',
          'hover:bg-gray-200 dark:hover:bg-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:shadow-md',
          'focus-visible:ring-gray-400/50',
        ],
        outline: [
          'bg-transparent border-2 border-gray-200 text-gray-600',
          'hover:border-brand-500 hover:text-brand-500 hover:bg-brand-50',
          'focus-visible:ring-brand-500/30',
        ],
        ghost: [
          'bg-transparent text-brand-500',
          'hover:bg-brand-50',
          'focus-visible:ring-brand-500/30',
        ],
        soft: [
          'bg-brand-100 text-brand-700',
          'hover:bg-brand-200',
          'focus-visible:ring-brand-500/30',
        ],
        danger: [
          'bg-gradient-to-br from-danger to-danger-dark',
          'text-white shadow-md shadow-danger/20',
          'hover:shadow-lg hover:shadow-danger/30 hover:-translate-y-0.5',
          'focus-visible:ring-danger/50',
        ],
        success: [
          'bg-gradient-to-br from-emerald-500 to-emerald-600',
          'text-white shadow-md shadow-emerald-500/20',
          'hover:shadow-lg hover:shadow-emerald-500/30 hover:-translate-y-0.5',
          'focus-visible:ring-emerald-500/50',
        ],
        warning: [
          'bg-gradient-to-br from-amber-500 to-amber-600',
          'text-white shadow-md shadow-amber-500/20',
          'hover:shadow-lg hover:shadow-amber-500/30 hover:-translate-y-0.5',
          'focus-visible:ring-amber-500/50',
        ],
        link: [
          'bg-transparent text-brand-500',
          'underline-offset-4 hover:underline',
          'focus-visible:ring-brand-500/30',
        ],
      },
      size: {
        xs: 'h-7 px-2.5 text-xs gap-1.5 rounded-lg',
        sm: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
        md: 'h-10 px-5 text-sm gap-2',
        lg: 'h-12 px-6 text-base gap-2.5',
        xl: 'h-14 px-8 text-base gap-3',
        'icon-sm': 'h-8 w-8 p-0 rounded-lg',
        icon: 'h-10 w-10 p-0',
        'icon-lg': 'h-12 w-12 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  shine?: boolean;
  glow?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      loadingText,
      leftIcon,
      rightIcon,
      shine = false,
      glow = false,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          buttonVariants({ variant, size }),
          glow && 'hover:shadow-glow',
          className
        )}
        disabled={isLoading || disabled}
        {...props}
      >
        {/* Shine effect overlay */}
        {shine && variant === 'primary' && !isLoading && (
          <span className="absolute inset-0 overflow-hidden pointer-events-none">
            <span 
              className="absolute inset-0 -translate-x-full group-hover:animate-shine"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
                transform: 'translateX(-100%) skewX(-15deg)',
              }}
            />
          </span>
        )}
        
        {/* Loading overlay */}
        {isLoading && (
          <span className="absolute inset-0 flex items-center justify-center bg-inherit rounded-xl">
            <Loader2 className="w-4 h-4 animate-spin" />
            {loadingText && <span className="ml-2">{loadingText}</span>}
          </span>
        )}
        
        {/* Content */}
        <span 
          className={cn(
            'relative flex items-center gap-2',
            isLoading && 'opacity-0'
          )}
        >
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          <span>{children}</span>
          {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
        </span>
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants };
export default Button;
