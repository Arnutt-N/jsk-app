'use client';

/**
 * CommandPalette (⌘K)
 *
 * Global keyboard-driven launcher for admin pages and quick actions.
 * - Opens with Cmd+K (macOS) / Ctrl+K (Windows/Linux)
 * - Fuzzy search across pages, actions, and settings
 * - Persists last 5 selections in localStorage
 * - Dark mode + Thai UI + ARIA combobox semantics
 *
 * Wired into `frontend/app/admin/layout.tsx` — single mount, no props.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  LayoutDashboard, FileText, Bot, MessageCircle, History, Megaphone,
  Reply, MessageSquareReply, PanelTop, Users, UserCog, FolderOpen,
  BarChart3, Shield, Settings, Palette, Plus, BarChart, LogOut, Moon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Command definitions
// ---------------------------------------------------------------------------
type CommandItem = {
  id: string;
  label: string;
  thaiLabel: string;
  group: 'หน้า' | 'การดำเนินการ' | 'การตั้งค่า';
  icon: LucideIcon;
  href?: string;
  action?: () => void;
  keywords?: string[];
  shortcut?: string[];
};

const PAGES: Omit<CommandItem, 'id' | 'group' | 'icon' | 'thaiLabel' | 'label'>[] = [
  { href: '/admin', keywords: ['dashboard', 'home', 'หน้าหลัก', 'แดชบอร์ด'] },
  { href: '/admin/requests', keywords: ['requests', 'cases', 'คำร้อง', 'งาน'] },
  { href: '/admin/chatbot', keywords: ['chatbot', 'intent', 'บอท', 'แชทบอท'] },
  { href: '/admin/live-chat', keywords: ['live', 'chat', 'agent', 'แชทสด', 'พูดคุย'] },
  { href: '/admin/chat-histories', keywords: ['history', 'logs', 'ประวัติ'] },
  { href: '/admin/chatbot/broadcast', keywords: ['broadcast', 'ส่งข้อความ', 'ประกาศ'] },
  { href: '/admin/auto-replies', keywords: ['auto', 'reply', 'ตอบกลับอัตโนมัติ'] },
  { href: '/admin/reply-objects', keywords: ['object', 'template', 'เทมเพลต'] },
  { href: '/admin/rich-menus', keywords: ['rich menu', 'เมนู', 'ริชเมนู'] },
  { href: '/admin/friends', keywords: ['friends', 'เพื่อน', 'line'] },
  { href: '/admin/users', keywords: ['users', 'staff', 'ผู้ใช้', 'เจ้าหน้าที่'] },
  { href: '/admin/files', keywords: ['files', 'media', 'ไฟล์', 'สื่อ'] },
  { href: '/admin/reports', keywords: ['reports', 'pdf', 'รายงาน'] },
  { href: '/admin/audit', keywords: ['audit', 'log', 'บันทึก'] },
  { href: '/admin/settings', keywords: ['settings', 'ตั้งค่า'] },
  { href: '/admin/design-system', keywords: ['design', 'system', 'ดีไซน์'] },
];

const PAGE_META: Record<string, { label: string; icon: LucideIcon; thaiLabel: string }> = {
  '/admin': { label: 'Dashboard', thaiLabel: 'หน้าหลัก', icon: LayoutDashboard },
  '/admin/requests': { label: 'Manage Requests', thaiLabel: 'จัดการคำร้อง', icon: FileText },
  '/admin/chatbot': { label: 'Chatbot Overview', thaiLabel: 'ภาพรวมแชทบอท', icon: Bot },
  '/admin/live-chat': { label: 'Live Chat', thaiLabel: 'แชทสด', icon: MessageCircle },
  '/admin/chat-histories': { label: 'Chat Histories', thaiLabel: 'ประวัติการสนทนา', icon: History },
  '/admin/chatbot/broadcast': { label: 'Broadcast', thaiLabel: 'ส่งข้อความแบบกลุ่ม', icon: Megaphone },
  '/admin/auto-replies': { label: 'Auto-Replies', thaiLabel: 'ตอบกลับอัตโนมัติ', icon: Reply },
  '/admin/reply-objects': { label: 'Reply Objects', thaiLabel: 'เทมเพลตข้อความ', icon: MessageSquareReply },
  '/admin/rich-menus': { label: 'Rich Menus', thaiLabel: 'ริชเมนู', icon: PanelTop },
  '/admin/friends': { label: 'Friend Histories', thaiLabel: 'ประวัติเพื่อน LINE', icon: Users },
  '/admin/users': { label: 'User Management', thaiLabel: 'จัดการผู้ใช้', icon: UserCog },
  '/admin/files': { label: 'File Management', thaiLabel: 'จัดการไฟล์', icon: FolderOpen },
  '/admin/reports': { label: 'Reports', thaiLabel: 'รายงาน', icon: BarChart3 },
  '/admin/audit': { label: 'Audit Log', thaiLabel: 'บันทึกการใช้งาน', icon: Shield },
  '/admin/settings': { label: 'Settings', thaiLabel: 'การตั้งค่า', icon: Settings },
  '/admin/design-system': { label: 'Design System', thaiLabel: 'ระบบดีไซน์', icon: Palette },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const RECENT_KEY = 'jsk-cmd-recent';
const MAX_RECENT = 5;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [recent, setRecent] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(RECENT_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const router = useRouter();
  const { logout } = useAuth();

  // ⌘K / Ctrl+K shortcut + custom event from navbar trigger
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    const openEvent = () => setOpen(true);
    document.addEventListener('keydown', down);
    document.addEventListener('jsk:open-command-palette', openEvent);
    return () => {
      document.removeEventListener('keydown', down);
      document.removeEventListener('jsk:open-command-palette', openEvent);
    };
  }, []);

  // Theme toggle: dispatch a custom event the existing ThemeToggleSwitch listens for.
  // Falls back to document.documentElement.classList.toggle if no listener responds.
  const toggleTheme = useCallback(() => {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('jsk-theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('jsk-theme', 'dark');
    }
  }, []);

  const navigateAndClose = useCallback((href: string) => {
    // Track in recent
    setRecent((prev) => {
      const next = [href, ...prev.filter((p) => p !== href)].slice(0, MAX_RECENT);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch (err) {
        logger.warn('Failed to save recent commands', err);
      }
      return next;
    });
    setOpen(false);
    setSearch('');
    router.push(href);
  }, [router]);

  // Build the full command list
  const items: CommandItem[] = useMemo(() => {
    const pageItems: CommandItem[] = PAGES.map((p) => {
      const meta = PAGE_META[p.href!];
      return {
        id: p.href!,
        label: meta.label,
        thaiLabel: meta.thaiLabel,
        group: 'หน้า',
        icon: meta.icon,
        href: p.href,
        keywords: p.keywords,
      };
    });

    const actionItems: CommandItem[] = [
      {
        id: 'action:new-request',
        label: 'New Service Request',
        thaiLabel: 'สร้างคำร้องใหม่',
        group: 'การดำเนินการ',
        icon: Plus,
        action: () => navigateAndClose('/admin/requests/create'),
        keywords: ['create', 'add', 'new', 'สร้าง'],
      },
      {
        id: 'action:analytics',
        label: 'View Analytics',
        thaiLabel: 'ดู Analytics',
        group: 'การดำเนินการ',
        icon: BarChart,
        action: () => navigateAndClose('/admin/analytics'),
        keywords: ['analytics', 'สถิติ', 'ข้อมูล'],
      },
      {
        id: 'action:audit',
        label: 'View Audit Log',
        thaiLabel: 'ดูบันทึกการใช้งาน',
        group: 'การดำเนินการ',
        icon: Shield,
        action: () => navigateAndClose('/admin/audit'),
        keywords: ['audit', 'log', 'บันทึก'],
      },
    ];

    const settingsItems: CommandItem[] = [
      {
        id: 'setting:theme',
        label: 'Toggle Theme',
        thaiLabel: 'สลับธีม (สว่าง/มืด)',
        group: 'การตั้งค่า',
        icon: Moon,
        action: () => { toggleTheme(); setOpen(false); setSearch(''); },
        keywords: ['theme', 'dark', 'light', 'ธีม', 'มืด', 'สว่าง'],
        shortcut: ['T'],
      },
      {
        id: 'setting:logout',
        label: 'Logout',
        thaiLabel: 'ออกจากระบบ',
        group: 'การตั้งค่า',
        icon: LogOut,
        action: () => { logout?.(); setOpen(false); setSearch(''); },
        keywords: ['logout', 'sign out', 'ออก', 'จบ'],
      },
    ];

    return [...pageItems, ...actionItems, ...settingsItems];
  }, [navigateAndClose, toggleTheme, logout]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Palette */}
      <div className={cn(
        'relative w-full max-w-xl',
        'rounded-2xl border border-border-default',
        'bg-surface dark:bg-surface-dark',
        'shadow-2xl',
        'overflow-hidden',
        'animate-scale-in',
      )}>
        <Command
          className="flex flex-col"
          shouldFilter
          loop
        >
          <div className="flex items-center border-b border-border-default px-4">
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="ค้นหาหน้า การดำเนินการ หรือการตั้งค่า..."
              className={cn(
                'flex-1 bg-transparent text-base text-text-primary',
                'placeholder:text-text-tertiary',
                'py-4 px-2 focus:outline-none',
              )}
              autoFocus
            />
            <kbd className="hidden sm:inline-flex items-center px-2 py-1 text-[10px] font-mono text-text-tertiary bg-muted rounded">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[50vh] overflow-y-auto p-2">
            <Command.Empty className="py-12 text-center text-sm text-text-tertiary">
              ไม่พบรายการที่ตรงกับ &quot;{search}&quot;
            </Command.Empty>

            {recent.length > 0 && !search && (
              <Command.Group heading="ใช้ล่าสุด" className="mb-2">
                {recent.map((href) => {
                  const meta = PAGE_META[href];
                  if (!meta) return null;
                  const Icon = meta.icon;
                  return (
                    <Command.Item
                      key={`recent-${href}`}
                      value={`recent ${meta.label} ${meta.thaiLabel}`}
                      onSelect={() => navigateAndClose(href)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-text-primary aria-selected:bg-brand-50 dark:aria-selected:bg-brand-900/20"
                    >
                      <Icon className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                      <span className="flex-1 truncate">
                        {meta.thaiLabel} <span className="text-text-tertiary text-xs">· {meta.label}</span>
                      </span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {(['หน้า', 'การดำเนินการ', 'การตั้งค่า'] as const).map((groupName) => {
              const groupItems = items.filter((i) => i.group === groupName);
              if (groupItems.length === 0) return null;
              return (
                <Command.Group key={groupName} heading={groupName} className="mb-2">
                  {groupItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Command.Item
                        key={item.id}
                        value={`${item.thaiLabel} ${item.label} ${(item.keywords ?? []).join(' ')}`}
                        onSelect={() => {
                          if (item.href) navigateAndClose(item.href);
                          else item.action?.();
                        }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-text-primary aria-selected:bg-brand-50 dark:aria-selected:bg-brand-900/20"
                      >
                        <Icon className="w-4 h-4 text-text-secondary flex-shrink-0" />
                        <span className="flex-1 truncate">
                          {item.thaiLabel}
                          <span className="ml-1.5 text-text-tertiary text-xs">{item.label}</span>
                        </span>
                        {item.shortcut && (
                          <kbd className="text-[10px] font-mono text-text-tertiary bg-muted px-1.5 py-0.5 rounded">
                            {item.shortcut.join('+')}
                          </kbd>
                        )}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              );
            })}
          </Command.List>

          <div className="flex items-center justify-between px-4 py-2 border-t border-border-default text-[11px] text-text-tertiary">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-muted rounded font-mono">↑↓</kbd>
                นำทาง
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-muted rounded font-mono">↵</kbd>
                เลือก
              </span>
            </div>
            <span>JSK Admin · ⌘K</span>
          </div>
        </Command>
      </div>
    </div>
  );
}

export default CommandPalette;
