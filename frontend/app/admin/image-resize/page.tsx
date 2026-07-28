'use client';

import React from 'react';
import {
  Download, Upload, Lock, Unlock, RefreshCw,
  ImagePlus, AlertTriangle, Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { FileUploadZone, formatFileSize } from '@/components/ui/FileUploadZone';
import PageHeader from '../components/PageHeader';
import { useHasPermission } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { useImageResize } from './use-image-resize';
import {
  ACCEPTED_TYPES, MAX_SOURCE_BYTES, OUTPUT_FORMATS, RESIZE_PRESETS,
  type OutputFormat,
} from './image-utils';

const checkerboard =
  'bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#ffffff_0%_50%)] bg-[length:20px_20px] dark:bg-[repeating-conic-gradient(#374151_0%_25%,#1f2937_0%_50%)]';

const FORMAT_HELPER_TEXT: Record<OutputFormat, string> = {
  'image/png': 'ไม่สูญเสียคุณภาพ — รองรับพื้นหลังโปร่งใส',
  'image/jpeg': 'บีบอัดสูง — พื้นหลังโปร่งใสจะกลายเป็นสีขาว',
  'image/webp': 'บีบอัดสูง — รองรับพื้นหลังโปร่งใส',
};

export default function ImageResizePage() {
  const { toast } = useToast();
  const canManageFiles = useHasPermission('manage_files');
  const r = useImageResize({ toast });

  const sizeDelta =
    r.sourceFile && r.outputBlob
      ? Math.round((1 - r.outputBlob.size / r.sourceFile.size) * 100)
      : null;

  const renderPresetButtons = (group: 'line' | 'general') =>
    RESIZE_PRESETS.filter((p) => p.group === group).map((p) => (
      <button
        key={p.id}
        type="button"
        onClick={() => r.applyPreset(p)}
        className={cn(
          'px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
          r.activePresetId === p.id
            ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
            : 'border-border-default text-text-secondary hover:border-brand-300 hover:text-brand-600',
        )}
      >
        {p.label}
        <span className="block text-[10px] font-normal opacity-70">{p.width}×{p.height}</span>
      </button>
    ));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Image Resize"
        subtitle="ปรับขนาด / บีบอัดรูปภาพสำหรับ LINE Rich Menu, Flex Message และ OG Image"
      />

      {!r.sourceFile ? (
        <Card>
          <CardContent className="pt-6">
            <FileUploadZone
              accept={ACCEPTED_TYPES}
              maxFiles={1}
              maxSize={MAX_SOURCE_BYTES}
              onFilesSelected={(files) => r.selectFile(files[0])}
              onFilesRejected={() =>
                toast({ title: 'ไฟล์ไม่รองรับหรือใหญ่เกินไป', description: 'รองรับ PNG, JPEG, WebP, GIF สูงสุด 25MB', variant: 'error' })
              }
            >
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="w-14 h-14 rounded-2xl bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center">
                  <ImagePlus className="w-7 h-7 text-brand-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">ลากไฟล์มาวาง หรือคลิกเพื่อเลือกรูปภาพ</p>
                  <p className="text-xs text-text-tertiary mt-1">PNG, JPEG, WebP, GIF — สูงสุด 25MB</p>
                </div>
              </div>
            </FileUploadZone>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* Left: previews */}
          <div className="space-y-6 min-w-0">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base">ต้นฉบับ</CardTitle>
                <Button variant="ghost" size="sm" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={r.clearFile}>
                  เปลี่ยนไฟล์
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className={cn('rounded-xl overflow-hidden flex items-center justify-center', checkerboard)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.sourceUrl ?? undefined} alt="ต้นฉบับ" className="max-h-[360px] w-auto object-contain" />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="secondary" className="max-w-[200px] truncate">{r.sourceFile.name}</Badge>
                  {r.sourceDims && <Badge variant="secondary">{r.sourceDims.width}×{r.sourceDims.height}</Badge>}
                  <Badge variant="secondary">{formatFileSize(r.sourceFile.size)}</Badge>
                  {r.gifWarning && (
                    <Badge variant="warning">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      GIF — ใช้เฟรมแรกเท่านั้น
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">ผลลัพธ์</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {r.error && (
                  <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                    {r.error}
                  </div>
                )}
                <div className={cn('relative rounded-xl overflow-hidden flex items-center justify-center min-h-[160px]', checkerboard)}>
                  {r.processing && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-gray-900/60">
                      <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
                    </div>
                  )}
                  {r.outputUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={r.outputUrl} alt="ผลลัพธ์" className="max-h-[360px] w-auto object-contain" />
                  ) : (
                    !r.processing && !r.error && (
                      <p className="text-sm text-text-tertiary py-8">ระบุขนาดเป้าหมายเพื่อสร้างผลลัพธ์</p>
                    )
                  )}
                </div>
                {r.outputBlob && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="secondary">{r.parsedWidth}×{r.parsedHeight}</Badge>
                    <Badge variant="secondary">{formatFileSize(r.outputBlob.size)}</Badge>
                    {sizeDelta !== null && (
                      <Badge variant={sizeDelta >= 0 ? 'success' : 'warning'}>
                        {sizeDelta >= 0 ? `เล็กลง ${sizeDelta}%` : `ใหญ่ขึ้น ${Math.abs(sizeDelta)}%`}
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: controls */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">ขนาดเป้าหมาย (px)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">LINE</p>
                  <div className="flex flex-wrap gap-2">
                    {renderPresetButtons('line')}
                  </div>
                  <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide pt-1">ทั่วไป</p>
                  <div className="flex flex-wrap gap-2">
                    {renderPresetButtons('general')}
                  </div>
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <label htmlFor="ir-width" className="text-sm font-medium text-text-primary">กว้าง</label>
                    <Input
                      id="ir-width"
                      type="number"
                      min={1}
                      max={10000}
                      value={r.targetWidth}
                      onChange={(e) => r.setTargetWidth(e.target.value)}
                      errorMessage={r.targetWidth !== '' && !r.parsedWidth ? 'ค่า 1–10000' : undefined}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => r.setLockAspect(!r.lockAspect)}
                    title={r.lockAspect ? 'ปลดล็อกอัตราส่วน' : 'ล็อกอัตราส่วน'}
                    className={cn(
                      'shrink-0 h-9 w-9 rounded-lg border flex items-center justify-center transition-colors',
                      r.lockAspect
                        ? 'border-brand-300 bg-brand-50 text-brand-600 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
                        : 'border-border-default text-text-tertiary hover:text-text-secondary',
                    )}
                  >
                    {r.lockAspect ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 space-y-1">
                    <label htmlFor="ir-height" className="text-sm font-medium text-text-primary">สูง</label>
                    <Input
                      id="ir-height"
                      type="number"
                      min={1}
                      max={10000}
                      value={r.targetHeight}
                      onChange={(e) => r.setTargetHeight(e.target.value)}
                      errorMessage={r.targetHeight !== '' && !r.parsedHeight ? 'ค่า 1–10000' : undefined}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch checked={r.lockAspect} onCheckedChange={r.setLockAspect} />
                  <span className="text-sm text-text-secondary">ล็อกอัตราส่วนตามรูปต้นฉบับ</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">รูปแบบและคุณภาพ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="ir-format" className="text-sm font-medium text-text-primary">รูปแบบไฟล์</label>
                  <Select
                    id="ir-format"
                    value={r.format}
                    onChange={(e) => r.setFormat(e.target.value as OutputFormat)}
                    options={OUTPUT_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
                    helperText={FORMAT_HELPER_TEXT[r.format]}
                  />
                </div>
                {OUTPUT_FORMATS.find((f) => f.value === r.format)?.lossy && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-text-primary">คุณภาพ</label>
                      <span className="text-sm tabular-nums text-text-secondary">{Math.round(r.quality * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={5}
                      value={Math.round(r.quality * 100)}
                      onChange={(e) => r.setQuality(Number(e.target.value) / 100)}
                      className="w-full accent-brand-500"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-3">
              <Button
                className="w-full"
                leftIcon={<Download className="w-4 h-4" />}
                onClick={r.downloadOutput}
                disabled={!r.outputBlob || r.processing}
              >
                ดาวน์โหลด
              </Button>
              {canManageFiles && (
                <Button
                  variant="outline"
                  className="w-full"
                  leftIcon={<Upload className="w-4 h-4" />}
                  onClick={r.uploadToMedia}
                  isLoading={r.uploading}
                  loadingText="กำลังอัปโหลด..."
                  disabled={!r.outputBlob || r.processing}
                >
                  อัปโหลดเข้า Media Library
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
