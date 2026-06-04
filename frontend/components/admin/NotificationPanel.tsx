'use client';

import { Bell, Inbox, MessageSquare, UserPlus, Megaphone } from 'lucide-react';
import { useState } from 'react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/Popover';
import { cn } from '@/lib/utils';

interface NotificationItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  // Visual tone for the leading icon strip. "info" = brand, "success" = green,
  // "warning" = amber. Keeps the unread marker interesting without being noisy.
  tone?: 'info' | 'success' | 'warning';
}

const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n1',
    icon: UserPlus,
    title: 'มีคำร้องใหม่รอมอบหมาย',
    description: 'แจ้งเบาะแสยาเสพติด — กทม.',
    timestamp: '5 นาทีที่แล้ว',
    read: false,
    tone: 'info',
  },
  {
    id: 'n2',
    icon: MessageSquare,
    title: 'ข้อความใหม่จาก Live Chat',
    description: 'คุณสมชาย ส่งข้อความเข้ามา',
    timestamp: '12 นาทีที่แล้ว',
    read: false,
    tone: 'success',
  },
  {
    id: 'n3',
    icon: Megaphone,
    title: 'Broadcast เสร็จสิ้น',
    description: 'ส่งข้อความถึง 1,284 ผู้ติดตาม',
    timestamp: '1 ชั่วโมงที่แล้ว',
    read: true,
  },
  {
    id: 'n4',
    icon: Inbox,
    title: 'คำร้องใกล้กำหนดส่ง',
    description: 'ประชาชนร้องเรียน — กำหนดภายใน 2 วัน',
    timestamp: 'เมื่อวาน',
    read: true,
    tone: 'warning',
  },
];

const TONE_STYLES: Record<NonNullable<NotificationItem['tone']>, string> = {
  info: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
  success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
};

interface NotificationPanelProps {
  className?: string;
}

/**
 * Notification panel mounted in the admin Navbar.
 *
 * Uses mock data today. When a backend endpoint is wired up, swap the
 * `MOCK_NOTIFICATIONS` constant for a `useEffect` fetch (e.g. SWR / React
 * Query) — the rendering shape below is already the "loaded" state.
 *
 * Why a Popover and not a Dropdown: Popover positions relative to the
 * trigger and handles viewport collisions via Radix, which the project's
 * custom DropdownMenu doesn't. Notifications often overflow on narrow
 * viewports and Radix's collision detection is more reliable.
 */
export function NotificationPanel({ className }: NotificationPanelProps) {
  const [items, setItems] = useState(MOCK_NOTIFICATIONS);
  const unreadCount = items.filter((n) => !n.read).length;

  const markAllRead = () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <Popover>
      <PopoverTrigger
        aria-label={unreadCount > 0
          ? `การแจ้งเตือน มี ${unreadCount} รายการใหม่`
          : 'การแจ้งเตือน'}
        className={cn(
          'p-2.5 rounded-xl text-text-tertiary hover:text-brand-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all relative cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2',
          className
        )}
      >
        {unreadCount > 0 && (
          <span
            className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white dark:ring-gray-800 animate-pulse"
            aria-hidden="true"
          />
        )}
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="sr-only">มี {unreadCount} การแจ้งเตือนใหม่</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 sm:w-96 p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <div>
            <h3 className="text-sm font-bold text-text-primary">การแจ้งเตือน</h3>
            <p className="text-[11px] text-text-tertiary">
              {unreadCount > 0 ? `${unreadCount} รายการใหม่` : 'ไม่มีรายการใหม่'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 rounded-md px-2 py-1"
            >
              อ่านทั้งหมด
            </button>
          )}
        </div>

        <ul
          className="max-h-96 overflow-y-auto divide-y divide-border-default"
          role="list"
        >
          {items.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-text-tertiary">
              ไม่มีการแจ้งเตือน
            </li>
          ) : (
            items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setItems((prev) =>
                        prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
                      )
                    }
                    className={cn(
                      'w-full text-left px-4 py-3 flex gap-3 items-start',
                      'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors',
                      'focus-visible:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-gray-800/50',
                      'cursor-pointer'
                    )}
                  >
                    <span
                      className={cn(
                        'shrink-0 w-9 h-9 rounded-xl flex items-center justify-center',
                        item.tone ? TONE_STYLES[item.tone] : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                      )}
                      aria-hidden="true"
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={cn(
                            'text-sm leading-snug truncate',
                            item.read ? 'font-medium text-text-secondary' : 'font-bold text-text-primary'
                          )}
                        >
                          {item.title}
                        </p>
                        {!item.read && (
                          <span
                            className="shrink-0 w-2 h-2 mt-1.5 rounded-full bg-rose-500"
                            aria-label="ยังไม่ได้อ่าน"
                          />
                        )}
                      </div>
                      <p className="text-xs text-text-tertiary truncate mt-0.5">
                        {item.description}
                      </p>
                      <p className="text-[10px] text-text-tertiary mt-1 font-medium">
                        {item.timestamp}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="border-t border-border-default px-4 py-2.5 bg-gray-50/60 dark:bg-gray-800/40">
          <button
            type="button"
            className="w-full text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors cursor-pointer"
            onClick={() => {
              // Placeholder — when /admin/notifications exists, replace with router.push
              window.alert('หน้าการแจ้งเตือนทั้งหมด — ยังไม่พร้อมใช้งาน');
            }}
          >
            ดูการแจ้งเตือนทั้งหมด
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default NotificationPanel;
