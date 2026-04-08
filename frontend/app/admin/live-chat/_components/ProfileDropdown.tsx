'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { LayoutDashboard, LogOut, Settings, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/components/providers';
import { Avatar } from '@/components/ui/Avatar';

export function ProfileDropdown() {
  const { user, logout } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const displayName = user?.display_name || user?.username || 'Admin';
  const initials = displayName.substring(0, 2).toUpperCase();
  const isDark = resolvedTheme === 'dark';

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {/* Trigger — Avatar button */}
      <button
        onClick={() => setOpen(!open)}
        className="w-9 h-9 rounded-full ring-2 ring-white/20 hover:ring-brand-400/50 transition-all"
        aria-label="Open profile menu"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Avatar size="sm" fallback={initials} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-64 bg-surface rounded-2xl shadow-2xl border border-border-default overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {/* User info + Theme toggle */}
          <div className="px-4 pt-4 pb-3 flex items-center gap-3">
            <Avatar size="md" fallback={initials} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text-primary truncate">{displayName}</p>
              <p className="text-xs text-text-tertiary truncate capitalize">{user?.role?.toLowerCase().replace('_', ' ') || 'Admin'}</p>
            </div>
            {/* Theme toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleTheme();
              }}
              className="w-9 h-9 rounded-xl border border-border-default bg-bg hover:bg-muted flex items-center justify-center transition-colors"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? (
                <svg className="w-4 h-4 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              )}
            </button>
          </div>

          <div className="border-t border-border-default" />

          {/* Menu items */}
          <div className="py-1.5">
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-muted transition-colors"
              role="menuitem"
            >
              <LayoutDashboard className="w-4 h-4 text-text-tertiary" />
              แอดมิน
            </Link>
            <Link
              href="/admin/users"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-muted transition-colors"
              role="menuitem"
            >
              <User className="w-4 h-4 text-text-tertiary" />
              โปรไฟล์
            </Link>
            <Link
              href="/admin/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-muted transition-colors"
              role="menuitem"
            >
              <Settings className="w-4 h-4 text-text-tertiary" />
              ตั้งค่า
            </Link>
          </div>

          <div className="border-t border-border-default" />

          {/* Sign Out */}
          <div className="py-1.5">
            <button
              onClick={() => { setOpen(false); logout(); }}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-danger hover:bg-danger/5 transition-colors w-full text-left"
              role="menuitem"
            >
              <LogOut className="w-4 h-4" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
