/**
 * TextV2Editor — structured editor for the `text_v2` object type.
 *
 * The backend only requires a non-empty `text`. This adds a couple of quick
 * emoji inserts and surfaces LINE's substitution-variable concept as a hint.
 */
import { FIELD_CLS, LABEL_CLS } from '../payload-utils';

const QUICK_EMOJIS = ['😊', '👍', '🙏', '✅', '🎉', '📌'];

export interface TextV2EditorProps {
  payload: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

export function TextV2Editor({ payload, onChange }: TextV2EditorProps) {
  const text = typeof payload.text === 'string' ? payload.text : '';
  const setText = (next: string) => onChange({ ...payload, text: next });

  return (
    <div className="space-y-2">
      <label className={LABEL_CLS}>ข้อความ (text) *</label>
      <textarea
        className={`${FIELD_CLS} font-normal`}
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="พิมพ์ข้อความที่จะส่งให้ผู้ใช้..."
      />
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setText(text + emoji)}
              className="w-8 h-8 rounded-lg border border-border-default bg-bg hover:bg-surface text-base transition-colors"
              aria-label={`แทรก ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
        <span className="text-xs text-text-tertiary">{text.length} ตัวอักษร</span>
      </div>
      <p className="text-xs text-text-tertiary">
        รองรับอีโมจิ และตัวแปรแทนค่า (substitution) ของ LINE
      </p>
    </div>
  );
}

export default TextV2Editor;
