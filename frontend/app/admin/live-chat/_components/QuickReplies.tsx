'use client'

const quickReplies = [
  { id: 1, label: "สวัสดี", message: "สวัสดีค่ะ/ครับ ยินดีให้บริการค่ะ" },
  { id: 2, label: "รอสักครู่", message: "กรุณารอสักครู่นะคะ/ครับ" },
  { id: 3, label: "ขอบคุณ", message: "ขอบคุณค่ะ/ครับ" },
  { id: 4, label: "โอนสาย", message: "ขออนุญาตโอนสายไปยังเจ้าหน้าที่ที่เกี่ยวข้องนะคะ/ครับ" },
  { id: 5, label: "แก้ไขแล้ว", message: "ปัญหาได้รับการแก้ไขแล้วค่ะ/ครับ" },
  { id: 6, label: "ติดตาม", message: "จะติดตามเรื่องนี้ให้นะคะ/ครับ" },
]

interface QuickRepliesProps {
  onSelect: (message: string) => void
}

export function QuickReplies({ onSelect }: QuickRepliesProps) {
  return (
    <div className="animate-scale-in border-t border-border-default px-3 py-2">
      {/* M19: clarify this surface is a system preset (distinct from canned responses) */}
      <p className="thai-text mb-1.5 text-xs font-medium text-text-tertiary">
        ข้อความด่วน — ค่าตั้งต้นของระบบ
      </p>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {quickReplies.map((reply) => (
          <button
            key={reply.id}
            type="button"
            onClick={() => onSelect(reply.message)}
            className="shrink-0 rounded-full border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-brand-500 hover:text-brand-600"
          >
            {reply.label}
          </button>
        ))}
      </div>
    </div>
  )
}
