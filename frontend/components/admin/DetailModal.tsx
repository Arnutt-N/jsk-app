'use client';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

export interface DetailRow {
  label: string;
  value: React.ReactNode;
}

interface DetailModalAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
}

interface DetailModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  rows: DetailRow[];
  /** Extra block below the rows (JSON viewer, image, preview...). */
  renderExtra?: React.ReactNode;
  actions?: DetailModalAction[];
  maxWidth?: 'md' | 'lg' | 'xl' | '2xl' | '4xl';
}

/**
 * Shared read-only detail modal: title + label/value rows + optional extra
 * block + action buttons. Replaces the per-page view modals.
 */
export function DetailModal({ title, open, onClose, rows, renderExtra, actions, maxWidth = 'lg' }: DetailModalProps) {
  return (
    <Modal isOpen={open} onClose={onClose} title={title} maxWidth={maxWidth}>
      <div className="space-y-4">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-xs text-text-tertiary mb-1">{row.label}</dt>
              <dd className="text-sm text-text-primary">{row.value}</dd>
            </div>
          ))}
        </dl>
        {renderExtra}
        <div className="flex justify-end gap-2">
          {(actions ?? [{ label: 'ปิด', onClick: onClose }]).map((action) => (
            <Button
              key={action.label}
              variant={action.variant ?? (action.label === 'ปิด' ? 'primary' : 'outline')}
              size="sm"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export default DetailModal;
