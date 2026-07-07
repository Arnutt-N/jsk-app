'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, SquarePen, Trash2 } from 'lucide-react';
import { AdminTableHead, type AdminTableHeadColumn } from '@/components/admin/AdminTableHead';
import PageHeader from '@/app/admin/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { ActionIconButton } from '@/components/ui/ActionIconButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { getHttpStatusMessage } from '@/lib/api-error';
import { logger } from '@/lib/logger';

/**
 * Canned-responses admin page — CRUD over the backend
 * `/api/v1/admin/canned-responses` API. Operators trigger these from the
 * live-chat composer by typing `/` (see CannedResponsePicker); this page is
 * where they are authored. Mirrors the Auto-Replies table pattern, with the
 * single-modal (create + edit via `editingId`) pattern from Reply Objects.
 */

interface CannedResponse {
  id: number;
  shortcut: string;
  title: string;
  content: string;
  category: string;
  usage_count?: number;
}

const API_BASE = '/api/v1';

// Categories the backend seeds/accepts (canned_response_service DEFAULT_TEMPLATES).
// `info` is the server-side default when none is supplied.
const CATEGORY_OPTIONS = [
  { value: 'info', label: 'ข้อมูลทั่วไป' },
  { value: 'greeting', label: 'ทักทาย' },
  { value: 'closing', label: 'ปิดการสนทนา' },
  { value: 'escalation', label: 'ส่งต่อ/ยกระดับ' },
] as const;

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((c) => [c.value, c.label])
);

interface FormState {
  shortcut: string;
  title: string;
  content: string;
  category: string;
}

const EMPTY_FORM: FormState = { shortcut: '', title: '', content: '', category: 'info' };

const DUPLICATE_SHORTCUT_MESSAGE = 'ชอร์ตคัตนี้ถูกใช้แล้ว กรุณาเลือกคำอื่น';
const INCOMPLETE_FORM_MESSAGE = 'กรุณากรอกชอร์ตคัต ชื่อ และข้อความให้ครบ';

export default function CannedResponsesPage() {
  const { toast } = useToast();
  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id: number | null }>({
    open: false,
    id: null,
  });
  const shortcutInputRef = useRef<HTMLInputElement>(null);

  const tableColumns: AdminTableHeadColumn[] = [
    { key: 'shortcut', label: 'ชอร์ตคัต' },
    { key: 'content', label: 'ข้อความ' },
    { key: 'category', label: 'หมวดหมู่', align: 'center' },
    { key: 'usage', label: 'ใช้ไป', align: 'center' },
    { key: 'actions', label: 'จัดการ', align: 'center' },
  ];

  const fetchResponses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/canned-responses`);
      if (res.ok) {
        const data = await res.json();
        setResponses(Array.isArray(data.items) ? data.items : []);
      }
    } catch (error) {
      logger.error('Error fetching canned responses:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchResponses();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchResponses]);

  const openCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (row: CannedResponse) => {
    setEditingId(row.id);
    setFormData({
      shortcut: row.shortcut,
      title: row.title,
      content: row.content,
      category: row.category || 'info',
    });
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;

    const shortcut = formData.shortcut.trim();
    const title = formData.title.trim();
    const content = formData.content.trim();
    if (!shortcut || !title || !content) {
      setFormError(INCOMPLETE_FORM_MESSAGE);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const url = editingId
        ? `${API_BASE}/admin/canned-responses/${editingId}`
        : `${API_BASE}/admin/canned-responses`;
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortcut, title, content, category: formData.category }),
      });

      if (res.ok) {
        await fetchResponses();
        closeForm();
        toast({
          title: editingId ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มข้อความสำเร็จรูปแล้ว',
          variant: 'success',
        });
        return;
      }

      // 409 = duplicate shortcut → keep the modal open and point at the field.
      if (res.status === 409) {
        setFormError(DUPLICATE_SHORTCUT_MESSAGE);
        shortcutInputRef.current?.focus();
        return;
      }
      setFormError(getHttpStatusMessage(res.status));
    } catch (error) {
      logger.error('Error saving canned response:', error);
      setFormError(getHttpStatusMessage(0));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/admin/canned-responses/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchResponses();
        toast({ title: 'ลบข้อความแล้ว', variant: 'success' });
      } else {
        toast({ title: 'ผิดพลาด', description: getHttpStatusMessage(res.status), variant: 'error' });
      }
    } catch (error) {
      logger.error('Error deleting canned response:', error);
      toast({ title: 'ผิดพลาด', description: 'ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', variant: 'error' });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 thai-text">
      <PageHeader
        title="ข้อความสำเร็จรูป"
        subtitle="จัดการชุดข้อความที่เจ้าหน้าที่เรียกใช้เร็วในแชทสดด้วยเครื่องหมาย /"
      >
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          เพิ่มข้อความ
        </Button>
      </PageHeader>

      <Modal
        isOpen={showForm}
        onClose={closeForm}
        title={editingId ? 'แก้ไขข้อความสำเร็จรูป' : 'เพิ่มข้อความสำเร็จรูป'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="cr-shortcut" className="block text-sm font-medium text-text-secondary mb-1">
              ชอร์ตคัต{' '}
              <span className="text-text-tertiary font-normal">
                (พิมพ์ /{formData.shortcut || 'คำ'} เพื่อเรียก)
              </span>
            </label>
            <Input
              id="cr-shortcut"
              ref={shortcutInputRef}
              type="text"
              value={formData.shortcut}
              onChange={(e) => {
                setFormData({ ...formData, shortcut: e.target.value });
                setFormError(null);
              }}
              state={formError ? 'error' : 'default'}
              placeholder="greeting"
              maxLength={30}
              required
            />
          </div>

          <div>
            <label htmlFor="cr-title" className="block text-sm font-medium text-text-secondary mb-1">
              ชื่อ
            </label>
            <Input
              id="cr-title"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="ข้อความทักทาย"
              maxLength={100}
              required
            />
          </div>

          <div>
            <label htmlFor="cr-content" className="block text-sm font-medium text-text-secondary mb-1">
              ข้อความ
            </label>
            <textarea
              id="cr-content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className="w-full px-4 py-2.5 border border-border-default rounded-xl text-sm text-text-primary bg-surface placeholder:text-text-tertiary transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500/20 hover:border-border-hover"
              rows={4}
              placeholder="สวัสดีค่ะ ยินดีให้บริการค่ะ"
              required
            />
          </div>

          <div>
            <label htmlFor="cr-category" className="block text-sm font-medium text-text-secondary mb-1">
              หมวดหมู่
            </label>
            <select
              id="cr-category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-4 py-2.5 border border-border-default rounded-xl text-sm text-text-primary bg-surface transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500/20 hover:border-border-hover"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {formError && (
            <p role="alert" className="text-xs text-danger-text dark:text-danger-light">
              {formError}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" className="flex-1" isLoading={submitting} disabled={submitting}>
              {editingId ? 'บันทึก' : 'เพิ่ม'}
            </Button>
            <Button type="button" variant="ghost" onClick={closeForm}>
              ยกเลิก
            </Button>
          </div>
        </form>
      </Modal>

      <div className="bg-surface rounded-2xl border border-border-default shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <AdminTableHead columns={tableColumns} />
            <tbody className="divide-y divide-border-subtle">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4">
                      <div className="h-4 bg-muted rounded w-20"></div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-4 bg-muted rounded w-32 mb-2"></div>
                      <div className="h-3 bg-muted/50 rounded w-64"></div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="mx-auto h-5 w-16 bg-muted rounded-full"></div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="mx-auto h-4 w-8 bg-muted/50 rounded"></div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <div className="h-8 w-8 bg-muted/50 rounded-lg"></div>
                        <div className="h-8 w-8 bg-muted/50 rounded-lg"></div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : responses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-text-tertiary text-sm">
                    ยังไม่มีข้อความสำเร็จรูป — กด “เพิ่มข้อความ” เพื่อเริ่มต้น
                  </td>
                </tr>
              ) : (
                responses.map((row) => (
                  <tr key={row.id} className="hover:bg-bg/50 transition-colors align-top">
                    <td className="px-5 py-4">
                      <span className="font-mono font-semibold text-brand-600 dark:text-brand-400 thai-no-break">
                        /{row.shortcut}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-text-primary">{row.title}</div>
                      <div className="text-sm text-text-tertiary line-clamp-2 max-w-md">{row.content}</div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <Badge variant="secondary" size="sm" className="thai-no-break">
                        {CATEGORY_LABEL[row.category] ?? row.category}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-center text-sm text-text-secondary">
                      {row.usage_count ?? 0}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <ActionIconButton
                          icon={<SquarePen className="w-4 h-4" />}
                          label="แก้ไข"
                          variant="muted"
                          onClick={() => openEdit(row)}
                        />
                        <ActionIconButton
                          icon={<Trash2 className="w-4 h-4" />}
                          label="ลบ"
                          variant="danger"
                          onClick={() => setConfirmDelete({ open: true, id: row.id })}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDelete.open}
        onClose={() => setConfirmDelete({ open: false, id: null })}
        onConfirm={() => {
          void handleDelete(confirmDelete.id!);
          setConfirmDelete({ open: false, id: null });
        }}
        title="ยืนยันการลบ"
        description="ต้องการลบข้อความสำเร็จรูปนี้หรือไม่?"
        confirmText="ลบ"
        variant="danger"
      />
    </div>
  );
}
