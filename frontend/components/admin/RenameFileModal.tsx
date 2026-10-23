'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface RenameFileModalProps {
  filename: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: (filename: string) => void;
}

/** Rename dialog extracted from the files page to keep it under 1k lines.
 * Remount per file (key={file.id}) so the draft always starts from that file. */
export function RenameFileModal({ filename, saving, onClose, onSave }: RenameFileModalProps) {
  const [name, setName] = useState(filename ?? '');

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  };

  return (
    <Modal
      isOpen={filename !== null}
      onClose={onClose}
      title="แก้ไขชื่อไฟล์"
      maxWidth="md"
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="rename-filename" className="block text-sm font-medium text-text-secondary mb-1">ชื่อไฟล์</label>
          <Input
            id="rename-filename"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit} disabled={saving || name.trim() === ''}>
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default RenameFileModal;
