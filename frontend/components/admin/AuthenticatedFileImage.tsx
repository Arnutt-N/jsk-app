'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import {
  File as FileIcon,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-error';

/** Minimal shape the preview needs; the page's MediaFile satisfies it. */
export interface PreviewableFile {
  id: string;
  filename: string;
  category: string;
  thumbnail_url: string | null;
  public_url: string | null;
  public_token: string | null;
}

export type PreviewCategory = 'ALL' | 'DOCUMENT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';

export const CATEGORY_META: Record<PreviewCategory, { label: string; icon: React.ReactNode; color: string }> = {
  ALL:      { label: 'ทั้งหมด',  icon: <FileIcon className="w-4 h-4" />,  color: 'gray' },
  DOCUMENT: { label: 'เอกสาร',   icon: <FileText className="w-4 h-4" />,  color: 'blue' },
  IMAGE:    { label: 'รูปภาพ',    icon: <ImageIcon className="w-4 h-4" />, color: 'green' },
  VIDEO:    { label: 'วิดีโอ',    icon: <Video className="w-4 h-4" />,     color: 'navy' },
  AUDIO:    { label: 'เสียง',     icon: <Music className="w-4 h-4" />,     color: 'amber' },
  OTHER:    { label: 'อื่นๆ',     icon: <FileIcon className="w-4 h-4" />,  color: 'gray' },
};

export function getCategoryIcon(cat: string) {
  return CATEGORY_META[cat as PreviewCategory]?.icon ?? <FileIcon className="w-4 h-4" />;
}

// Shown when a private file has no token the browser could use directly.
export const PRIVATE_PREVIEW_REASON = 'ไฟล์ส่วนตัว — กดสร้างลิงก์สาธารณะเพื่อดู';

// Direct (no-auth) URL for a file, or null when the browser must not try
// one: a tokenless private file 403s on `/media/{id}`, so callers fetch the
// bytes through the admin download endpoint instead.
export function getDirectMediaUrl<T extends PreviewableFile>(file: T, buildUrl: (f: T) => string): string | null {
  if (file.thumbnail_url) return file.thumbnail_url;
  if (file.public_url) return file.public_url;
  if (file.public_token) return buildUrl(file);
  return null;
}

export type AuthenticatedMediaState =
  | { kind: 'direct'; url: string }
  | { kind: 'loading' }
  | { kind: 'ready'; url: string }
  | { kind: 'failed' };

// Object URL because `<img>`/`<video>` cannot attach auth headers on their own.
// Keeps its render-phase reset: the same hook also drives the preview modal,
// where a remount key cannot reach this component-local fetch state.
export function useAuthenticatedMediaUrl(fileId: string | null, directUrl: string | null): AuthenticatedMediaState {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [prevKey, setPrevKey] = useState<string | null>(null);
  const key = fileId && !directUrl ? fileId : null;
  if (prevKey !== key) {
    setPrevKey(key);
    setBlobUrl(null);
    setFailed(false);
  }

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    void (async () => {
      const result = await apiFetch<Response>(`/admin/media/${key}/download`, { raw: true });
      if (cancelled) return;
      if (!result.ok) {
        setFailed(true);
        return;
      }
      try {
        const blob = await result.data.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  if (directUrl) return { kind: 'direct', url: directUrl };
  if (failed) return { kind: 'failed' };
  if (blobUrl) return { kind: 'ready', url: blobUrl };
  return { kind: 'loading' };
}

// Thumbnail that can show private images: falls back to the category icon
// plus the Thai private-file reason when no viewable URL exists, and
// reports failures through `onLoadFailed` (the parent `markBroken`).
// Parents MUST pass key={`${file.id}|${directUrl ?? ''}`} so a file switch
// remounts (resetting imgBroken) instead of relying on render-phase setState.
export default function AuthenticatedFileImage({
  file,
  directUrl,
  fill,
  className,
  fallbackAction,
  onLoadFailed,
}: {
  file: PreviewableFile;
  directUrl: string | null;
  fill: boolean;
  className: string;
  fallbackAction?: React.ReactNode;
  onLoadFailed: (id: string) => void;
}) {
  const state = useAuthenticatedMediaUrl(file.id, directUrl);
  const [imgBroken, setImgBroken] = useState(false);

  const handleError = useCallback(() => {
    setImgBroken(true);
    onLoadFailed(file.id);
  }, [file.id, onLoadFailed]);

  useEffect(() => {
    if (state.kind === 'failed') onLoadFailed(file.id);
  }, [state.kind, file.id, onLoadFailed]);

  if (state.kind === 'failed' || imgBroken) {
    return (
      <div className="flex flex-col items-center gap-1 px-2 py-6 text-center text-text-tertiary">
        {getCategoryIcon(file.category)}
        <span className="text-[10px] line-clamp-2 max-w-[90%]">{file.filename}</span>
        <span className="text-[10px] text-amber-600 dark:text-amber-400">
          {directUrl ? 'ไม่สามารถโหลดภาพตัวอย่างได้' : PRIVATE_PREVIEW_REASON}
        </span>
        {fallbackAction}
      </div>
    );
  }

  const src = state.kind === 'direct' || state.kind === 'ready' ? state.url : null;
  if (!src) {
    return (
      <div className="flex items-center justify-center w-full h-full animate-pulse text-text-tertiary">
        {getCategoryIcon(file.category)}
      </div>
    );
  }

  if (fill) {
    return (
      <Image src={src} alt={file.filename} fill unoptimized className={className} onError={handleError} />
    );
  }
  return (
    <Image src={src} alt={file.filename} width={1600} height={1200} unoptimized className={className} onError={handleError} />
  );
}
