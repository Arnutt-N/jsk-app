'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACCEPTED_TYPES,
  MAX_MEDIA_UPLOAD_BYTES,
  OUTPUT_FORMATS,
  buildOutputFilename,
  computeLockedDimension,
  decodeDimensions,
  parseDimension,
  resizeImage,
  type OutputFormat,
  type ResizePreset,
} from './image-utils';
import { readErrorMessage } from '@/lib/api-error';

interface ToastFn {
  toast: (props: { title: string; description?: string; variant?: 'default' | 'success' | 'error' | 'warning' | 'info' }) => void;
}

export function useImageResize({ toast }: ToastFn) {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceDims, setSourceDims] = useState<{ width: number; height: number } | null>(null);
  const [gifWarning, setGifWarning] = useState(false);

  const [targetWidth, setTargetWidthRaw] = useState('');
  const [targetHeight, setTargetHeightRaw] = useState('');
  const [lockAspect, setLockAspect] = useState(true);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [format, setFormat] = useState<OutputFormat>('image/png');
  const [quality, setQuality] = useState(0.85);

  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const generationRef = useRef(0);
  const sourceUrlRef = useRef<string | null>(null);
  const outputUrlRef = useRef<string | null>(null);

  const parsedWidth = parseDimension(targetWidth);
  const parsedHeight = parseDimension(targetHeight);

  const clearOutput = useCallback(() => {
    generationRef.current++;
    setOutputBlob(null);
    setError(null);
    setProcessing(false);
    if (outputUrlRef.current) {
      URL.revokeObjectURL(outputUrlRef.current);
      outputUrlRef.current = null;
    }
    setOutputUrl(null);
  }, []);

  const selectFile = useCallback(
    async (file: File) => {
      if (!Object.keys(ACCEPTED_TYPES).includes(file.type)) {
        toast({ title: 'ไฟล์ไม่รองรับ', description: 'รองรับเฉพาะ PNG, JPEG, WebP และ GIF เท่านั้น (ไม่รองรับ SVG)', variant: 'error' });
        return;
      }
      try {
        const dims = await decodeDimensions(file);
        if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
        const url = URL.createObjectURL(file);
        sourceUrlRef.current = url;

        setSourceFile(file);
        setSourceUrl(url);
        setSourceDims(dims);
        setGifWarning(file.type === 'image/gif');
        setTargetWidthRaw(String(dims.width));
        setTargetHeightRaw(String(dims.height));
        setLockAspect(true);
        setActivePresetId(null);
        clearOutput();

        if (file.type === 'image/gif') {
          toast({ title: 'ไฟล์ GIF', description: 'จะใช้เฟรมแรกเท่านั้น (ไม่รองรับภาพเคลื่อนไหว)', variant: 'warning' });
        }
      } catch (err) {
        console.error('Failed to decode image dimensions:', err);
        toast({ title: 'อ่านไฟล์ไม่สำเร็จ', description: 'ไฟล์อาจเสียหายหรือรูปแบบไม่ถูกต้อง', variant: 'error' });
      }
    },
    [toast, clearOutput],
  );

  const clearFile = useCallback(() => {
    clearOutput();
    if (sourceUrlRef.current) {
      URL.revokeObjectURL(sourceUrlRef.current);
      sourceUrlRef.current = null;
    }
    setSourceFile(null);
    setSourceUrl(null);
    setSourceDims(null);
    setGifWarning(false);
    setTargetWidthRaw('');
    setTargetHeightRaw('');
    setActivePresetId(null);
  }, [clearOutput]);

  const setTargetWidth = useCallback(
    (v: string) => {
      setTargetWidthRaw(v);
      setActivePresetId(null);
      if (lockAspect && sourceDims) {
        const n = parseDimension(v);
        if (n) setTargetHeightRaw(String(computeLockedDimension('width', n, sourceDims.width, sourceDims.height)));
      }
    },
    [lockAspect, sourceDims],
  );

  const setTargetHeight = useCallback(
    (v: string) => {
      setTargetHeightRaw(v);
      setActivePresetId(null);
      if (lockAspect && sourceDims) {
        const n = parseDimension(v);
        if (n) setTargetWidthRaw(String(computeLockedDimension('height', n, sourceDims.width, sourceDims.height)));
      }
    },
    [lockAspect, sourceDims],
  );

  const applyPreset = useCallback((preset: ResizePreset) => {
    setTargetWidthRaw(String(preset.width));
    setTargetHeightRaw(String(preset.height));
    setLockAspect(true);
    setActivePresetId(preset.id);
  }, []);

  useEffect(() => {
    if (!sourceFile || !parsedWidth || !parsedHeight) {
      if (outputBlob || error) clearOutput();
      return;
    }
    const gen = ++generationRef.current;
    setProcessing(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const blob = await resizeImage(sourceFile, parsedWidth, parsedHeight, format, quality);
        if (generationRef.current !== gen) return;
        if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
        const url = URL.createObjectURL(blob);
        outputUrlRef.current = url;
        setOutputBlob(blob);
        setOutputUrl(url);
        setProcessing(false);
      } catch (err) {
        if (generationRef.current !== gen) return;
        setOutputBlob(null);
        setOutputUrl(null);
        setProcessing(false);
        setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ');
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [sourceFile, parsedWidth, parsedHeight, format, quality]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: invalidate in-flight async resize on unmount
      generationRef.current++;
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    };
  }, []);

  const activeFormat = OUTPUT_FORMATS.find((f) => f.value === format) ?? OUTPUT_FORMATS[0];

  const downloadOutput = useCallback(() => {
    if (!outputBlob || !parsedWidth || !parsedHeight) return;
    const filename = buildOutputFilename(sourceFile?.name ?? 'image', parsedWidth, parsedHeight, activeFormat.ext);
    const url = URL.createObjectURL(outputBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [outputBlob, parsedWidth, parsedHeight, sourceFile, activeFormat.ext]);

  const uploadToMedia = useCallback(async () => {
    if (!outputBlob || !parsedWidth || !parsedHeight) return;
    if (outputBlob.size > MAX_MEDIA_UPLOAD_BYTES) {
      toast({ title: 'ไฟล์ใหญ่เกินไป', description: 'ไฟล์ผลลัพธ์เกิน 10MB — ลดขนาดหรือคุณภาพลง แล้วลองใหม่', variant: 'error' });
      return;
    }
    setUploading(true);
    try {
      const filename = buildOutputFilename(sourceFile?.name ?? 'image', parsedWidth, parsedHeight, activeFormat.ext);
      const file = new File([outputBlob], filename, { type: format });
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/v1/admin/media', { method: 'POST', body: form });
      if (!res.ok) {
        const msg = await readErrorMessage(res, 'อัปโหลดล้มเหลว');
        toast({ title: 'อัปโหลดไม่สำเร็จ', description: msg, variant: 'error' });
        return;
      }
      toast({ title: 'อัปโหลดเข้า Media Library สำเร็จ', description: `ไฟล์ ${filename} พร้อมใช้งานในหน้า File Management`, variant: 'success' });
    } catch (err) {
      toast({ title: 'อัปโหลดไม่สำเร็จ', description: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ', variant: 'error' });
    } finally {
      setUploading(false);
    }
  }, [outputBlob, parsedWidth, parsedHeight, sourceFile, activeFormat.ext, format, toast]);

  return {
    sourceFile,
    sourceUrl,
    sourceDims,
    gifWarning,
    targetWidth,
    targetHeight,
    parsedWidth,
    parsedHeight,
    lockAspect,
    setLockAspect,
    activePresetId,
    format,
    setFormat,
    quality,
    setQuality,
    outputBlob,
    outputUrl,
    processing,
    error,
    uploading,
    selectFile,
    clearFile,
    setTargetWidth,
    setTargetHeight,
    applyPreset,
    downloadOutput,
    uploadToMedia,
  };
}
