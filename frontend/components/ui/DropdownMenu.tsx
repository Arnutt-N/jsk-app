'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  createContext,
  useContext,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.MutableRefObject<HTMLButtonElement | null>;
}

const DropdownMenuContext = createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenu() {
  const ctx = useContext(DropdownMenuContext);
  if (!ctx) throw new Error('DropdownMenu components must be used within <DropdownMenu>');
  return ctx;
}

/* ─── Root ─── */

interface DropdownMenuProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function DropdownMenu({ children, open: controlledOpen, onOpenChange }: DropdownMenuProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (v: boolean) => {
      setInternalOpen(v);
      onOpenChange?.(v);
    },
    [onOpenChange]
  );

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen, triggerRef }}>
      <div className="relative inline-block">{children}</div>
    </DropdownMenuContext.Provider>
  );
}

/* ─── Trigger ─── */

interface DropdownMenuTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

const DropdownMenuTrigger = React.forwardRef<HTMLButtonElement, DropdownMenuTriggerProps>(
  ({ className, children, onClick, ...props }, ref) => {
    const { open, setOpen, triggerRef } = useDropdownMenu();
    const setRef = <T,>(targetRef: React.Ref<T> | undefined, value: T | null) => {
      if (typeof targetRef === 'function') targetRef(value);
      else if (targetRef) (targetRef as React.MutableRefObject<T | null>).current = value;
    };

    return (
      <button
        ref={(node) => {
          triggerRef.current = node;
          setRef(ref, node);
        }}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className={className}
        onClick={(e) => {
          setOpen(!open);
          onClick?.(e);
        }}
        {...props}
      >
        {children}
      </button>
    );
  }
);

DropdownMenuTrigger.displayName = 'DropdownMenuTrigger';

/* ─── Content ─── */

interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
}

const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ className, children, align = 'start', sideOffset = 4, ...props }, ref) => {
    const { open, setOpen, triggerRef } = useDropdownMenu();
    const contentRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const setRef = <T,>(targetRef: React.Ref<T> | undefined, value: T | null) => {
      if (typeof targetRef === 'function') targetRef(value);
      else if (targetRef) (targetRef as React.MutableRefObject<T | null>).current = value;
    };

    // Position calculation
    useEffect(() => {
      if (!open || !triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const top = rect.bottom + sideOffset + window.scrollY;
      let left = rect.left + window.scrollX;

      if (align === 'end') {
        left = rect.right + window.scrollX;
      } else if (align === 'center') {
        left = rect.left + rect.width / 2 + window.scrollX;
      }

      setPosition({ top, left });
    }, [open, align, sideOffset, triggerRef]);

    // Close on Escape
    useEffect(() => {
      if (!open) return;
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setOpen(false);
          triggerRef.current?.focus();
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, setOpen, triggerRef]);

    // Close on outside click
    useEffect(() => {
      if (!open) return;
      const handleClick = (e: MouseEvent) => {
        if (
          contentRef.current &&
          !contentRef.current.contains(e.target as Node) &&
          triggerRef.current &&
          !triggerRef.current.contains(e.target as Node)
        ) {
          setOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }, [open, setOpen, triggerRef]);

    // Focus first item on open
    useEffect(() => {
      if (!open || !contentRef.current) return;
      const firstItem = contentRef.current.querySelector<HTMLElement>(
        '[role="menuitem"]:not([disabled])'
      );
      firstItem?.focus();
    }, [open]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      const content = contentRef.current;
      if (!content) return;

      const items = Array.from(
        content.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')
      );
      const currentIndex = items.findIndex((item) => item === document.activeElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        items[next]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        items[prev]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1]?.focus();
      }
    }, []);

    if (!open) return null;

    const alignClass =
      align === 'end'
        ? '-translate-x-full'
        : align === 'center'
          ? '-translate-x-1/2'
          : '';

    const content = (
      <div
        ref={(node) => {
          contentRef.current = node;
          setRef(ref, node);
        }}
        role="menu"
        aria-orientation="vertical"
        className={cn(
          'fixed z-50 min-w-[8rem] overflow-hidden rounded-xl border border-gray-200 bg-white p-1 shadow-xl',
          'animate-scale-in',
          alignClass,
          className
        )}
        style={{ top: position.top, left: position.left }}
        onKeyDown={handleKeyDown}
        {...props}
      >
        {children}
      </div>
    );

    if (typeof window === 'undefined') return null;
    return createPortal(content, document.body);
  }
);

DropdownMenuContent.displayName = 'DropdownMenuContent';

/* ─── Item ─── */

interface DropdownMenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  inset?: boolean;
}

const DropdownMenuItem = React.forwardRef<HTMLButtonElement, DropdownMenuItemProps>(
  ({ className, inset, children, onClick, disabled, ...props }, ref) => {
    const { setOpen, triggerRef } = useDropdownMenu();

    return (
      <button
        ref={ref}
        role="menuitem"
        type="button"
        disabled={disabled}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700',
          'transition-colors duration-150',
          'hover:bg-brand-50 hover:text-brand-700',
          'focus:bg-brand-50 focus:text-brand-700 focus:outline-none',
          'disabled:pointer-events-none disabled:opacity-50',
          inset && 'pl-8',
          className
        )}
        onClick={(e) => {
          onClick?.(e);
          setOpen(false);
          triggerRef.current?.focus();
        }}
        {...props}
      >
        {children}
      </button>
    );
  }
);

DropdownMenuItem.displayName = 'DropdownMenuItem';

/* ─── Separator ─── */

function DropdownMenuSeparator({ className }: { className?: string }) {
  return (
    <div
      role="separator"
      className={cn('-mx-1 my-1 h-px bg-gray-100', className)}
    />
  );
}

/* ─── Label ─── */

function DropdownMenuLabel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('px-3 py-1.5 text-xs font-semibold text-gray-500', className)}>
      {children}
    </div>
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
};
