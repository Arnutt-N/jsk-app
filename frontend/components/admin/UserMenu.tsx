'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  LogOut,
  User as UserIcon,
  Settings as SettingsIcon,
  LayoutDashboard,
  MessageCircle,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/components/providers';
import { Avatar } from '@/components/ui/Avatar';
import LogoutConfirmDialog from '@/components/admin/LogoutConfirmDialog';
import { AdminLanguageToggle, type AdminLocale } from '@/components/admin/AdminLanguageToggle';
import { cn } from '@/lib/utils';
import { getRoleLabel } from '@/lib/constants/roles';

interface UserMenuProps {
  className?: string;
  /**
   * Locale + toggle for the in-dropdown language switch. Shown only on mobile
   * (sm:hidden) — on desktop the language toggle lives in the Navbar header.
   */
  locale?: AdminLocale;
  onToggleLocale?: () => void;
}

type StaffRole = 'SUPER_ADMIN' | 'ADMIN' | 'DIRECTOR' | 'HEAD' | 'AGENT';

/**
 * Profile dropdown mounted in the admin Navbar.
 *
 * Mirrors the live-chat ProfileDropdown look: avatar trigger (no chevron),
 * rounded panel, role-gated items, theme toggle. Uses custom dropdown
 * for consistency with live-chat page design.
 */
export function UserMenu({ className, locale, onToggleLocale }: UserMenuProps) {
  const { user, logout } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  // User-initiated logout asks for confirmation first (system-initiated
  // session ends do not — they have no user present to confirm).
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const displayName = user?.display_name || user?.username || 'Administrator';
  const role = (user?.role ?? '') as StaffRole | '';
  const initials = displayName.substring(0, 2).toUpperCase();
  const isDark = resolvedTheme === 'dark';

  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';

  // No presence dot on the navbar avatar. The navbar renders on every admin
  // page, where there is NO live WebSocket to read (only the live-chat page
  // runs a socket), so any dot here would be a fake, always-on indicator that
  // misreads as real online-presence. The live-chat ProfileDropdown keeps the
  // real socket-backed dot; this trigger stays a plain avatar.

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
    <div ref={ref} className={cn('relative', className)}>
      {/* Trigger — Avatar with online status dot */}
      <button
        onClick={() => setOpen(!open)}
        className="cursor-pointer rounded-full ring-2 ring-white/20 hover:ring-brand-400/50 transition-all p-0.5"
        aria-label="Open profile menu"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Avatar
          size="sm"
          fallback={initials}
          className="ring-2 ring-brand-500/20 ring-offset-1 ring-offset-white dark:ring-offset-gray-800"
        />
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
              <p className="text-xs text-text-tertiary truncate">{role ? getRoleLabel(role) : 'Administrator'}</p>
            </div>
            {/* Language toggle — mobile only; desktop keeps it in the Navbar header */}
            {locale && onToggleLocale && (
              <div className="sm:hidden">
                <AdminLanguageToggle locale={locale} onToggle={onToggleLocale} />
              </div>
            )}
            {/* Theme toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleTheme();
              }}
              className="w-9 h-9 rounded-xl border border-border-default bg-bg hover:bg-muted flex items-center justify-center transition-colors cursor-pointer"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-amber-500" />
              ) : (
                <Moon className="w-4 h-4 text-brand-400" />
              )}
            </button>
          </div>

          <div className="border-t border-border-default" />

          {/* Menu items */}
          <div className="py-1.5">
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-muted transition-colors cursor-pointer"
                role="menuitem"
              >
                <LayoutDashboard className="w-4 h-4 text-text-tertiary" />
                แอดมิน
              </Link>
            )}
            <Link
              href="/admin/live-chat"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-muted transition-colors cursor-pointer"
              role="menuitem"
            >
              <MessageCircle className="w-4 h-4 text-text-tertiary" />
              ไลฟ์แชท
            </Link>
            <Link
              href="/admin/users"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-muted transition-colors cursor-pointer"
              role="menuitem"
            >
              <UserIcon className="w-4 h-4 text-text-tertiary" />
              โปรไฟล์
            </Link>
            <Link
              href="/admin/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-muted transition-colors cursor-pointer"
              role="menuitem"
            >
              <SettingsIcon className="w-4 h-4 text-text-tertiary" />
              ตั้งค่า
            </Link>
          </div>

          <div className="border-t border-border-default" />

          {/* Sign Out */}
          <div className="py-1.5">
            <button
              onClick={() => { setOpen(false); setConfirmingLogout(true); }}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-danger hover:bg-danger/5 transition-colors w-full text-left cursor-pointer"
              role="menuitem"
            >
              <LogOut className="w-4 h-4" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      )}

      <LogoutConfirmDialog
        isOpen={confirmingLogout}
        onClose={() => setConfirmingLogout(false)}
        onConfirm={() => { setConfirmingLogout(false); logout?.(); }}
      />
    </div>
  );
}

export default UserMenu;
