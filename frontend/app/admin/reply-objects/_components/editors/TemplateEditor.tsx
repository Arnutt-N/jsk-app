/**
 * TemplateEditor — structured editor for the `template` object type.
 *
 * Produces a `payload.template` object that satisfies the backend validator:
 *   - buttons:        text + 1–4 actions (title/thumbnail optional)
 *   - confirm:        text + exactly 2 actions
 *   - carousel:       1–10 columns (each: title/text/thumbnail + ≤3 actions)
 *   - image_carousel: 1–10 columns (each: imageUrl + 1 action)
 */
import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  TemplateContent,
  TemplateSubtype,
  ButtonsTemplate,
  ConfirmTemplate,
  CarouselTemplate,
  ImageCarouselTemplate,
  CarouselColumn,
  ImageCarouselColumn,
  LineAction,
} from '@/lib/line/message-types';
import { FIELD_CLS, LABEL_CLS, makeEmptyAction } from '../payload-utils';
import { ActionEditor } from './ActionEditor';

const SUBTYPES: { value: TemplateSubtype; label: string }[] = [
  { value: 'buttons', label: 'Buttons' },
  { value: 'confirm', label: 'Confirm' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'image_carousel', label: 'Image Carousel' },
];

const MAX_BUTTONS_ACTIONS = 4;
const MAX_COLUMN_ACTIONS = 3;
const MAX_COLUMNS = 10;

export interface TemplateEditorProps {
  payload: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

function readTemplate(payload: Record<string, unknown>): TemplateContent {
  const t = payload.template;
  if (t && typeof t === 'object' && !Array.isArray(t)) return t as TemplateContent;
  return { type: 'buttons', title: '', text: '', actions: [makeEmptyAction()] };
}

function defaultForSubtype(subtype: TemplateSubtype): TemplateContent {
  switch (subtype) {
    case 'buttons':
      return { type: 'buttons', title: '', text: '', actions: [makeEmptyAction()] };
    case 'confirm':
      return { type: 'confirm', text: '', actions: [makeEmptyAction(), makeEmptyAction()] };
    case 'carousel':
      return { type: 'carousel', columns: [{ title: '', text: '', actions: [makeEmptyAction()] }] };
    case 'image_carousel':
      return { type: 'image_carousel', columns: [{ imageUrl: '', action: makeEmptyAction('uri') }] };
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className={LABEL_CLS}>{label}</label>
      {children}
    </div>
  );
}

function ActionList({
  actions,
  max,
  onChange,
  label = 'ปุ่ม (actions)',
}: {
  actions: LineAction[];
  max: number;
  onChange: (next: LineAction[]) => void;
  label?: string;
}) {
  const update = (i: number, a: LineAction) => onChange(actions.map((x, idx) => (idx === i ? a : x)));
  const remove = (i: number) => onChange(actions.filter((_, idx) => idx !== i));
  const add = () => {
    if (actions.length < max) onChange([...actions, makeEmptyAction()]);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className={LABEL_CLS}>
          {label} · {actions.length}/{max}
        </label>
        <button
          type="button"
          onClick={add}
          disabled={actions.length >= max}
          className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" /> เพิ่ม
        </button>
      </div>
      {actions.map((a, i) => (
        <ActionEditor
          key={i}
          action={a}
          onChange={(na) => update(i, na)}
          onRemove={actions.length > 1 ? () => remove(i) : undefined}
        />
      ))}
      {actions.length === 0 && <p className="text-xs text-red-500">ต้องมีอย่างน้อย 1 ปุ่ม</p>}
    </div>
  );
}

function ButtonsForm({
  template,
  onChange,
}: {
  template: ButtonsTemplate;
  onChange: (t: ButtonsTemplate) => void;
}) {
  const actions = Array.isArray(template.actions) ? template.actions : [];
  return (
    <div className="space-y-3">
      <Field label="รูปหัวการ์ด (thumbnailImageUrl)">
        <input
          className={FIELD_CLS}
          placeholder="https://...jpg"
          value={template.thumbnailImageUrl ?? ''}
          onChange={(e) => onChange({ ...template, thumbnailImageUrl: e.target.value })}
        />
      </Field>
      <Field label="หัวข้อ (title)">
        <input
          className={FIELD_CLS}
          placeholder="หัวข้อการ์ด"
          value={template.title ?? ''}
          onChange={(e) => onChange({ ...template, title: e.target.value })}
        />
      </Field>
      <Field label="ข้อความ (text) *">
        <textarea
          className={`${FIELD_CLS} font-normal`}
          rows={2}
          placeholder="ข้อความที่จะแสดง (text)"
          value={template.text ?? ''}
          onChange={(e) => onChange({ ...template, text: e.target.value })}
        />
      </Field>
      <ActionList actions={actions} max={MAX_BUTTONS_ACTIONS} onChange={(na) => onChange({ ...template, actions: na })} />
    </div>
  );
}

function ConfirmForm({
  template,
  onChange,
}: {
  template: ConfirmTemplate;
  onChange: (t: ConfirmTemplate) => void;
}) {
  const raw = Array.isArray(template.actions) ? template.actions : [];
  const actions = [0, 1].map((i) => raw[i] ?? makeEmptyAction());
  const update = (i: number, a: LineAction) =>
    onChange({ ...template, actions: actions.map((x, idx) => (idx === i ? a : x)) });
  return (
    <div className="space-y-3">
      <Field label="ข้อความ (text) *">
        <textarea
          className={`${FIELD_CLS} font-normal`}
          rows={2}
          placeholder="คำถามให้ผู้ใช้ยืนยัน"
          value={template.text ?? ''}
          onChange={(e) => onChange({ ...template, text: e.target.value })}
        />
      </Field>
      <div className="space-y-2">
        <label className={LABEL_CLS}>ปุ่มยืนยัน (ต้องมี 2 ปุ่ม)</label>
        {actions.map((a, i) => (
          <ActionEditor key={i} action={a} onChange={(na) => update(i, na)} />
        ))}
      </div>
    </div>
  );
}

function CarouselForm({
  template,
  onChange,
}: {
  template: CarouselTemplate;
  onChange: (t: CarouselTemplate) => void;
}) {
  const columns = Array.isArray(template.columns) ? template.columns : [];
  const setColumns = (next: CarouselColumn[]) => onChange({ ...template, columns: next });
  const updateCol = (i: number, c: CarouselColumn) =>
    setColumns(columns.map((x, idx) => (idx === i ? c : x)));
  const addCol = () => {
    if (columns.length < MAX_COLUMNS)
      setColumns([...columns, { title: '', text: '', actions: [makeEmptyAction()] }]);
  };
  const removeCol = (i: number) => setColumns(columns.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className={LABEL_CLS}>
          การ์ด (columns) · {columns.length}/{MAX_COLUMNS}
        </label>
        <button
          type="button"
          onClick={addCol}
          disabled={columns.length >= MAX_COLUMNS}
          className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" /> เพิ่มการ์ด
        </button>
      </div>
      {columns.map((col, i) => {
        const actions = Array.isArray(col.actions) ? col.actions : [];
        return (
          <div key={i} className="rounded-xl border border-border-default p-3 space-y-2 bg-bg/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text-tertiary">การ์ด #{i + 1}</span>
              {columns.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCol(i)}
                  aria-label="ลบการ์ด"
                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <input
              className={FIELD_CLS}
              placeholder="รูป (thumbnailImageUrl)"
              value={col.thumbnailImageUrl ?? ''}
              onChange={(e) => updateCol(i, { ...col, thumbnailImageUrl: e.target.value })}
            />
            <input
              className={FIELD_CLS}
              placeholder="หัวข้อ (title)"
              value={col.title ?? ''}
              onChange={(e) => updateCol(i, { ...col, title: e.target.value })}
            />
            <textarea
              className={`${FIELD_CLS} font-normal`}
              rows={2}
              placeholder="ข้อความ (text)"
              value={col.text ?? ''}
              onChange={(e) => updateCol(i, { ...col, text: e.target.value })}
            />
            <ActionList
              actions={actions}
              max={MAX_COLUMN_ACTIONS}
              onChange={(na) => updateCol(i, { ...col, actions: na })}
            />
          </div>
        );
      })}
    </div>
  );
}

function ImageCarouselForm({
  template,
  onChange,
}: {
  template: ImageCarouselTemplate;
  onChange: (t: ImageCarouselTemplate) => void;
}) {
  const columns = Array.isArray(template.columns) ? template.columns : [];
  const setColumns = (next: ImageCarouselColumn[]) => onChange({ ...template, columns: next });
  const updateCol = (i: number, c: ImageCarouselColumn) =>
    setColumns(columns.map((x, idx) => (idx === i ? c : x)));
  const addCol = () => {
    if (columns.length < MAX_COLUMNS)
      setColumns([...columns, { imageUrl: '', action: makeEmptyAction('uri') }]);
  };
  const removeCol = (i: number) => setColumns(columns.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className={LABEL_CLS}>
          รูป (columns) · {columns.length}/{MAX_COLUMNS}
        </label>
        <button
          type="button"
          onClick={addCol}
          disabled={columns.length >= MAX_COLUMNS}
          className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" /> เพิ่มรูป
        </button>
      </div>
      {columns.map((col, i) => (
        <div key={i} className="rounded-xl border border-border-default p-3 space-y-2 bg-bg/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text-tertiary">รูป #{i + 1}</span>
            {columns.length > 1 && (
              <button
                type="button"
                onClick={() => removeCol(i)}
                aria-label="ลบรูป"
                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <input
            className={FIELD_CLS}
            placeholder="imageUrl (https://...)"
            value={col.imageUrl ?? ''}
            onChange={(e) => updateCol(i, { ...col, imageUrl: e.target.value })}
          />
          <ActionEditor
            action={col.action ?? makeEmptyAction('uri')}
            onChange={(a) => updateCol(i, { ...col, action: a })}
          />
        </div>
      ))}
    </div>
  );
}

export function TemplateEditor({ payload, onChange }: TemplateEditorProps) {
  const template = readTemplate(payload);
  const subtype = (template.type as TemplateSubtype) ?? 'buttons';

  const setTemplate = (next: TemplateContent) => onChange({ ...payload, template: next });
  const changeSubtype = (next: TemplateSubtype) => {
    if (next !== subtype) setTemplate(defaultForSubtype(next));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className={LABEL_CLS} id="template-subtype-label">ชนิด Template</label>
        <div
          role="group"
          aria-labelledby="template-subtype-label"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {SUBTYPES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={subtype === s.value}
              onClick={() => changeSubtype(s.value)}
              className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${
                subtype === s.value
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'bg-bg text-text-tertiary border-border-default hover:border-brand-300'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {subtype === 'buttons' && (
        <ButtonsForm template={template as ButtonsTemplate} onChange={setTemplate} />
      )}
      {subtype === 'confirm' && (
        <ConfirmForm template={template as ConfirmTemplate} onChange={setTemplate} />
      )}
      {subtype === 'carousel' && (
        <CarouselForm template={template as CarouselTemplate} onChange={setTemplate} />
      )}
      {subtype === 'image_carousel' && (
        <ImageCarouselForm template={template as ImageCarouselTemplate} onChange={setTemplate} />
      )}
    </div>
  );
}

export default TemplateEditor;
