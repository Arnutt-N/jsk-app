/**
 * QuickReplyEditor — the quick-reply *modifier*, attachable to any payload.
 *
 * It reads/writes `payload.quickReply` (validated by the backend to ≤13 items).
 * Toggling it off returns `undefined` so the page can drop the key entirely.
 */
import { Plus } from 'lucide-react';
import type { QuickReply, QuickReplyItem } from '@/lib/line/message-types';
import { FIELD_CLS, LABEL_CLS, makeEmptyAction, withNewKey, getItemKey } from './payload-utils';
import { ActionEditor } from './editors/ActionEditor';

const MAX_QUICK_REPLY_ITEMS = 13;

export interface QuickReplyEditorProps {
  value: QuickReply | undefined;
  onChange: (next: QuickReply | undefined) => void;
}

function newItem(): QuickReplyItem {
  // Tagged with an internal `_key` (stable React key); stripped before save.
  return withNewKey({ type: 'action', action: makeEmptyAction() });
}

export function QuickReplyEditor({ value, onChange }: QuickReplyEditorProps) {
  const items = Array.isArray(value?.items) ? value!.items : [];
  const enabled = items.length > 0;

  const setItems = (next: QuickReplyItem[]) =>
    onChange(next.length > 0 ? { items: next } : undefined);

  const toggle = (on: boolean) => (on ? setItems([newItem()]) : onChange(undefined));
  const updateItem = (i: number, patch: Partial<QuickReplyItem>) =>
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => {
    if (items.length < MAX_QUICK_REPLY_ITEMS) setItems([...items, newItem()]);
  };
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  return (
    <div className="rounded-xl border border-border-default p-4 space-y-3">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => toggle(e.target.checked)}
          className="w-4 h-4 accent-brand-500"
        />
        <span className={LABEL_CLS}>Quick reply (ปุ่มลัดใต้ข้อความ)</span>
      </label>

      {enabled && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-tertiary">
              {items.length}/{MAX_QUICK_REPLY_ITEMS} ปุ่ม
            </span>
            <button
              type="button"
              onClick={addItem}
              disabled={items.length >= MAX_QUICK_REPLY_ITEMS}
              className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" /> เพิ่มปุ่ม
            </button>
          </div>

          {items.map((item, i) => (
            <div key={getItemKey(item, i)} className="space-y-2">
              <ActionEditor
                action={item.action ?? makeEmptyAction()}
                onChange={(a) => updateItem(i, { action: a })}
                onRemove={items.length > 1 ? () => removeItem(i) : undefined}
                removeLabel={`ลบปุ่มลัดที่ ${i + 1}`}
              />
              <input
                className={FIELD_CLS}
                aria-label={`imageUrl ไอคอนปุ่มลัดที่ ${i + 1} (ไม่บังคับ)`}
                placeholder="imageUrl ไอคอนปุ่ม (ไม่บังคับ)"
                value={item.imageUrl ?? ''}
                onChange={(e) => updateItem(i, { imageUrl: e.target.value })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default QuickReplyEditor;
