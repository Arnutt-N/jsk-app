'use client';

import React, { useState, useCallback } from 'react';
import { Search, Send, Loader2 } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/Sheet';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';
import { getAvatarFallbackUrl } from '@/lib/constants/live-chat-avatar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateChatSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

interface SearchResult {
  line_user_id: string;
  display_name: string;
  picture_url?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateChatSheet({ isOpen, onClose, onCreated }: CreateChatSheetProps) {
  const { token } = useAuth();

  // ค้นหาผู้ใช้ LINE
  const [userQuery, setUserQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SearchResult | null>(null);

  // ข้อความเริ่มต้นและเหตุผล
  const [initialMessage, setInitialMessage] = useState('');
  const [reason, setReason] = useState('');

  // สถานะการส่ง
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // รีเซ็ตฟอร์มกลับค่าเริ่มต้น
  const resetForm = useCallback(() => {
    setUserQuery('');
    setSearchResults([]);
    setSelectedUser(null);
    setInitialMessage('');
    setReason('');
    setError(null);
  }, []);

  // ค้นหาผู้ใช้ LINE
  const handleSearch = useCallback(async () => {
    const q = userQuery.trim();
    if (!q || !token) return;

    setSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q, limit: '10' });
      const res = await fetch(`/api/v1/admin/friends?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError('ค้นหาผู้ใช้ไม่สำเร็จ');
        return;
      }
      const data = await res.json();
      // API อาจส่ง items หรือ array ตรง
      const items: SearchResult[] = (data.items || data || []).map(
        (item: Record<string, unknown>) => ({
          line_user_id: item.line_user_id as string,
          display_name: (item.display_name as string) || (item.line_user_id as string),
          picture_url: item.picture_url as string | undefined,
        })
      );
      setSearchResults(items);
    } catch (err) {
      logger.error('Search users failed:', err);
      setError('เกิดข้อผิดพลาดในการค้นหา');
    } finally {
      setSearching(false);
    }
  }, [userQuery, token]);

  // ส่งคำขอสร้างแชทใหม่
  const handleSubmit = useCallback(async () => {
    if (!selectedUser || !token) return;

    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, string> = {
        line_user_id: selectedUser.line_user_id,
      };
      if (initialMessage.trim()) {
        body.initial_message = initialMessage.trim();
      }
      if (reason.trim()) {
        body.reason = reason.trim();
      }

      const res = await fetch('/api/v1/admin/live-chat/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        const message = (errData as { detail?: string } | null)?.detail || 'สร้างแชทไม่สำเร็จ';
        setError(message);
        return;
      }

      // สำเร็จ — รีเซ็ตฟอร์มแล้วปิด
      resetForm();
      onCreated?.();
    } catch (err) {
      logger.error('Create chat failed:', err);
      setError('เกิดข้อผิดพลาดในการสร้างแชท');
    } finally {
      setSubmitting(false);
    }
  }, [selectedUser, token, initialMessage, reason, resetForm, onCreated]);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <SheetContent side="left" className="w-full sm:max-w-md thai-text">
        <SheetHeader>
          <SheetTitle>เริ่มแชทใหม่</SheetTitle>
          <SheetDescription>
            ค้นหาผู้ใช้ LINE แล้วเริ่มการสนทนาใหม่
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* ค้นหาผู้ใช้ */}
          <div className="space-y-2">
            <label htmlFor="cc-user-query" className="text-sm font-medium text-text-primary">
              ค้นหาผู้ใช้ <span className="text-danger">*</span>
            </label>
            <div className="flex gap-2">
              <Input
                id="cc-user-query"
                aria-required="true"
                placeholder="ชื่อหรือ LINE User ID"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                leftIcon={<Search className="w-4 h-4" />}
                size="sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSearch}
                disabled={searching || !userQuery.trim()}
                className="flex-shrink-0"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'ค้นหา'}
              </Button>
            </div>
          </div>

          {/* ผลลัพธ์การค้นหา */}
          {searchResults.length > 0 && !selectedUser && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto border border-border-default rounded-xl p-2">
              {searchResults.map((user) => (
                <button
                  key={user.line_user_id}
                  onClick={() => setSelectedUser(user)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-bg transition-colors text-left focus-ring"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={user.picture_url || getAvatarFallbackUrl(user.display_name, 32)}
                    alt={user.display_name}
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {user.display_name}
                    </p>
                    <p className="text-xs text-text-tertiary truncate">
                      {user.line_user_id}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ผู้ใช้ที่เลือก */}
          {selectedUser && (
            <div className="flex items-center gap-3 p-3 border border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10 rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedUser.picture_url || getAvatarFallbackUrl(selectedUser.display_name, 32)}
                alt={selectedUser.display_name}
                className="w-10 h-10 rounded-full object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">
                  {selectedUser.display_name}
                </p>
                <p className="text-xs text-text-secondary truncate">
                  {selectedUser.line_user_id}
                </p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-xs text-text-tertiary hover:text-danger transition-colors focus-ring"
                aria-label="เปลี่ยนผู้ใช้"
              >
                เปลี่ยน
              </button>
            </div>
          )}

          {/* ข้อความเริ่มต้น (ไม่บังคับ) */}
          <div className="space-y-2">
            <label htmlFor="cc-initial-message" className="text-sm font-medium text-text-primary">
              ข้อความเริ่มต้น <span className="text-text-tertiary text-xs">(ไม่บังคับ)</span>
            </label>
            <Textarea
              id="cc-initial-message"
              placeholder="พิมพ์ข้อความที่ต้องการส่งให้ผู้ใช้..."
              value={initialMessage}
              onChange={(e) => setInitialMessage(e.target.value)}
              size="sm"
            />
          </div>

          {/* เหตุผล (ไม่บังคับ) */}
          <div className="space-y-2">
            <label htmlFor="cc-reason" className="text-sm font-medium text-text-primary">
              เหตุผล <span className="text-text-tertiary text-xs">(ไม่บังคับ)</span>
            </label>
            <Input
              id="cc-reason"
              placeholder="เหตุผลในการเริ่มแชท..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              size="sm"
            />
          </div>

          {/* Error */}
          {error && (
            <p role="alert" aria-live="assertive" className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* ปุ่มส่ง */}
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!selectedUser || submitting}
            className="w-full gap-2"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {submitting ? 'กำลังสร้าง...' : 'เริ่มแชท'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
