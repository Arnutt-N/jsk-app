'use client';

import { useRouter } from 'next/navigation';
import { LogOut, User as UserIcon, Settings as SettingsIcon, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/DropdownMenu';
import { cn } from '@/lib/utils';

interface UserMenuProps {
  className?: string;
}

/**
 * Profile dropdown mounted in the admin Navbar.
 *
 * Why a button-styled wrapper instead of a bare trigger: the original
 * `<Avatar />` was a static `<div>` with no cursor / click target. Wrapping
 * the avatar in a `cursor-pointer` button with hover/focus styles restores
 * the affordance users expect from a profile menu (Linear / Notion pattern).
 *
 * The menu delegates auth to `useAuth().logout` rather than calling the
 * logout endpoint directly, so the AuthContext state stays in sync (token
 * cleared, redirect to /login, etc.).
 */
export function UserMenu({ className }: UserMenuProps) {
  const { user, logout } = useAuth();
  const router = useRouter();

  const displayName = user?.display_name || user?.username || 'Administrator';
  const role = user?.role ?? '';
  const initials = displayName.substring(0, 2).toUpperCase();

  const goToProfile = () => router.push('/admin/users');
  const goToSettings = () => router.push('/admin/settings');
  const handleLogout = () => {
    logout?.();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="เมนูผู้ใช้"
        className={cn(
          'group inline-flex items-center gap-1.5 rounded-full p-0.5',
          'cursor-pointer',
          'transition-all duration-200',
          'hover:bg-gray-50 dark:hover:bg-gray-700',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2',
          className
        )}
      >
        <Avatar
          size="sm"
          fallback={initials}
          status="online"
          className="ring-2 ring-brand-500/20 ring-offset-1 ring-offset-white dark:ring-offset-gray-800"
        />
        <ChevronDown
          className="hidden md:block w-3.5 h-3.5 text-text-tertiary group-hover:text-text-primary transition-colors"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5 py-1">
            <span className="text-sm font-semibold text-text-primary">{displayName}</span>
            {role && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                {role}
              </span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={goToProfile}>
          <UserIcon size={16} aria-hidden="true" />
          โปรไฟล์
        </DropdownMenuItem>
        <DropdownMenuItem onClick={goToSettings}>
          <SettingsIcon size={16} aria-hidden="true" />
          ตั้งค่า
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-danger hover:bg-danger/5 hover:text-danger focus:bg-danger/5 focus:text-danger"
        >
          <LogOut size={16} aria-hidden="true" />
          ออกจากระบบ
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default UserMenu;
