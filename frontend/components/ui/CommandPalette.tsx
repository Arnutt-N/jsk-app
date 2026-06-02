'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from '@/components/ui/Command';
import {
  LayoutDashboard,
  FileText,
  MessageCircle,
  Users,
  BarChart3,
  Settings,
  Search,
  Bell,
  LogOut,
  Moon,
  Sun,
  Monitor,
} from 'lucide-react';
import { useTheme } from '@/components/providers';

interface CommandPaletteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CommandPalette({ open: controlledOpen, onOpenChange }: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, setOpen]);

  const navigate = useCallback(
    (path: string) => {
      setOpen(false);
      router.push(path);
    },
    [setOpen, router]
  );

  const toggleTheme = useCallback(
    (newTheme: 'light' | 'dark' | 'system') => {
      setTheme(newTheme);
      setOpen(false);
    },
    [setTheme, setOpen]
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="พิมพ์คำสั่งหรือค้นหา..." />
      <CommandList>
        <CommandEmpty>ไม่พบผลลัพธ์</CommandEmpty>

        <CommandGroup heading="นำทาง">
          <CommandItem onSelect={() => navigate('/admin')}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Dashboard</span>
            <CommandShortcut>⌘1</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => navigate('/admin/requests')}>
            <FileText className="mr-2 h-4 w-4" />
            <span>คำร้องขอรับบริการ</span>
            <CommandShortcut>⌘2</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => navigate('/admin/live-chat')}>
            <MessageCircle className="mr-2 h-4 w-4" />
            <span>Live Chat</span>
            <CommandShortcut>⌘3</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => navigate('/admin/users')}>
            <Users className="mr-2 h-4 w-4" />
            <span>จัดการผู้ใช้</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate('/admin/reports')}>
            <BarChart3 className="mr-2 h-4 w-4" />
            <span>รายงาน</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate('/admin/friends')}>
            <Users className="mr-2 h-4 w-4" />
            <span>เพื่อน</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="ตั้งค่า">
          <CommandItem onSelect={() => navigate('/admin/settings')}>
            <Settings className="mr-2 h-4 w-4" />
            <span>ตั้งค่าระบบ</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate('/admin/settings/line')}>
            <Settings className="mr-2 h-4 w-4" />
            <span>ตั้ค่า LINE</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate('/admin/settings/permissions')}>
            <Settings className="mr-2 h-4 w-4" />
            <span>สิทธิ์การใช้งาน</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="ธีม">
          <CommandItem onSelect={() => toggleTheme('light')}>
            <Sun className="mr-2 h-4 w-4" />
            <span>โหมดสว่าง</span>
          </CommandItem>
          <CommandItem onSelect={() => toggleTheme('dark')}>
            <Moon className="mr-2 h-4 w-4" />
            <span>โหมดมืด</span>
          </CommandItem>
          <CommandItem onSelect={() => toggleTheme('system')}>
            <Monitor className="mr-2 h-4 w-4" />
            <span>ตามระบบ</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export default CommandPalette;
