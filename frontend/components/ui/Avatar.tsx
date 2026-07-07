'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const avatarVariants = cva(
  // align-top removes the inline baseline gap below the avatar so the status
  // dot (absolute bottom-0) sits on the circle instead of below it.
  'relative inline-flex items-center justify-center overflow-hidden align-top',
  {
    variants: {
      size: {
        xs: 'w-6 h-6 text-[10px]',
        sm: 'w-8 h-8 text-xs',
        md: 'w-10 h-10 text-sm',
        lg: 'w-12 h-12 text-base',
        xl: 'w-16 h-16 text-lg',
        '2xl': 'w-20 h-20 text-xl',
      },
      shape: {
        circle: 'rounded-full',
        square: 'rounded-xl',
      },
    },
    defaultVariants: {
      size: 'md',
      shape: 'circle',
    },
  }
);

interface AvatarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof avatarVariants> {
  src?: string;
  alt?: string;
  fallback?: string;
  status?: 'online' | 'offline' | 'busy' | 'away';
  /**
   * Override for the status dot's own classes (size, ring, etc.). Merged last
   * via tailwind-merge so callers can shrink/grow the dot INDEPENDENTLY of the
   * avatar size — e.g. a small status dot on a normal-size avatar.
   */
  statusClassName?: string;
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, size, shape, src, alt, fallback, status, statusClassName, ...props }, ref) => {
    const [imageError, setImageError] = React.useState(false);

    return (
      <div className="relative inline-block" ref={ref}>
        <div className={cn(avatarVariants({ size, shape }), className)} {...props}>
          {src && !imageError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={alt}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-brand-400 to-brand-700 flex items-center justify-center text-white font-medium">
              {fallback?.slice(0, 2).toUpperCase() || '?'}
            </div>
          )}
        </div>

        {/* Status Indicator */}
        {status && (
          <span
            className={cn(
              'absolute bottom-0 right-0 block rounded-full ring-2 ring-surface',
              size === 'xs' && 'w-2 h-2',
              size === 'sm' && 'w-2.5 h-2.5',
              size === 'md' && 'w-3 h-3',
              size === 'lg' && 'w-3.5 h-3.5',
              size === 'xl' && 'w-4 h-4',
              size === '2xl' && 'w-5 h-5',
              status === 'online' && 'bg-online',
              status === 'offline' && 'bg-offline',
              status === 'busy' && 'bg-busy',
              status === 'away' && 'bg-away',
              // Caller override wins (tailwind-merge) — lets a single surface
              // shrink the dot without touching the size-based defaults above.
              statusClassName
            )}
          />
        )}
      </div>
    );
  }
);
Avatar.displayName = 'Avatar';

// Avatar Group
interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  max?: number;
}

const AvatarGroup = React.forwardRef<HTMLDivElement, AvatarGroupProps>(
  ({ className, children, max, ...props }, ref) => {
    const childrenArray = React.Children.toArray(children);
    const showMax = max && childrenArray.length > max;
    const displayedChildren = showMax ? childrenArray.slice(0, max) : childrenArray;
    const remaining = childrenArray.length - (max || 0);

    return (
      <div ref={ref} className={cn('flex items-center -space-x-2', className)} {...props}>
        {displayedChildren}
        {showMax && (
          <div className="relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 text-gray-600 text-xs font-medium ring-2 ring-white">
            +{remaining}
          </div>
        )}
      </div>
    );
  }
);
AvatarGroup.displayName = 'AvatarGroup';

export { Avatar, AvatarGroup };
