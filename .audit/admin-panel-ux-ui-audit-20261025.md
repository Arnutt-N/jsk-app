# รายงานตรวจ UX/UI — Admin Panel

- **โครงการ:** JskApp (SknApp)
- **วันที่จัดทำรายงาน:** 25 ตุลาคม 2026
- **ขอบเขต:** `/admin/*`, modal และองค์ประกอบใน admin panel
- **ลักษณะงาน:** สรุปผล code review จากการตรวจในบทสนทนาก่อนหน้า ไม่ใช่การตรวจใหม่หรือการแก้ implementation
- **สถานะ:** ยังไม่ได้แก้โค้ด และยังไม่ได้ทดสอบทุกหน้า/ทุก modal ใน browser

## 1. บทสรุปผู้บริหาร

ระบบมีพื้นฐาน shared components และ design tokens ที่ดี แต่ยังมีพฤติกรรมร่วมที่ไม่เป็นมาตรฐานเดียวกัน โดยเฉพาะ navigation, confirmation, modal, form และ session

ประเด็นสำคัญคือ mobile search ที่ยังไม่ทำงานเหมือน desktop, navigation ที่ไม่ตรงกับ route authorization, logout ที่มีสองพฤติกรรม, confirmation ที่ยังปิดได้ขณะ pending และ accessibility ของ mobile sidebar/session warning

**ข้อสรุปด้าน reusable:** มีการ reuse หน้าตาแล้ว แต่ควรรวมพฤติกรรมและ accessibility contract ให้ครบด้วย

**ข้อสรุปด้าน OOP:** สำหรับ React ควรเน้น composition, hooks, encapsulation และ single responsibility มากกว่าการเพิ่ม class inheritance หรือ BaseAdminPage ขนาดใหญ่

## 2. วิธีตรวจและข้อจำกัด

รอบตรวจเดิมสำรวจโครงสร้างและค้นหาแพตเทิร์นใน admin routes พร้อมอ่านเชิงลึก shared components, admin shell, request list, API/session utilities และองค์ประกอบที่เกี่ยวข้อง

- เป็น static code review ไม่ใช่การยืนยันพฤติกรรมจริงครบทุก route
- ยังไม่ได้รัน unit/E2E tests ในรอบตรวจนี้
- ยังไม่ได้วัด contrast, LCP, INP, CLS, memory หรือ network waterfall
- รายการที่ระบุว่า “ควรทดสอบเพิ่ม” เป็นช่องว่างของ coverage ไม่ใช่บั๊กที่ยืนยันแล้ว
- พาธในรายงานเริ่มจาก `frontend/`
- เลขบรรทัดอ้างอิงจากการตรวจเดิม อาจเปลี่ยนเมื่อโค้ดถูกแก้ไข

### ระดับความสำคัญ

| ระดับ | ความหมาย |
|---|---|
| P1 | ควรแก้ก่อน เพราะกระทบเส้นทางงาน ความปลอดภัยในการสั่งงาน หรือการเข้าถึงฟังก์ชันสำคัญ |
| P2 | ควรจัดมาตรฐานรอบถัดไป เพื่อความชัดเจน ความสม่ำเสมอ และลดความเสี่ยง |
| ตรวจเพิ่ม | ยังต้องพิสูจน์ด้วย browser, test หรือการวัดจริง |

## 3. เส้นทางงานหลัก

### NAV-01 — Mobile search ไม่เชื่อมกับระบบค้นหาจริง

- **ระดับ:** P1
- **อ้างอิง:** `app/admin/layout.tsx:404–429`
- **สิ่งที่พบ:** มือถือเปิด input ที่ไม่มีการค้นหาหรือ submit ส่วน desktop เปิด command palette
- **ผลกระทบ:** ผู้ใช้พิมพ์ได้แต่ไม่มีผลลัพธ์
- **ข้อเสนอ:** ใช้ command palette และ search behavior เดียวกันทั้งมือถือและ desktop
- **เกณฑ์รับงาน:** เปิดค้นหา พิมพ์คำ เลือกผลลัพธ์ และไปปลายทางได้ทั้ง touch และ keyboard

### NAV-02 — Navigation และ route authorization ขัดกัน

- **ระดับ:** P1
- **อ้างอิง:** `app/admin/layout.tsx:86–92,224`
- **สิ่งที่พบ:** Sidebar แสดง Appointments ให้ AGENT แต่ auth gate ส่ง AGENT จากเส้นทางที่ไม่ใช่ live-chat กลับ live-chat
- **ผลกระทบ:** เมนูแสดงว่ามีสิทธิ์ แต่เข้าใช้งานไม่ได้
- **ข้อเสนอ:** ใช้ policy แหล่งเดียวสำหรับ navigation และ route access โดยไม่ลดทอน backend authorization
- **เกณฑ์รับงาน:** ตรวจ role matrix ทั้งการคลิกเมนูและเปิด URL โดยตรง

### NAV-03 — UserMenu ไม่สอดคล้องกับชื่อเมนูและสิทธิ์

- **ระดับ:** P2
- **อ้างอิง:** `components/admin/UserMenu.tsx`
- **สิ่งที่พบ:** “โปรไฟล์” ไป `/admin/users`; Live Chat และ Settings ไม่ผ่านการกรองสิทธิ์แบบ sidebar
- **ผลกระทบ:** ปลายทางไม่ตรงความคาดหวัง และบาง role อาจเจอทางตันหรือ redirect
- **ข้อเสนอ:** แยก personal profile จาก user management และใช้ navigation policy ร่วมกัน

### NAV-04 — ปุ่มภาษาเปลี่ยน flag แต่ไม่เปลี่ยนภาษา

- **ระดับ:** P2
- **อ้างอิง:** `components/admin/AdminLanguageToggle.tsx`
- **สิ่งที่พบ:** ปุ่ม TH/EN เปลี่ยน flag เท่านั้น แม้ tooltip บอกว่าเร็วๆ นี้ แต่ยังดูเหมือนใช้งานได้
- **ข้อเสนอ:** ซ่อน หรือแสดงสถานะยังไม่พร้อมอย่างชัดเจนจนกว่าระบบแปลภาษาจะทำงานจริง

### NAV-05 — เส้นทาง ComingSoon

- **ระดับ:** ตรวจเพิ่ม
- **อ้างอิง:** `/admin/chatbot/history`, `/admin/chatbot/friends`
- **สิ่งที่พบ:** ยังเป็น ComingSoon
- **ข้อเสนอ:** ตรวจว่าเป็น legacy route ที่ควร redirect หรือฟีเจอร์ที่ตั้งใจยังไม่เปิด และปรับ navigation ให้สื่อสถานะตรงกัน

## 4. คำสั่งเสี่ยงและฟอร์ม

### SAFE-01 — Logout ไม่เป็น flow เดียวกัน

- **ระดับ:** P1
- **อ้างอิง:** `app/admin/layout.tsx:154–156`, `components/admin/UserMenu.tsx`
- **สิ่งที่พบ:** Sidebar ใช้ `div onClick` logout ทันที ส่วน UserMenu ใช้ LogoutConfirmDialog
- **ผลกระทบ:** เผลอออกจากระบบได้ และ sidebar control ไม่รองรับ Tab/Enter แบบ native button
- **ข้อเสนอ:** ใช้ semantic button และ confirmation flow เดียวกัน รวมถึงนโยบายเมื่อมีข้อมูลยังไม่บันทึก

### SAFE-02 — ConfirmDialog ยังปิดได้ระหว่าง pending

- **ระดับ:** P1
- **อ้างอิง:** `components/ui/ConfirmDialog.tsx:65`
- **สิ่งที่พบ:** ส่ง onClose ตรงให้ Modal แม้ isLoading ปิดปุ่ม Cancel แล้ว Escape และ backdrop ยังเรียกปิดได้
- **ผลกระทบ:** ผู้ใช้อาจเข้าใจว่าการปิด dialog คือการยกเลิกคำสั่ง
- **ข้อเสนอ:** กำหนด pending-dismiss policy ครบทุกช่องทาง และสื่อว่าการปิด UI ไม่ได้ยกเลิกคำสั่งที่ส่งไปแล้ว
- **เกณฑ์รับงาน:** ระหว่าง pending ตรวจ Cancel, close button, Escape และ backdrop ให้เป็นนโยบายเดียวกัน

### SAFE-03 — ลบคำร้องไม่มี pending guard ที่หน้า list

- **ระดับ:** P1
- **อ้างอิง:** `app/admin/requests/page.tsx:216–226,562–577`
- **สิ่งที่พบ:** ไม่มี pending guard และไม่ได้ส่ง isLoading ให้ ConfirmDialog
- **ผลกระทบ:** กดแล้วส่ง DELETE ซ้ำได้ระหว่างรอผล
- **ข้อเสนอ:** กันการกดซ้ำ แสดง progress และคืนสถานะอย่างถูกต้องทั้ง success/error
- **เกณฑ์รับงาน:** เมื่อจำลองเครือข่ายช้า การคลิกซ้ำไม่ส่งคำสั่งซ้ำจาก UI

### FORM-01 — Error ของ Input ไม่เชื่อมกับช่องกรอกโดยอัตโนมัติ

- **ระดับ:** P2
- **อ้างอิง:** `components/ui/Input.tsx:105–112`
- **สิ่งที่พบ:** แสดง errorMessage แต่ไม่สร้าง aria-describedby และไม่ตั้ง aria-invalid ตาม error ให้เอง
- **ผลกระทบ:** ทุก caller ต้องประกอบ accessibility ให้ถูกเอง
- **ข้อเสนอ:** รวม label, helper, error, required และ invalid contract ใน shared form field
- **เกณฑ์รับงาน:** Screen reader อ่านชื่อช่องและ error ที่สัมพันธ์กัน และ focus ไปช่องผิดได้หลัง submit

## 5. มือถือและ Accessibility

### A11Y-01 — Mobile sidebar ยังไม่เป็น accessible drawer ที่สมบูรณ์

- **ระดับ:** P1
- **อ้างอิง:** `app/admin/layout.tsx:295–305,465–471`
- **สิ่งที่พบ:** ใช้ translate ซ่อน sidebar แต่ไม่ทำให้ส่วนที่ซ่อน inert และไม่มี drawer focus trap/restore หรือ Escape handling
- **ความเสี่ยง:** Tab ไปยังลิงก์นอกจอ หรือหลุดไปหลัง overlay
- **ข้อเสนอ:** ใช้ shared Sheet/Drawer ที่จัดการ focus และ modal semantics ครบ

### A11Y-02 — Session warning ข้ามระบบ Modal กลาง

- **ระดับ:** P1
- **อ้างอิง:** `components/admin/SessionTimeoutWarning.tsx`
- **สิ่งที่พบ:** Overlay ทำเอง ไม่มี dialog semantics, focus management หรือการประกาศเตือนที่เหมาะสม และรูปแบบสี/ข้อความต่างจากส่วนอื่น
- **ข้อเสนอ:** ใช้ primitive กลาง พร้อมชื่อ dialog, focus ที่เหมาะสม และการประกาศเตือนโดยไม่รบกวนซ้ำเกินจำเป็น

### A11Y-03 — Modal stacking และ focus management ยังมีความเสี่ยง

- **ระดับ:** P2
- **อ้างอิง:** `components/ui/Modal.tsx`, `components/ui/ConfirmDialog.tsx`
- **สิ่งที่พบ:**
  - แต่ละ modal เขียน/ล้าง body.style.overflow เอง จึงเสี่ยงปลด scroll lock ของอีก modal
  - ทุก instance ฟัง Escape ที่ window ไม่จำกัดตัวบนสุด
  - Focus selector ไม่ตัด disabled/hidden controls
  - ConfirmDialog ไม่ส่ง title ให้ Modal ทำให้ accessible name เป็น “Dialog” แทนหัวข้อจริง
- **ข้อเสนอ:** รวม overlay stack, scroll lock และ focus ownership ที่ชั้น primitive
- **เกณฑ์รับงาน:** เปิด dialog ซ้อนแล้ว Escape ปิดเฉพาะตัวบนสุด, body ไม่ scroll จนปิดครบ และ focus กลับ trigger ที่ถูกต้อง

### A11Y-04 — Tooltip รองรับ mouse เป็นหลัก

- **ระดับ:** P2
- **อ้างอิง:** `components/ui/Tooltip.tsx`
- **สิ่งที่พบ:** เปิดด้วย mouse enter/leave แต่ไม่มี focus/blur, Escape หรือ aria-describedby เชื่อม trigger
- **ข้อเสนอ:** รองรับ keyboard และไม่ซ่อนข้อมูลจำเป็นไว้ใน tooltip เพียงช่องทางเดียว
- **ส่วนที่ดีแล้ว:** ActionIconButton มี aria-label

## 6. เครือข่ายและ Session

### NET-01 — Response เก่าอาจทับผลค้นหาใหม่

- **ระดับ:** P1
- **อ้างอิง:** `app/admin/requests/page.tsx:116–171`
- **สิ่งที่พบ:** ไม่มี abort/request sequence guard เมื่อเปลี่ยน search/filter รวดเร็ว
- **ความเสี่ยง:** Response เก่าที่กลับมาช้ากว่าเขียนทับผลใหม่
- **เพิ่มเติม:** Reset page แยก effect จาก fetch จึงอาจยิงทั้ง page เก่าและ page 0 เมื่อเปลี่ยน filter ขณะอยู่หน้าถัดไป
- **ข้อเสนอ:** ใช้ query state และ cancellation/stale-response protection ที่สอดคล้องกัน
- **เกณฑ์รับงาน:** จำลอง response สลับลำดับ แล้วหน้าจอยังแสดงผลตาม query ล่าสุด

### NET-02 — Filter และ pagination ทำคนละชั้น

- **ระดับ:** P2
- **อ้างอิง:** `app/admin/requests/page.tsx:140–149`
- **สิ่งที่พบ:** ดึงครั้งละ 100 แล้วกรองผู้รับผิดชอบฝั่ง client
- **ผลกระทบ:** อาจเห็นหน้าว่างหรือรายการน้อยทั้งที่ข้อมูลตรงเงื่อนไขอยู่หน้าถัดไป
- **ข้อเสนอ:** กรองก่อน pagination ฝั่ง server และให้จำนวนรวมสะท้อนเงื่อนไขเดียว��ัน

### SESSION-01 — Live-chat ไม่ผ่าน idle warning ตัวเดียวกับหน้าอื่น

- **ระดับ:** P2
- **อ้างอิง:** `app/admin/layout.tsx:273–276`
- **สิ่งที่พบ:** Return children ก่อน mount SessionTimeoutWarning
- **ข้อเสนอ:** ยืนยันว่าเป็นข้อยกเว้นที่ตั้งใจหรือไม่ แล้วกำหนดนโยบาย session ให้ชัดเจน

### SESSION-02 — Stay Logged In รีเซ็ต timer ฝั่ง client

- **ระดับ:** P2
- **อ้างอิง:** `hooks/useSessionTimeout.ts`
- **สิ่งที่พบ:** รีเซ็ต timer โดยไม่ได้ยืนยันการต่อ session กับ server โดยตรง
- **ข้อควรระวัง:** ไม่ใช่ข้อสรุปว่า authentication เสีย ต้องพิจารณาร่วมกับ token refresh lifecycle
- **ข้อเสนอ:** ให้ข้อความและสถานะต่ออายุสอดคล้องกับกลไก session จริง

### ส่วนที่ทำดีแล้ว

`lib/authFetch.ts` มี single-flight refresh และ retry หลัง 401 และ admin gate แยก bootstrap failure ออกจากการหมด session

## 7. ประสิทธิภาพ

| ประเด็น | สถานะ | ข้อเสนอ |
|---|---|---|
| useSessionTimeout reset timers ทุก mousemove โดยไม่ throttle | พบจากโค้ด; ยังไม่วัดผลกระทบ | ลดงานซ้ำและวัดก่อน/หลัง |
| Request list render สูงสุด 100 รายการต่อหน้า | ต้องวัด interaction latency | ทดสอบอุปกรณ์ช้าก่อนเพิ่ม virtualization |
| Date picker มี dynamic import | มีแนวทางที่ดีแล้ว | รักษาไว้และตรวจ loading behavior |
| Live-chat มี virtual scroll | มีแนวทางที่ดีแล้ว | ตรวจ anchor/scroll restoration ตามการใช้งานจริง |
| LCP, INP, CLS, memory, network waterfall | ยังไม่ได้วัด | เก็บ baseline ก่อนตัดสินใจ refactor |

ไม่ควรสรุปว่าระบบเร็วหรือช้าโดยไม่มีข้อมูลวัดจริง

## 8. มาตรฐาน Hover และ Cursor

### สภาพปัจจุบัน

มีกฎกลางที่ `app/globals.css:259–266` ให้ปุ่มที่ไม่ disabled เป็น cursor pointer อยู่แล้ว ไม่จำเป็นต้องเติม cursor รายปุ่มทั้งหมด

### มาตรฐานที่แนะนำ

| ประเภท | Cursor และพฤติกรรม |
|---|---|
| Button, link, tab, สิ่งที่สั่งงานได้ | pointer พร้อม hover และ focus-visible |
| ช่องกรอกข้อความ | text |
| เนื้อหา/card ที่กดไม่ได้ | default และไม่ทำ hover จนดูเหมือนกดได้ |
| Disabled | เลือก not-allowed หรือ default ให้สม่ำเสมอ; อธิบายเหตุผลเมื่อจำเป็น |
| Pending | Spinner + ข้อความ + ป้องกันคำสั่งซ้ำ ไม่พึ่ง cursor อย่างเดียว |
| ลากได้จริง | grab / grabbing |
| Resize handle | Cursor ตามทิศทางที่ resize |

Cursor pointer ไม่ทดแทน semantic button/link หรือ keyboard support และไม่ควรใช้เพียงการเปลี่ยนสีเป็นสัญญาณเดียวของสถานะ

### ความไม่สอดคล้องที่พบ

1. `components/ui/Button.tsx:19` ใช้ disabled:pointer-events-none ร่วมกับ disabled:cursor-not-allowed ทำให้ cursor ของปุ่มอาจไม่แสดง เพราะ hit testing ไปที่ element ด้านหลัง ขณะที่ ActionIconButton ไม่ใช้รูปแบบเดียวกัน
2. Global selector ไม่แยก aria-disabled=true ออกจาก role button
3. Button แบบ asChild ไม่ส่งต่อ disabled/loading behavior เหมือน native button ควรกำหนด contract สำหรับ link ให้ชัดเจน
4. ปุ่มหลักยกตัวเมื่อ hover แต่ icon button ขยาย 110% ควรกำหนด motion scale ร่วมกัน และลดการขยับในตารางหนาแน่น
5. ต้องตรวจ reduced-motion และ focus-visible ควบคู่กับ hover ไม่ใช่ตรวจเฉพาะ mouse

## 9. Reusable, OOP, Consistency และ Unity

### พื้นฐานที่มีแล้ว

- Button, ActionIconButton
- Modal, ConfirmDialog
- PageHeader, FormActions
- Filter/table helpers
- Status constants
- API error utilities
- Guarded update hook

### ช่องว่างที่ควรรวมเป็น contract กลาง

| ชั้น | สิ่งที่ควรใช้ร่วมกัน |
|---|---|
| Dialog/overlay | Focus, dismiss policy, pending state, stacking, accessible name |
| Navigation | Label, route, permission และการเปิดแท็บใหม่ |
| Form | Validation, error association, required state, unsaved-change policy |
| List/query | Filter, sort, pagination, cancellation, loading/error/empty states |
| Design tokens | Semantic color, spacing, typography, interaction states และ motion |

### แนวทางสถาปัตยกรรม

- ใช้ composition และ hooks มากกว่า inheritance
- แยก domain logic จาก visual primitives
- ใช้ single responsibility โดยไม่สร้าง abstraction จนตาม flow ยาก
- ลดการ override สีและพฤติกรรมรายหน้า
- ไม่ควรสร้าง BaseAdminPage ที่มีเงื่อนไขจำนวนมากเพื่อครอบทุก use case

## 10. หัวข้อที่ยังควรตรวจเพิ่ม

รายการนี้เป็น backlog ของการตรวจ ไม่ใช่รายการบั๊กที่ยืนยันทั้งหมด

### 10.1 งานค้างและการกู้คืน

- เปลี่ยนหน้า, Back, refresh ระหว่างแก้ไข
- Session หมดขณะกรอกฟอร์ม
- Upload หลุดกลางทางและ retry
- บันทึกไม่สำเร็จแล้วข้อมูลที่กรอกยังอยู่หรือไม่

### 10.2 หลายผู้ใช้และหลายแท็บ

- แก้ข้อมูลเดียวกันพร้อมกัน
- Claim งานชนกัน
- Permission เปลี่ยนระหว่างใช้งาน
- Logout จากอีกแท็บ
- Conflict resolution และข้อมูล stale

### 10.3 Bulk actions และ partial success

- สำเร็จบางรายการ/ล้มเหลวบางรายการ
- Retry เฉพาะรายการที่ล้มเหลว
- ขอบเขต “เลือกทั้งหมด” หมายถึงหน้าปัจจุบันหรือทุกผลค้นหา
- จำนวนและชื่อรายการที่จะได้รับผลกระทบใน confirmation

### 10.4 ความเป็นส่วนตัว

- Preview, export และ public link
- ข้อมูลอ่อนไหวใน notification/toast
- ข้อมูลบนหน้าจอที่ใช้งานร่วมกัน
- Permission ของไฟล์และการดาวน์โหลด

### 10.5 สถานะข้อมูล

แยกให้ชัดระหว่าง:

- ยังไม่มีข้อมูล
- ค้นหาไม่พบ
- ไม่มีสิทธิ์
- โหลดล้มเหลว
- ข้อมูลเก่า/offline
- กำลังโหลดเพิ่มเติม

### 10.6 ภาษาและเวลา

- ไทย/อังกฤษและคำเรียกที่สม่ำเสมอ
- พ.ศ./ค.ศ. และ timezone
- ชื่อยาว ข้อความยาว และการตัดบรรทัด
- IME composition ในช่อง Enter-to-submit

### 10.7 อุปกรณ์และการมองเห็น

- Viewport 320–390px และ landscape
- Keyboard มือถือบังปุ่ม submit หรือไม่
- Zoom 200–400%
- Dark mode และ contrast จริง
- Touch target และระยะห่าง

### 10.8 Accessibility

- Keyboard-only
- Screen reader
- Modal ซ้อน
- Toast/error announcement
- Reduced motion
- ลำดับ focus และ focus restoration

### 10.9 การกลับมาทำงานต่อ

- URL เก็บ filter/sort/page หรือไม่
- กลับจาก detail แล้วคงตำแหน่งเดิมหรือไม่
- เปิดรายการในแท็บใหม่ได้หรือไม่
- Search/filter reset ชัดเจนหรือไม่

### 10.10 Coverage ราย route

พบไฟล์ E2E ของ requests, bookings, auth, live-chat, audit และ permissions แต่ยังไม่ได้รันหรือยืนยัน coverage ทุกหน้า/ทุกสถานะ

ควรสร้าง route-state matrix ครอบคลุมอย่างน้อย:

`route × role × viewport × loading/error/empty/success × keyboard/touch`

## 11. ลำดับดำเนินการที่แนะนำ

| ลำดับ | งาน | แนวทางตรวจรับ |
|---|---|---|
| 1 | Mobile search และ route/navigation policy | ทดสอบ search จริงและ role matrix |
| 2 | Logout consistency และป้องกันคำสั่งซ้ำ | Keyboard, confirmation, slow-network double click |
| 3 | Shared modal/drawer/session accessibility | Focus trap/restore, Escape, backdrop, nested dialogs |
| 4 | Request race และ pagination/filter | Response สลับลำดับ, filter ขณะอยู่หน้าถัดไป |
| 5 | Shared form contract และ visual consistency | Label/error association, hover/focus/disabled/pending |
| 6 | Coverage ที่เหลือและ performance baseline | Browser/device matrix, E2E, Web Vitals |

## 12. สถานะส่งมอบ

- [x] สรุปผล code review เป็นรายงาน Markdown
- [x] แยกข้อค้นพบออกจากหัวข้อที่ต้องตรวจเพิ่ม
- [x] ระบุลำดับความสำคัญ พาธอ้างอิง และแนวทางแก้
- [ ] ตรวจ browser ทุก admin route และทุก modal
- [ ] รัน unit/E2E tests ที่เกี่ยวข้อง
- [ ] วัด accessibility และ performance จริง
- [ ] แก้ implementation และตรวจ regression

**รายงานนี้ไม่ใช่การรับรองว่าทุกหน้า `/admin/*` ผ่านการตรวจครบถ้วน และไม่ได้ยืนยันว่าประเด็นที่ระบุได้รับการแก้ไขแล้ว**
