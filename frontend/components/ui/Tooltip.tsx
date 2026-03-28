'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { createPortal } from 'react-dom';

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  delay?: number;
}

export function Tooltip({
  children,
  content,
  side = 'top',
  align = 'center',
  delay = 200,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();

    let top = 0;
    let left = 0;

    switch (side) {
      case 'top':
        top = triggerRect.top - tooltipRect.height - 8;
        break;
      case 'bottom':
        top = triggerRect.bottom + 8;
        break;
      case 'left':
        left = triggerRect.left - tooltipRect.width - 8;
        break;
      case 'right':
        left = triggerRect.right + 8;
        break;
    }

    if (side === 'top' || side === 'bottom') {
      switch (align) {
        case 'start':
          left = triggerRect.left;
          break;
        case 'center':
          left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
          break;
        case 'end':
          left = triggerRect.right - tooltipRect.width;
          break;
      }
    } else {
      switch (align) {
        case 'start':
          top = triggerRect.top;
          break;
        case 'center':
          top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
          break;
        case 'end':
          top = triggerRect.bottom - tooltipRect.height;
          break;
      }
    }

    setPosition({ top, left });
  }, [align, side]);

  useEffect(() => {
    if (isVisible) {
      window.addEventListener('scroll', updatePosition);
      window.addEventListener('resize', updatePosition);
    }

    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isVisible, updatePosition]);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
      requestAnimationFrame(() => updatePosition());
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-flex"
      >
        {children}
      </div>

      {isVisible &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={tooltipRef}
            className={cn(
              'fixed z-50 px-3 py-1.5',
              'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-medium',
              'rounded-lg shadow-lg',
              'animate-fade-in-up',
              'pointer-events-none'
            )}
            style={{ top: position.top, left: position.left }}
            role="tooltip"
          >
            {content}
            <div
              className={cn(
                'absolute w-2 h-2 bg-gray-900 dark:bg-gray-100 rotate-45',
                side === 'top' && 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
                side === 'bottom' && 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2',
                side === 'left' && 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2',
                side === 'right' && 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2'
              )}
            />
          </div>,
          document.body
        )}
    </>
  );
}
