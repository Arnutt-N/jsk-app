/**
 * ActionEditor — edits a single LINE action (message / uri / postback).
 *
 * Used by template buttons/columns, image carousel columns, and quick-reply
 * items. Advanced action types (datetimepicker, camera, location, …) are left
 * to the JSON escape hatch to keep this editor focused.
 */
import { Trash2 } from 'lucide-react';
import type { LineAction } from '@/lib/line/message-types';
import { FIELD_CLS } from '../payload-utils';

const ACTION_TYPES: LineAction['type'][] = ['message', 'uri', 'postback'];

export interface ActionEditorProps {
  action: LineAction;
  onChange: (next: LineAction) => void;
  onRemove?: () => void;
}

export function ActionEditor({ action, onChange, onRemove }: ActionEditorProps) {
  const type = action.type ?? 'message';
  const set = (patch: Partial<LineAction>) => onChange({ ...action, ...patch });

  return (
    <div className="rounded-lg border border-border-default bg-surface p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          className={FIELD_CLS}
          placeholder="ป้ายปุ่ม (label)"
          value={action.label ?? ''}
          onChange={(e) => set({ label: e.target.value })}
        />
        <select
          className={`${FIELD_CLS} w-28 shrink-0`}
          value={type}
          onChange={(e) => set({ type: e.target.value as LineAction['type'] })}
        >
          {ACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="ลบ action"
            className="shrink-0 p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {type === 'message' && (
        <input
          className={FIELD_CLS}
          placeholder="ข้อความที่จะส่ง (text)"
          value={action.text ?? ''}
          onChange={(e) => set({ text: e.target.value })}
        />
      )}
      {type === 'uri' && (
        <input
          className={FIELD_CLS}
          placeholder="https://example.com"
          value={action.uri ?? ''}
          onChange={(e) => set({ uri: e.target.value })}
        />
      )}
      {type === 'postback' && (
        <>
          <input
            className={FIELD_CLS}
            placeholder="data (เช่น action=buy&id=1)"
            value={action.data ?? ''}
            onChange={(e) => set({ data: e.target.value })}
          />
          <input
            className={FIELD_CLS}
            placeholder="displayText (ไม่บังคับ)"
            value={action.displayText ?? ''}
            onChange={(e) => set({ displayText: e.target.value })}
          />
        </>
      )}
    </div>
  );
}

export default ActionEditor;
