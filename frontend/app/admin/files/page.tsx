'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload, Download, Trash2, Link2, LinkIcon, Search,
  FileText, Image as ImageIcon, Video, Music, File as FileIcon,
  Grid3X3, List, Copy, Check, Eye, ExternalLink,
  ChevronLeft, ChevronRight, AlertTriangle,
} from 'lucide-react';
import {
  Button, Card, Badge, Input, Modal,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Checkbox,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { ActionIconButton } from '@/components/ui/ActionIconButton';
import { cn } from '@/lib/utils';
import { StaggerContainer, StaggerItem } from '@/components/ui/PageTransition';
import PageHeader from '../components/PageHeader';
import { apiFetch } from '@/lib/api-error';
import { API_BASE } from '@/lib/constants/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MediaFile {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  category: Category;
  is_public: boolean;
  public_token: string | null;
  public_url: string | null;
  thumbnail_url: string | null;
  created_at: string | null;
}

type Category = 'ALL' | 'DOCUMENT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';

interface Stats {
  total_count: number;
  total_size: number;
  by_category: Record<string, { count: number; total_size: number }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<Category, { label: string; icon: React.ReactNode; color: string }> = {
  ALL:      { label: 'ทั้งหมด',  icon: <FileIcon className="w-4 h-4" />,  color: 'gray' },
  DOCUMENT: { label: 'เอกสาร',   icon: <FileText className="w-4 h-4" />,  color: 'blue' },
  IMAGE:    { label: 'รูปภาพ',    icon: <ImageIcon className="w-4 h-4" />, color: 'green' },
  VIDEO:    { label: 'วิดีโอ',    icon: <Video className="w-4 h-4" />,     color: 'navy' },
  AUDIO:    { label: 'เสียง',     icon: <Music className="w-4 h-4" />,     color: 'amber' },
  OTHER:    { label: 'อื่นๆ',     icon: <FileIcon className="w-4 h-4" />,  color: 'gray' },
};

const BADGE_VARIANT_MAP: Record<string, 'info' | 'success' | 'primary' | 'warning' | 'gray'> = {
  DOCUMENT: 'info',
  IMAGE: 'success',
  VIDEO: 'primary',
  AUDIO: 'warning',
  OTHER: 'gray',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getCategoryIcon(cat: string) {
  return CATEGORY_META[cat as Category]?.icon ?? <FileIcon className="w-4 h-4" />;
}

function isImageMime(mime: string) {
  return mime.startsWith('image/');
}
function isVideoMime(mime: string) {
  return mime.startsWith('video/');
}
function isAudioMime(mime: string) {
  return mime.startsWith('audio/');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function FilesPage() {
  const { toast } = useToast();

  // Data state
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Filters
  const [category, setCategory] = useState<Category>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // View
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Modals
  const [publicLinkFile, setPublicLinkFile] = useState<MediaFile | null>(null);
  const [previewFile, setPreviewFile] = useState<MediaFile | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[]; show: boolean }>({ ids: [], show: false });
  const [copied, setCopied] = useState(false);

  // Track files whose <img> failed to load so we can show the category icon
  // fallback instead of a broken-image glyph. Cleared when the file list refetches.
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());
  const markBroken = useCallback((id: string) => {
    setBrokenIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);
  useEffect(() => { setBrokenIds(new Set()); }, [files]);

  // Drag and drop
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------
  const fetchFiles = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (category !== 'ALL') params.set('category', category);
    if (search) params.set('search', search);
    params.set('page', String(page));
    params.set('page_size', '24');

    const result = await apiFetch<{ items: MediaFile[]; total_pages: number; total: number }>(`/admin/media?${params}`);
    if (result.ok) {
      setFiles(result.data.items || []);
      setTotalPages(result.data.total_pages || 1);
      setTotalItems(result.data.total || 0);
    } else {
      toast({ title: result.message, variant: 'error' });
    }
    setLoading(false);
  }, [category, search, page, toast]);

  const fetchStats = useCallback(async () => {
    const result = await apiFetch<Stats>('/admin/media/stats');
    if (result.ok) {
      setStats(result.data);
    }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Reset page when filter changes
  useEffect(() => { setPage(1); }, [category, search]);

  // -----------------------------------------------------------------------
  // Upload
  // -----------------------------------------------------------------------
  const uploadFiles = useCallback(async (fileList: FileList | File[]) => {
    setUploading(true);
    let successCount = 0;
    let failCount = 0;
    const arr = Array.from(fileList);
    for (const f of arr) {
      const form = new FormData();
      form.append('file', f);
      const result = await apiFetch('/admin/media', { method: 'POST', body: form });
      if (result.ok) {
        successCount++;
      } else {
        failCount++;
      }
    }
    setUploading(false);
    if (successCount > 0) {
      toast({ title: `อัปโหลดสำเร็จ ${successCount} ไฟล์${failCount > 0 ? ` (ล้มเหลว ${failCount} ไฟล์)` : ''}`, variant: 'success' });
      fetchFiles();
      fetchStats();
    } else if (failCount > 0) {
      toast({ title: `อัปโหลดล้มเหลว ${failCount} ไฟล์ กรุณาตรวจสอบขนาดหรือประเภทไฟล์`, variant: 'error' });
    }
  }, [fetchFiles, fetchStats, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  }, [uploadFiles]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------
  const downloadFile = useCallback(async (file: MediaFile) => {
    const result = await apiFetch<Response>(`/admin/media/${file.id}/download`, { raw: true });
    if (result.ok) {
      const blob = await result.data.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      toast({ title: result.message, variant: 'error' });
    }
  }, [toast]);

  const createPublicLink = useCallback(async (file: MediaFile) => {
    const result = await apiFetch<MediaFile>(`/admin/media/${file.id}/public`, { method: 'POST' });
    if (result.ok) {
      setFiles(prev => prev.map(f => f.id === result.data.id ? result.data : f));
      setPublicLinkFile(result.data);
      toast({ title: 'สร้างลิงก์สาธารณะสำเร็จ', variant: 'success' });
    } else {
      toast({ title: result.message, variant: 'error' });
    }
  }, [toast]);

  const revokePublicLink = useCallback(async (file: MediaFile) => {
    const result = await apiFetch<MediaFile>(`/admin/media/${file.id}/public`, { method: 'DELETE' });
    if (result.ok) {
      setFiles(prev => prev.map(f => f.id === result.data.id ? result.data : f));
      setPublicLinkFile(null);
      toast({ title: 'ยกเลิกลิงก์สาธารณะแล้ว', variant: 'success' });
      fetchStats();
    } else {
      toast({ title: result.message, variant: 'error' });
    }
  }, [toast, fetchStats]);

  const deleteFiles = useCallback(async (ids: string[]) => {
    const result = ids.length === 1
      ? await apiFetch(`/admin/media/${ids[0]}`, { method: 'DELETE' })
      : await apiFetch('/admin/media/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
    if (result.ok) {
      toast({ title: `ลบ ${ids.length} ไฟล์สำเร็จ`, variant: 'success' });
      setSelected(new Set());
      fetchFiles();
      fetchStats();
    } else {
      toast({ title: result.message, variant: 'error' });
    }
    setDeleteConfirm({ ids: [], show: false });
  }, [toast, fetchFiles, fetchStats]);

  const bulkCreatePublic = useCallback(async () => {
    const result = await apiFetch('/admin/media/bulk-public', {
      method: 'POST',
      body: JSON.stringify({ ids: Array.from(selected) }),
    });
    if (result.ok) {
      toast({ title: 'สร้างลิงก์สาธารณะสำเร็จ', variant: 'success' });
      setSelected(new Set());
      fetchFiles();
    } else {
      toast({ title: result.message, variant: 'error' });
    }
  }, [selected, toast, fetchFiles]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  // -----------------------------------------------------------------------
  // Selection helpers
  // -----------------------------------------------------------------------
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === files.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(files.map(f => f.id)));
    }
  };

  const allSelected = files.length > 0 && selected.size === files.length;
  const someSelected = selected.size > 0;

  // -----------------------------------------------------------------------
  // File preview URL (internal, for images)
  // -----------------------------------------------------------------------
  const getPreviewUrl = useCallback((file: MediaFile) => {
    if (file.thumbnail_url) return file.thumbnail_url;
    if (file.public_url) return file.public_url;
    // NOTE: the `/media/{id}` endpoint serves the raw binary; the <img>
    // tag will still issue a request and may 401/404 for private files
    // that lack a public token. The render path tracks broken loads in
    // `brokenIds` and falls back to the category icon.
    if (isImageMime(file.mime_type)) return `${API_BASE}/media/${file.id}`;
    return null;
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageHeader title="จัดการไฟล์" subtitle="อัปโหลดและจัดการไฟล์ในระบบ" />

      {/* Stats bar */}
      {stats && (
        <StaggerContainer className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StaggerItem>
          <Card padding="xs" className="text-center">
            <p className="text-xs text-text-secondary">ทั้งหมด</p>
            <p className="text-lg font-bold text-text-primary">{stats.total_count}</p>
            <p className="text-xs text-text-tertiary">{formatBytes(stats.total_size)}</p>
          </Card>
          </StaggerItem>
          {(['DOCUMENT', 'IMAGE', 'VIDEO', 'AUDIO', 'OTHER'] as const).map(cat => {
            const d = stats.by_category[cat];
            return (
              <StaggerItem key={cat}>
              <Card padding="xs" className="text-center">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  {CATEGORY_META[cat].icon}
                  <span className="text-xs text-text-secondary">{CATEGORY_META[cat].label}</span>
                </div>
                <p className="text-lg font-bold text-text-primary">{d?.count ?? 0}</p>
                <p className="text-xs text-text-tertiary">{formatBytes(d?.total_size ?? 0)}</p>
              </Card>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      )}

      {/* Upload zone */}
      <div
        className={cn(
          'border-2 border-dashed rounded-2xl p-8 text-center transition-colors',
          dragOver
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
            : 'border-border-default hover:border-brand-300',
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Upload className="w-10 h-10 mx-auto text-text-tertiary mb-3" />
        <p className="text-text-secondary font-medium">
          ลากไฟล์มาวางที่นี่ หรือ
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          isLoading={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          เลือกไฟล์
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) uploadFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Toolbar: search + view toggle + bulk actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0 w-full sm:w-auto">
          <Input
            placeholder="ค้นหาชื่อไฟล์..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
            className="max-w-xs"
          />
          {someSelected && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-sm text-text-secondary">{selected.size} รายการ</span>
              <Button size="xs" variant="outline" onClick={bulkCreatePublic}>
                <Link2 className="w-4 h-4 mr-1 flex-shrink-0" />สร้างลิงก์
              </Button>
              <Button
                size="xs"
                variant="danger"
                onClick={() => setDeleteConfirm({ ids: Array.from(selected), show: true })}
              >
                <Trash2 className="w-4 h-4 mr-1 flex-shrink-0" />ลบ
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'p-2 rounded-lg transition-colors',
              viewMode === 'grid'
                ? 'bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400'
                : 'text-text-tertiary hover:bg-gray-100 dark:hover:bg-gray-700',
            )}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'p-2 rounded-lg transition-colors',
              viewMode === 'list'
                ? 'bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400'
                : 'text-text-tertiary hover:bg-gray-100 dark:hover:bg-gray-700',
            )}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <Tabs defaultValue="ALL" value={category} onValueChange={(v) => setCategory(v as Category)}>
        <TabsList className="flex-wrap">
          {(['ALL', 'DOCUMENT', 'IMAGE', 'VIDEO', 'AUDIO', 'OTHER'] as const).map(cat => (
            <TabsTrigger key={cat} value={cat}>
              <span className="flex items-center gap-1.5">
                {CATEGORY_META[cat].icon}
                {CATEGORY_META[cat].label}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* We render one TabsContent for all because data is filtered server-side */}
        {(['ALL', 'DOCUMENT', 'IMAGE', 'VIDEO', 'AUDIO', 'OTHER'] as const).map(cat => (
          <TabsContent key={cat} value={cat}>
            {loading ? (
              <LoadingSpinner label="กำลังโหลด..." />
            ) : files.length === 0 ? (
              <Card padding="lg" className="text-center">
                <FileIcon className="w-12 h-12 mx-auto text-text-tertiary mb-3" />
                <p className="text-text-secondary">ไม่พบไฟล์</p>
              </Card>
            ) : viewMode === 'grid' ? (
              /* ---------- GRID VIEW ---------- */
              <div>
                {/* Select all for grid */}
                <div className="flex items-center gap-2 mb-3">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={() => selectAll()}
                  />
                  <span className="text-sm text-text-secondary">เลือกทั้งหมด</span>
                </div>

                <StaggerContainer className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {files.map(file => {
                    const preview = getPreviewUrl(file);
                    const isBroken = brokenIds.has(file.id);
                    const showImage = preview && !isBroken;
                    const isSelected = selected.has(file.id);
                    return (
                      <StaggerItem key={file.id}>
                      <Card
                        padding="none"
                        hover="border"
                        className={cn(
                          'group relative',
                          isSelected && 'ring-2 ring-brand-500',
                        )}
                      >
                        {/* Checkbox */}
                        <div className="absolute top-2 left-2 z-10">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(file.id)}
                          />
                        </div>

                        {/* Public badge */}
                        {file.is_public && (
                          <div className="absolute top-2 right-2 z-10">
                            <Badge variant="info" size="xs">
                              <LinkIcon className="w-3 h-3 mr-0.5" />สาธารณะ
                            </Badge>
                          </div>
                        )}

                        {/* Thumbnail area */}
                        <div
                          className="aspect-square bg-gray-50 dark:bg-gray-800 flex items-center justify-center cursor-pointer overflow-hidden"
                          onClick={() => setPreviewFile(file)}
                        >
                          {showImage ? (
                            <img
                              src={preview}
                              alt={file.filename}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={() => markBroken(file.id)}
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-1 text-text-tertiary" aria-hidden={!showImage}>
                              {getCategoryIcon(file.category)}
                              <span className="text-[10px] px-1 text-center line-clamp-2 max-w-[90%]">
                                {file.filename}
                              </span>
                              <span className="sr-only">{file.filename}</span>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-2.5">
                          <p className="text-xs font-medium text-text-primary truncate" title={file.filename}>
                            {file.filename}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Badge variant={BADGE_VARIANT_MAP[file.category] || 'gray'} size="xs">
                              {CATEGORY_META[file.category as Category]?.label || file.category}
                            </Badge>
                            <span className="text-[10px] text-text-tertiary">{formatBytes(file.size_bytes)}</span>
                          </div>

                          {/* Actions on hover */}
                          <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ActionIconButton
                              icon={<Download className="w-4 h-4" />}
                              label="ดาวน์โหลด"
                              variant="default"
                              onClick={() => downloadFile(file)}
                            />
                            <ActionIconButton
                              icon={<Link2 className="w-4 h-4" />}
                              label="สร้างลิงก์"
                              variant="default"
                              onClick={() => file.is_public ? setPublicLinkFile(file) : createPublicLink(file)}
                            />
                            <ActionIconButton
                              icon={<Eye className="w-4 h-4" />}
                              label="ดู"
                              variant="default"
                              onClick={() => setPreviewFile(file)}
                            />
                            <ActionIconButton
                              icon={<Trash2 className="w-4 h-4" />}
                              label="ลบ"
                              variant="danger"
                              onClick={() => setDeleteConfirm({ ids: [file.id], show: true })}
                            />
                          </div>
                        </div>
                      </Card>
                      </StaggerItem>
                    );
                  })}
                </StaggerContainer>
              </div>
            ) : (
              /* ---------- LIST VIEW ---------- */
              <div>
                <div className="bg-surface border border-border-default rounded-xl overflow-hidden">
                  {/* Header row */}
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-border-default text-xs font-medium text-text-secondary">
                    <div className="w-5">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                        onCheckedChange={() => selectAll()}
                      />
                    </div>
                    <div className="flex-1 min-w-0">ชื่อไฟล์</div>
                    <div className="w-20 text-center hidden sm:block">หมวดหมู่</div>
                    <div className="w-20 text-right hidden sm:block">ขนาด</div>
                    <div className="w-32 text-right hidden md:block">วันที่</div>
                    <div className="w-20 text-center">สถานะ</div>
                    <div className="w-28 text-center">การดำเนินการ</div>
                  </div>
                  {files.map(file => {
                    const isSelected = selected.has(file.id);
                    return (
                      <div
                        key={file.id}
                        className={cn(
                          'flex items-center gap-3 px-4 py-3 border-b border-border-default last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors',
                          isSelected && 'bg-brand-50/50 dark:bg-brand-900/10',
                        )}
                      >
                        <div className="w-5">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(file.id)}
                          />
                        </div>
                        <div
                          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                          onClick={() => setPreviewFile(file)}
                        >
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-text-tertiary">
                            {getCategoryIcon(file.category)}
                          </div>
                          <span className="text-sm font-medium text-text-primary truncate">
                            {file.filename}
                          </span>
                        </div>
                        <div className="w-20 text-center hidden sm:block">
                          <Badge variant={BADGE_VARIANT_MAP[file.category] || 'gray'} size="xs">
                            {CATEGORY_META[file.category as Category]?.label || file.category}
                          </Badge>
                        </div>
                        <div className="w-20 text-right text-xs text-text-secondary hidden sm:block">
                          {formatBytes(file.size_bytes)}
                        </div>
                        <div className="w-32 text-right text-xs text-text-tertiary hidden md:block">
                          {formatDate(file.created_at)}
                        </div>
                        <div className="w-20 text-center">
                          {file.is_public && (
                            <Badge variant="info" size="xs">
                              <LinkIcon className="w-3 h-3 mr-0.5" />สาธารณะ
                            </Badge>
                          )}
                        </div>
                        <div className="w-28 flex items-center justify-center gap-1">
                          <ActionIconButton
                            icon={<Download className="w-4 h-4" />}
                            label="ดาวน์โหลด"
                            variant="default"
                            onClick={() => downloadFile(file)}
                          />
                          <ActionIconButton
                            icon={<Link2 className="w-4 h-4" />}
                            label="สร้างลิงก์"
                            variant="default"
                            onClick={() => file.is_public ? setPublicLinkFile(file) : createPublicLink(file)}
                          />
                          <ActionIconButton
                            icon={<Trash2 className="w-4 h-4" />}
                            label="ลบ"
                            variant="danger"
                            onClick={() => setDeleteConfirm({ ids: [file.id], show: true })}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-text-secondary">
                  แสดง {files.length} จาก {totalItems} รายการ
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-text-secondary">
                    {page} / {totalPages}
                  </span>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* ================================================================= */}
      {/* Public Link Modal                                                  */}
      {/* ================================================================= */}
      <Modal
        isOpen={!!publicLinkFile}
        onClose={() => setPublicLinkFile(null)}
        title="ลิงก์สาธารณะ"
        maxWidth="md"
      >
        {publicLinkFile && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <FileIcon className="w-4 h-4" />
              <span className="truncate">{publicLinkFile.filename}</span>
            </div>

            {publicLinkFile.public_url ? (
              <>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                  <label className="text-xs font-medium text-text-secondary mb-1.5 block">URL</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm text-text-primary break-all select-all">
                      {publicLinkFile.public_url}
                    </code>
                    <Button
                      size="xs"
                      variant={copied ? 'success' : 'secondary'}
                      onClick={() => copyToClipboard(publicLinkFile.public_url!)}
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>

                <a
                  href={publicLinkFile.public_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-brand-500 hover:text-brand-600"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  เปิดในแท็บใหม่
                </a>

                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    ทุกคนที่มีลิงก์นี้สามารถเข้าถึงไฟล์ได้
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="danger"
                    size="sm"
                    className="flex-1"
                    onClick={() => revokePublicLink(publicLinkFile)}
                  >
                    ยกเลิกลิงก์สาธารณะ
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => setPublicLinkFile(null)}
                  >
                    ปิด
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-text-secondary mb-3">
                  ไฟล์นี้ยังไม่มีลิงก์สาธารณะ
                </p>
                <Button size="sm" onClick={() => createPublicLink(publicLinkFile)}>
                  สร้างลิงก์สาธารณะ
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* File Preview Modal                                                 */}
      {/* ================================================================= */}
      <Modal
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
        title={previewFile?.filename || 'ดูตัวอย่าง'}
        maxWidth="xl"
      >
        {previewFile && (
          <div className="space-y-4">
            {isImageMime(previewFile.mime_type) ? (
              <div className="flex justify-center min-h-[120px]">
                {brokenIds.has(previewFile.id) ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-12 text-text-tertiary">
                    {getCategoryIcon(previewFile.category)}
                    <p className="text-sm">ไม่สามารถโหลดภาพตัวอย่างได้</p>
                    <Button size="sm" variant="outline" onClick={() => downloadFile(previewFile)}>
                      <Download className="w-4 h-4 mr-1.5" />ดาวน์โหลด
                    </Button>
                  </div>
                ) : (
                  <img
                    src={getPreviewUrl(previewFile) ?? `${API_BASE}/media/${previewFile.id}`}
                    alt={previewFile.filename}
                    className="max-h-[60vh] rounded-xl object-contain"
                    onError={() => markBroken(previewFile.id)}
                  />
                )}
              </div>
            ) : isVideoMime(previewFile.mime_type) ? (
              <video
                controls
                className="w-full max-h-[60vh] rounded-xl"
                src={`${API_BASE}/media/${previewFile.id}`}
              />
            ) : isAudioMime(previewFile.mime_type) ? (
              <div className="flex justify-center py-8">
                <audio controls src={`${API_BASE}/media/${previewFile.id}`} />
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 mx-auto text-text-tertiary mb-4" />
                <p className="text-text-secondary mb-4">
                  ไม่สามารถแสดงตัวอย่างไฟล์นี้ได้
                </p>
                <Button size="sm" onClick={() => downloadFile(previewFile)}>
                  <Download className="w-4 h-4 mr-1.5" />ดาวน์โหลด
                </Button>
              </div>
            )}

            {/* File info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-text-secondary">ขนาด: </span>
                <span className="text-text-primary">{formatBytes(previewFile.size_bytes)}</span>
              </div>
              <div>
                <span className="text-text-secondary">ประเภท: </span>
                <span className="text-text-primary">{previewFile.mime_type}</span>
              </div>
              <div>
                <span className="text-text-secondary">หมวดหมู่: </span>
                <Badge variant={BADGE_VARIANT_MAP[previewFile.category] || 'gray'} size="xs">
                  {CATEGORY_META[previewFile.category as Category]?.label || previewFile.category}
                </Badge>
              </div>
              <div>
                <span className="text-text-secondary">วันที่: </span>
                <span className="text-text-primary">{formatDate(previewFile.created_at)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={() => downloadFile(previewFile)}
              >
                <Download className="w-4 h-4 mr-1.5" />ดาวน์โหลด
              </Button>
              <Button
                size="sm"
                variant={previewFile.is_public ? 'outline' : 'primary'}
                className="flex-1"
                onClick={() => {
                  setPreviewFile(null);
                  if (previewFile.is_public) {
                    setPublicLinkFile(previewFile);
                  } else {
                    createPublicLink(previewFile);
                  }
                }}
              >
                <Link2 className="w-4 h-4 mr-1.5" />
                {previewFile.is_public ? 'ดูลิงก์สาธารณะ' : 'สร้างลิงก์สาธารณะ'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* Delete Confirmation                                                */}
      {/* ================================================================= */}
      {/* Shared ConfirmDialog — the description composes the count (bold)
          and a red warning footnote, matching the request/broadcast/
          integration delete dialogs for visual consistency. */}
      <ConfirmDialog
        isOpen={deleteConfirm.show}
        onClose={() => setDeleteConfirm({ ids: [], show: false })}
        onConfirm={() => deleteFiles(deleteConfirm.ids)}
        title="ยืนยันการลบ"
        description={
          <>
            คุณต้องการลบ <b>{deleteConfirm.ids.length}</b> ไฟล์ใช่หรือไม่?
            <br />
            <span className="text-xs text-red-500 mt-2 block">ไฟล์ที่ลบไปแล้วจะไม่สามารถกู้คืนได้</span>
          </>
        }
        confirmText="ยืนยันลบ"
        cancelText="ยกเลิก"
        variant="danger"
      />
    </div>
  );
}
