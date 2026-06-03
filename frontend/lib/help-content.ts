/**
 * Static help content for the searchable help system.
 *
 * Each entry has bilingual titles and keywords so the CommandPalette
 * fuzzy search can match both Thai and English queries.
 */

import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  Bot,
  Users,
  FolderOpen,
  BarChart3,
  Settings,
  Keyboard,
  Shield,
  Send,
  Puzzle,
  type LucideIcon,
} from 'lucide-react'

export interface HelpEntry {
  id: string
  /** Thai title */
  title: string
  /** English title (for bilingual search) */
  titleEn: string
  /** Thai category name */
  category: string
  /** English category name */
  categoryEn: string
  /** Icon component */
  icon: LucideIcon
  /** Thai help content (plain text, paragraphs separated by \n\n) */
  content: string
  /** Bilingual search keywords */
  keywords: string[]
  /** Related admin page paths */
  relatedPages?: string[]
}

export const HELP_CATEGORIES = [
  { id: 'getting-started', label: 'เริ่มต้นใช้งาน', labelEn: 'Getting Started' },
  { id: 'requests', label: 'จัดการคำร้อง', labelEn: 'Requests' },
  { id: 'live-chat', label: 'แชทสด', labelEn: 'Live Chat' },
  { id: 'chatbot', label: 'แชทบอท', labelEn: 'Chatbot' },
  { id: 'settings', label: 'การตั้งค่า', labelEn: 'Settings' },
  { id: 'reports', label: 'รายงาน', labelEn: 'Reports' },
  { id: 'shortcuts', label: 'แป้นพิมพ์ลัด', labelEn: 'Keyboard Shortcuts' },
] as const

export type HelpCategoryId = (typeof HELP_CATEGORIES)[number]['id']

export const HELP_ENTRIES: HelpEntry[] = [
  // ── Getting Started ────────────────────────────────────────────────
  {
    id: 'overview',
    title: 'ภาพรวมระบบ',
    titleEn: 'System Overview',
    category: 'เริ่มต้นใช้งาน',
    categoryEn: 'Getting Started',
    icon: LayoutDashboard,
    content: `ระบบ Community Justice Services (CJS) เป็นระบบจัดการบริการประชาชนผ่าน LINE Official Account

หน้า Dashboard แสดงสรุปข้อมูลสำคัญ: จำนวนคำร้องใหม่, สถานะคำร้องทั้งหมด, และกิจกรรมล่าสุด

ใช้แถบด้านข้าง (Sidebar) เพื่อไปยังหน้าต่างๆ ของระบบ`,
    keywords: ['dashboard', 'ภาพรวม', 'เริ่มต้น', 'เริ่มใช้', 'overview', 'start', 'home', 'หน้าแรก'],
    relatedPages: ['/admin'],
  },
  {
    id: 'navigation',
    title: 'การนำทางในระบบ',
    titleEn: 'Navigation',
    category: 'เริ่มต้นใช้งาน',
    categoryEn: 'Getting Started',
    icon: LayoutDashboard,
    content: `แถบด้านข้าง (Sidebar) อยู่ทางซ้ายของหน้าจอ ใช้สำหรับไปยังหน้าต่างๆ

บนหน้าจอกว้าง (≥1024px) แถบด้านข้างจะแสดงแบบเต็ม บนหน้าจอแคบจะย่อเหลือแค่ไอคอน

กด ⌘K หรือ Ctrl+K เพื่อเปิด Command Palette สำหรับค้นหาและไปยังหน้าต่างๆ อย่างรวดเร็ว`,
    keywords: ['sidebar', 'navigate', 'นำทาง', 'เมนู', 'menu', 'command palette', 'ค้นหา'],
    relatedPages: ['/admin'],
  },
  // ── Requests ───────────────────────────────────────────────────────
  {
    id: 'request-create',
    title: 'การสร้างคำร้อง',
    titleEn: 'Creating Requests',
    category: 'จัดการคำร้อง',
    categoryEn: 'Requests',
    icon: FileText,
    content: `สร้างคำร้องใหม่ผ่านหน้า "สร้างคำร้อง" โดยกรอกข้อมูล 3 ขั้นตอน:

1. ข้อมูลผู้ร้องเรียน — ชื่อ, เบอร์โทร, LINE User ID
2. รายละเอียดคำร้อง — ประเภท, หมวดหมู่, รายละเอียด
3. แนบไฟล์และตรวจสอบ — แนบเอกสาร/รูปภาพ แล้วตรวจสอบก่อนส่ง

คำร้องจะถูกส่งเข้าระบบและแจ้งเตือนเจ้าหน้าที่ผ่าน Telegram`,
    keywords: ['สร้างคำร้อง', 'create', 'new request', 'แจ้งเรื่อง', 'ร้องเรียน', 'submit'],
    relatedPages: ['/admin/requests/create'],
  },
  {
    id: 'request-status',
    title: 'สถานะและการเปลี่ยนสถานะคำร้อง',
    titleEn: 'Request Status Workflow',
    category: 'จัดการคำร้อง',
    categoryEn: 'Requests',
    icon: FileText,
    content: `คำร้องมีสถานะต่อไปนี้:

• รอรับเรื่อง (PENDING) — คำร้องใหม่ที่ยังไม่มีเจ้าหน้าที่รับ
• รับเรื่องแล้ว (ACKNOWLEDGED) — เจ้าหน้าที่รับเรื่องแล้ว
• กำลังดำเนินการ (IN_PROGRESS) — อยู่ระหว่างดำเนินการ
• รอตรวจสอบ (PENDING_REVIEW) — ส่งผลตรวจสอบให้หัวหน้าอนุมัติ
• อนุมัติแล้ว (COMPLETED) — เสร็จสมบูรณ์
• ไม่อนุมัติ (REJECTED) — ไม่ผ่านการอนุมัติ

เปลี่ยนสถานะได้จากหน้ารายละเอียดคำร้อง แท็บ "จัดการ"`,
    keywords: ['สถานะ', 'status', 'workflow', 'เปลี่ยนสถานะ', 'PENDING', 'ACKNOWLEDGED', 'IN_PROGRESS', 'COMPLETED'],
    relatedPages: ['/admin/requests'],
  },
  {
    id: 'request-assign',
    title: 'การมอบหมายคำร้อง',
    titleEn: 'Assigning Requests',
    category: 'จัดการคำร้อง',
    categoryEn: 'Requests',
    icon: FileText,
    content: `มอบหมายคำร้องให้เจ้าหน้าที่โดย:

1. เปิดรายละเอียดคำร้อง
2. กดปุ่ม "มอบหมาย" หรือเลือกจากเมนู dropdown
3. เลือกเจ้าหน้าที่จากรายชื่อ
4. กดยืนยัน

เจ้าหน้าที่ที่ได้รับมอบหมายจะได้รับการแจ้งเตือนผ่าน Telegram`,
    keywords: ['มอบหมาย', 'assign', 'delegate', 'เจ้าหน้าที่', 'staff', 'operator'],
    relatedPages: ['/admin/requests'],
  },
  {
    id: 'request-revert',
    title: 'การย้อนสถานะคำร้อง',
    titleEn: 'Reverting Request Status',
    category: 'จัดการคำร้อง',
    categoryEn: 'Requests',
    icon: FileText,
    content: `ย้อนสถานะคำร้องกลับไปยังสถานะก่อนหน้า:

• ย้อนกลับเป็น "รอรับเรื่อง" — ใช้เมื่อต้องการส่งคิวกลับ
• ย้อนการอนุมัติเป็น "รออนุมัติ" — สำหรับหัวหน้าเท่านั้น
• ย้อนการอนุมัติเป็น "กำลังดำเนินการ" — สำหรับหัวหน้าเท่านั้น

การย้อนสถานะต้องระบุเหตุผลในช่องหมายเหตุทุกครั้ง`,
    keywords: ['ย้อนสถานะ', 'revert', 'undo', 'ย้อนกลับ', 'return', 'reject'],
    relatedPages: ['/admin/requests'],
  },
  // ── Live Chat ──────────────────────────────────────────────────────
  {
    id: 'live-chat-overview',
    title: 'การใช้งานแชทสด',
    titleEn: 'Live Chat Overview',
    category: 'แชทสด',
    categoryEn: 'Live Chat',
    icon: MessageSquare,
    content: `แชทสดช่วยให้เจ้าหน้าที่สนทนาโดยตรงกับประชาชนผ่าน LINE

ขั้นตอน:
1. ประชาชนส่งข้อความผ่าน LINE → บอทจะตอบอัตโนมัติ
2. หากบอทไม่สามารถตอบได้ จะแจ้งเตือนเจ้าหน้าที่ผ่าน Telegram
3. เจ้าหน้าที่เข้ามาในหน้าแชทสด กด "รับสาย" เพื่อเริ่มสนทนา
4. เมื่อเสร็จ กด "ปิดการสนทนา" เพื่อคืนระบบให้บอท`,
    keywords: ['live chat', 'แชทสด', 'chat', 'สนทนา', 'operator', 'เจ้าหน้าที่', 'handoff'],
    relatedPages: ['/admin/live-chat'],
  },
  {
    id: 'live-chat-sessions',
    title: 'สถานะเซสชันแชทสด',
    titleEn: 'Chat Session States',
    category: 'แชทสด',
    categoryEn: 'Live Chat',
    icon: MessageSquare,
    content: `เซสชันแชทสดมี 3 สถานะ:

• รอรับสาย (WAITING) — ประชาชนรอเจ้าหน้าที่
• กำลังสนทนา (ACTIVE) — เจ้าหน้าที่กำลังสนทนาอยู่
• ปิดแล้ว (CLOSED) — การสนทนาสิ้นสุด

เจ้าหน้าที่เห็นรายชื่อผู้รอในแถบด้านซ้าย พร้อมตัวนับข้อความที่ยังไม่อ่าน`,
    keywords: ['session', 'เซสชัน', 'WAITING', 'ACTIVE', 'CLOSED', 'สถานะแชท', 'chat status'],
    relatedPages: ['/admin/live-chat'],
  },
  // ── Chatbot ────────────────────────────────────────────────────────
  {
    id: 'chatbot-intents',
    title: 'การตั้งค่า Intent (เจตนา)',
    titleEn: 'Chatbot Intents',
    category: 'แชทบอท',
    categoryEn: 'Chatbot',
    icon: Bot,
    content: `Intent คือ "เจตนา" ที่บอทเข้าใจ — เมื่อประชาชนพิมพ์ข้อความ ระบบจะจับคู่กับ Intent ที่ใกล้เคียงที่สุด

การจับคู่มี 2 แบบ:
• Exact Match — ต้องตรงกับ keyword ที่กำหนดทุกตัวอักษร
• Fuzzy Match — จับคู่โดยใช้ AI embedding (ความคล้ายคลึง)

ตั้งค่า Intent ได้ที่หน้า "แชทบอท" → "จัดการ Intent"`,
    keywords: ['intent', 'เจตนา', 'chatbot', 'บอท', 'keyword', 'auto reply', 'ตอบอัตโนมัติ'],
    relatedPages: ['/admin/chatbot'],
  },
  {
    id: 'reply-objects',
    title: 'Reply Objects (แม่แบบข้อความตอบ)',
    titleEn: 'Reply Objects',
    category: 'แชทบอท',
    categoryEn: 'Chatbot',
    icon: Bot,
    content: `Reply Objects คือแม่แบบข้อความที่บอทใช้ตอบประชาชน

รองรับหลายประเภทข้อความ:
• Text — ข้อความธรรมดา
• Image — รูปภาพ
• Flex Message — การ์ดแบบกำหนดเอง
• Video, Audio — สื่อมัลติมีเดีย
• Imagemap — แผนที่ภาพที่คลิกได้

จัดการได้ที่หน้า "แชทบอท" → "Reply Objects"`,
    keywords: ['reply object', 'แม่แบบ', 'template', 'flex message', 'ข้อความตอบ', 'auto reply'],
    relatedPages: ['/admin/reply-objects'],
  },
  {
    id: 'broadcast',
    title: 'การส่งข้อความ Broadcast',
    titleEn: 'Broadcast Messages',
    category: 'แชทบอท',
    categoryEn: 'Chatbot',
    icon: Send,
    content: `ส่งข้อความถึงเพื่อนใน LINE ทั้งหมดหรือบางกลุ่ม

ขั้นตอน:
1. เลือกประเภทข้อความ (Text, Image, Flex, etc.)
2. เนื้อหาข้อความ
3. เลือกกลุ่มเป้าหมาย (ทั้งหมด หรือ filter ตามเงื่อนไข)
4. ตรวจสอบและส่ง — หรือตั้งเวลาส่งภายหลัง

ดูประวัติการส่งได้ที่หน้าเดียวกัน`,
    keywords: ['broadcast', 'ส่งข้อความ', 'mass message', 'ประชาสัมพันธ์', 'announce'],
    relatedPages: ['/admin/chatbot/broadcast'],
  },
  // ── Settings ───────────────────────────────────────────────────────
  {
    id: 'settings-line',
    title: 'การเชื่อมต่อ LINE',
    titleEn: 'LINE Integration Setup',
    category: 'การตั้งค่า',
    categoryEn: 'Settings',
    icon: Settings,
    content: `เชื่อมต่อ LINE Official Account:

1. ไปที่หน้า "การตั้งค่า" → "LINE"
2. กรอก Channel Access Token และ Channel Secret จาก LINE Developers Console
3. กด "เชื่อมต่อและบันทึก"

ระบบจะทดสอบการเชื่อมต่อก่อนบันทึก หากสำเร็จจะแสดงสถานะ "เชื่อมต่อแล้ว"`,
    keywords: ['LINE', 'เชื่อมต่อ', 'connect', 'setup', 'token', 'channel', 'configuration'],
    relatedPages: ['/admin/settings/line'],
  },
  {
    id: 'settings-telegram',
    title: 'การเชื่อมต่อ Telegram',
    titleEn: 'Telegram Integration Setup',
    category: 'การตั้งค่า',
    categoryEn: 'Settings',
    icon: Settings,
    content: `เชื่อมต่อ Telegram เพื่อรับการแจ้งเตือน:

1. สร้าง Telegram Bot ผ่าน @BotFather
2. คัดลอก Bot Token
3. สร้าง Group Chat และเพิ่ม Bot เข้าไป
4. คัดลอก Chat ID (ใช้ @userinfobot)
5. กรอกข้อมูลในหน้า "การตั้งค่า" → "Telegram"`,
    keywords: ['telegram', 'bot', 'แจ้งเตือน', 'notification', 'alert', 'setup'],
    relatedPages: ['/admin/settings/telegram'],
  },
  {
    id: 'settings-permissions',
    title: 'การกำหนดสิทธิ์ผู้ใช้',
    titleEn: 'User Permissions',
    category: 'การตั้งค่า',
    categoryEn: 'Settings',
    icon: Shield,
    content: `กำหนดสิทธิ์การเข้าถึงฟีเจอร์ต่างๆ ตามบทบาท:

• Super Admin — สิทธิ์สูงสุด จัดการทุกอย่าง
• Admin — จัดการคำร้อง ผู้ใช้ และตั้งค่า
• Director — ดูรายงานและอนุมัติคำร้อง
• Head — ดูแลทีมเจ้าหน้าที่
• Staff — ดำเนินการคำร้องและแชทสด
• User — ใช้งาน LIFF เท่านั้น

แก้ไขสิทธิ์ได้ที่หน้า "การตั้งค่า" → "การกำหนดสิทธิ์"`,
    keywords: ['permission', 'สิทธิ์', 'role', 'บทบาท', 'access', 'RBAC', 'authorization'],
    relatedPages: ['/admin/settings/permissions'],
  },
  // ── Reports ────────────────────────────────────────────────────────
  {
    id: 'reports-overview',
    title: 'รายงานและ Analytics',
    titleEn: 'Reports & Analytics',
    category: 'รายงาน',
    categoryEn: 'Reports',
    icon: BarChart3,
    content: `ดูรายงานภาพรวมของระบบได้ที่หน้า "รายงาน"

แท็บรายงาน:
• ภาพรวม — สรุปสถิติทั้งหมด
• คำร้อง — สถิติคำร้องตามสถานะ/ประเภท/เวลา
• ข้อความ — สถิติข้อความขาเข้า/ขาออก
• เจ้าหน้าที่ — สถิติการทำงานของเจ้าหน้าที่
• ผู้ติดตาม — สถิติเพื่อนใน LINE

ทุกแท็บรองรับการ export เป็น CSV`,
    keywords: ['report', 'รายงาน', 'analytics', 'statistics', 'สถิติ', 'dashboard', 'export', 'CSV'],
    relatedPages: ['/admin/reports'],
  },
  // ── Keyboard Shortcuts ─────────────────────────────────────────────
  {
    id: 'keyboard-shortcuts',
    title: 'แป้นพิมพ์ลัดทั้งหมด',
    titleEn: 'All Keyboard Shortcuts',
    category: 'แป้นพิมพ์ลัด',
    categoryEn: 'Keyboard Shortcuts',
    icon: Keyboard,
    content: `แป้นพิมพ์ลัดที่ใช้ได้ทั่วระบบ:

• ⌘K / Ctrl+K — เปิด Command Palette (ค้นหาและไปยังหน้าต่างๆ)
• ? — เปิดระบบช่วยเหลือ
• ⌘1 / Ctrl+1 — ไปที่หน้า Dashboard
• ⌘2 / Ctrl+2 — ไปที่หน้าคำร้อง
• ⌘3 / Ctrl+3 — ไปที่หน้าแชทสด
• Escape — ปิด dialog/dropdown ที่เปิดอยู่

ในแบบฟอร์มที่รองรับ:
• ⌘Z / Ctrl+Z — Undo (ย้อนกลับ)
• ⌘⇧Z / Ctrl+Shift+Z — Redo (ทำซ้ำ)`,
    keywords: ['keyboard', 'shortcut', 'แป้นพิมพ์ลัด', 'hotkey', 'ลัด', '⌘K', 'Ctrl+K', 'undo', 'redo'],
  },
  {
    id: 'command-palette',
    title: 'การใช้ Command Palette',
    titleEn: 'Using the Command Palette',
    category: 'แป้นพิมพ์ลัด',
    categoryEn: 'Keyboard Shortcuts',
    icon: Keyboard,
    content: `Command Palette คือเครื่องมือค้นหาและไปยังหน้าต่างๆ อย่างรวดเร็ว

เปิดใช้งาน: กด ⌘K (Mac) หรือ Ctrl+K (Windows)

ใช้งาน:
• พิมพ์คำค้นหา — ระบบจะค้นหาทั้งภาษาไทยและอังกฤษ
• กด ↑↓ เพื่อเลือก กด Enter เพื่อไปยังหน้าที่เลือก
• กด Escape เพื่อปิด

Command Palette จดจำ 5 รายการที่ใช้ล่าสุด แสดงเมื่อไม่ได้พิมพ์คำค้นหา`,
    keywords: ['command palette', '⌘K', 'Ctrl+K', 'ค้นหา', 'search', 'navigate', 'quick access'],
    relatedPages: ['/admin'],
  },
  // ── Files ──────────────────────────────────────────────────────────
  {
    id: 'file-management',
    title: 'การจัดการไฟล์',
    titleEn: 'File Management',
    category: 'การตั้งค่า',
    categoryEn: 'Settings',
    icon: FolderOpen,
    content: `จัดการไฟล์ที่ใช้ในระบบได้ที่หน้า "ไฟล์"

• อัปโหลดไฟล์ — ลากไฟล์มาวาง หรือกดเลือกไฟล์
• จัดหมวดหมู่ — จัดไฟล์เป็นหมวดหมู่เพื่อค้นหาง่าย
• แชร์ลิงก์สาธารณะ — สร้างลิงก์สำหรับแชร์ไฟล์ให้ผู้อื่น
• ลบไฟล์ — ลบไฟล์ที่ไม่ต้องการแล้ว

รองรับไฟล์: รูปภาพ, เอกสาร PDF, Word, Excel`,
    keywords: ['file', 'ไฟล์', 'upload', 'อัปโหลด', 'download', 'ดาวน์โหลด', 'share', 'แชร์'],
    relatedPages: ['/admin/files'],
  },
  {
    id: 'friends-management',
    title: 'การจัดการเพื่อนใน LINE',
    titleEn: 'LINE Friends Management',
    category: 'การตั้งค่า',
    categoryEn: 'Settings',
    icon: Users,
    content: `ดูรายชื่อเพื่อนใน LINE Official Account:

• รายชื่อเพื่อน — ดูรายชื่อทั้งหมดพร้อมสถานะ
• ประวัติการติดตาม — ดูเหตุการณ์ follow/unfollow/block
• สถิติ — จำนวนเพื่อนใหม่, ผู้ที่บล็อก, ผู้ที่กลับมา

ค้นหาเพื่อนได้จากชื่อหรือ LINE User ID`,
    keywords: ['friends', 'เพื่อน', 'LINE', 'follower', 'ผู้ติดตาม', 'follow', 'unfollow', 'block'],
    relatedPages: ['/admin/friends'],
  },
  {
    id: 'integrations',
    title: 'การเชื่อมต่อระบบภายนอก',
    titleEn: 'External Integrations',
    category: 'การตั้งค่า',
    categoryEn: 'Settings',
    icon: Puzzle,
    content: `ระบบรองรับการเชื่อมต่อกับระบบภายนอก:

• Telegram — รับการแจ้งเตือนเมื่อมีคำร้องใหม่หรือแชทสด
• n8n — เชื่อมต่อ workflow อัตโนมัติ เช่น ส่งข้อมูลไปยังระบบอื่น
• Custom Integration — เชื่อมต่อ API ภายนอกด้วย webhook

ตั้งค่าได้ที่หน้า "การตั้งค่า" → เลือกแท็บที่ต้องการ`,
    keywords: ['integration', 'เชื่อมต่อ', 'n8n', 'telegram', 'webhook', 'API', 'external'],
    relatedPages: ['/admin/settings/telegram', '/admin/settings/n8n', '/admin/settings/custom'],
  },
]

/**
 * Get help entries filtered by category.
 */
export function getHelpEntriesByCategory(categoryId: HelpCategoryId): HelpEntry[] {
  const cat = HELP_CATEGORIES.find((c) => c.id === categoryId)
  if (!cat) return []
  return HELP_ENTRIES.filter((e) => e.categoryEn === cat.labelEn)
}

/**
 * Get a single help entry by ID.
 */
export function getHelpEntry(id: string): HelpEntry | undefined {
  return HELP_ENTRIES.find((e) => e.id === id)
}
