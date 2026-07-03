/**
 * ActionEditor — edits a single LINE action (message / uri / postback).
 *
 * Used by template buttons/columns, image carousel columns, and quick-reply
 * items. Advanced action types (datetimepicker, camera, location, …) are left
 * to the JSON escape hatch to keep this editor focused.
 */
import { useId } from 'react';
import { Trash2 } from 'lucide-react';
import type { LineAction } from '@/lib/line/message-types';
import { FIELD_CLS, isAllowedActionUri, URI_SCHEME_ERROR_TH } from '../payload-utils';

const ACTION_TYPES: LineAction['type'][] = ['message', 'uri', 'postback'];

/** Narrow a raw DOM select value to the LineAction type union (ts-5). */
function isActionType(value: string): value is LineAction['type'] {
  return (ACTION_TYPES as string[]).includes(value);
}

export interface ActionEditorProps {
  action: LineAction;
  onChange: (next: LineAction) => void;
  onRemove?: () => void;
  /** Unique accessible name for the remove button (a11y-7), e.g. "ลบปุ่มที่ 2". */
  removeLabel?: string;
}

export function ActionEditor({ action, onChange, onRemove, removeLabel }: ActionEditorProps) {
  const type = action.type ?? 'message';
  const set = (patch: Partial<LineAction>) => onChange({ ...action, ...patch });

  const uriErrorId = useId();
  const uriValue = action.uri ?? '';
  const hasInvalidUri = type === 'uri' && uriValue.trim() !== '' && !isAllowedActionUri(uriValue);

  return (
    <div className="rounded-lg border border-border-default bg-surface p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          className={FIELD_CLS}
          aria-label="ป้ายปุ่ม (label)"
          placeholder="ป้ายปุ่ม (label)"
          value={action.label ?? ''}
          onChange={(e) => set({ label: e.target.value })}
        />
        <select
          className={`${FIELD_CLS} w-28 shrink-0`}
          aria-label="ชนิด action"
          value={type}
          onChange={(e) => {
            const next = e.target.value;
            if (isActionType(next)) set({ type: next });
          }}
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
            aria-label={removeLabel ?? 'ลบ action'}
            className="shrink-0 p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {type === 'message' && (
        <input
          className={FIELD_CLS}
          aria-label="ข้อความที่จะส่ง (text)"
          placeholder="ข้อความที่จะส่ง (text)"
          value={action.text ?? ''}
          onChange={(e) => set({ text: e.target.value })}
        />
      )}
      {type === 'uri' && (
        <>
          <input
            className={FIELD_CLS}
            aria-label="ลิงก์ (uri)"
            placeholder="https://example.com"
            value={uriValue}
            aria-invalid={hasInvalidUri || undefined}
            aria-describedby={hasInvalidUri ? uriErrorId : undefined}
            onChange={(e) => set({ uri: e.target.value })}
          />
          {hasInvalidUri && (
            <p id={uriErrorId} role="alert" className="text-xs text-red-500">
              {URI_SCHEME_ERROR_TH}
            </p>
          )}
        </>
      )}
      {type === 'postback' && (
        <>
          <input
            className={FIELD_CLS}
            aria-label="ข้อมูล postback (data)"
            placeholder="data (เช่น action=buy&id=1)"
            value={action.data ?? ''}
            onChange={(e) => set({ data: e.target.value })}
          />
          <input
            className={FIELD_CLS}
            aria-label="displayText (ไม่บังคับ)"
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
