# รายงานสรุปแนวทางออกแบบ LINE LIFF สำหรับ `/service` และ `/booking`

**วันที่สรุป:** 15 สิงหาคม 2569  
**หัวข้อ:** การเลือกจำนวน LIFF App และการจัดการ Loading/Redirect เพื่อป้องกันหน้า Home แสดงก่อนเข้าสู่หน้าปลายทาง

---

## 1. ภาพรวม

ระบบ LINE LIFF มีหน้าหลักที่ต้องการใช้งาน เช่น

- `/service`
- `/booking`

ประเด็นที่พิจารณามี 2 เรื่องหลัก

1. ควรสร้าง **LIFF App เดียว** หรือแยกหลาย LIFF App ตามแต่ละหน้า
2. เมื่อใช้ LIFF เดียวและกำหนด Endpoint URL ไว้ที่หน้า Home พบว่าในบางจังหวะผู้ใช้จะเห็นหน้า Home ชั่วครู่ ก่อนระบบเปลี่ยนไปยัง `/service` หรือ `/booking`

---

## 2. ข้อเสนอเรื่องจำนวน LIFF App

### แนวทางที่แนะนำ

สำหรับ `/service` และ `/booking` ที่อยู่ในระบบเดียวกัน แนะนำให้ใช้

> **1 LINE Login Channel + 1 LIFF App + หลาย Route ภายใน Web App**

ตัวอย่างโครงสร้าง

```text
LIFF App
└── /
    ├── /service
    ├── /service/:id
    ├── /booking
    ├── /booking/confirm
    └── /booking/success
```

### เหตุผล

การใช้ LIFF เดียวเหมาะเมื่อแต่ละหน้า

- อยู่ในระบบเดียวกัน
- ใช้ผู้ใช้ LINE ชุดเดียวกัน
- ใช้ Authentication เดียวกัน
- แชร์ Backend/API เดียวกัน
- แชร์ State และข้อมูลผู้ใช้ร่วมกัน
- มี Flow ต่อเนื่องกัน เช่น Service → Booking → Confirm

ข้อดีคือ

- มี `LIFF_ID` เดียว
- จัดการ `liff.init()` จุดเดียวได้ง่าย
- ลดจำนวน Configuration ที่ต้องดูแล
- ลดความซ้ำซ้อนของ Login Flow
- ขยาย Route เพิ่มในอนาคตได้ง่าย

---

## 3. กรณีที่ควรแยกหลาย LIFF App

ควรพิจารณาแยก LIFF เมื่อแต่ละส่วนมีความแตกต่างอย่างชัดเจน เช่น

- เป็นคนละระบบหรือคนละ Deployment
- ต้องการ LIFF Browser Size ต่างกัน
- ใช้ Permission หรือ Scope ต่างกัน
- แยกทีมพัฒนาและ Lifecycle ออกจากกัน
- ต้องการให้แต่ละหน้าเป็น Entry Point แบบอิสระอย่างแท้จริง
- ต้องการให้ Endpoint ของแต่ละ LIFF เข้าหน้าปลายทางโดยตรง

ตัวอย่าง

```text
LIFF Service
Endpoint → /service

LIFF Booking
Endpoint → /booking
```

ข้อดีคือเปิดเข้าหน้าเป้าหมายตรงกว่า แต่จะเพิ่มภาระในการจัดการ LIFF ID และ Configuration เมื่อระบบขยายใหญ่ขึ้น

---

## 4. ปัญหาที่พบเมื่อ LIFF Endpoint ชี้หน้า Home

ตัวอย่าง

```text
Endpoint URL
https://example.com/
```

เมื่อเปิด

```text
https://liff.line.me/{LIFF_ID}/booking
```

ในบางกรณีจะเห็นพฤติกรรมคล้าย

```text
เปิด LIFF
   ↓
หน้า Home แสดงชั่วครู่
   ↓
LIFF initialization
   ↓
/booking
```

ผลด้าน UX คือผู้ใช้อาจรู้สึกว่า

- เปิดผิดหน้า
- หน้าเว็บกระพริบ
- ระบบ Redirect ซ้ำ
- แอปดูโหลดไม่ต่อเนื่อง

ประเด็นสำคัญจึงไม่ใช่เพียงเรื่องความเร็ว แต่เป็น **สิ่งที่ระบบ Render ระหว่าง LIFF Initialization**

---

## 5. แนวทางแก้ไขที่แนะนำ

### ใช้ Loading/Splash Screen แทนการ Render Home

ระหว่างกำลัง Initialize LIFF ไม่ควรแสดงหน้า Home

ให้แสดงเพียง

- Splash Screen
- Logo
- Spinner
- Pulse Animation
- ข้อความสั้น เช่น `กำลังเปิดบริการ...`

Flow ที่ต้องการคือ

```text
เปิดจาก LINE
      ↓
LIFF Splash / Loading
      ↓
liff.init()
      ↓
/service หรือ /booking
```

แทนที่จะเป็น

```text
เปิดจาก LINE
      ↓
Home
      ↓
liff.init()
      ↓
/booking
```

---

## 6. รูปแบบ Loading ที่แนะนำ

ตัวอย่าง UI

```text
┌────────────────────────────┐
│                            │
│           LOGO             │
│                            │
│      กำลังเปิดบริการ...     │
│                            │
│           ● ● ●            │
│                            │
└────────────────────────────┘
```

ข้อความควรสั้น เช่น

```text
กำลังเปิดบริการ...
```

หรือ

```text
กำลังเตรียมข้อมูล...
```

ไม่จำเป็นต้องใช้ Animation ที่ซับซ้อน เพราะหน้าดังกล่าวมีหน้าที่เป็นช่วงเปลี่ยนผ่านเท่านั้น

---

## 7. ป้องกัน Spinner กระพริบในกรณีโหลดเร็ว

หาก `liff.init()` ใช้เวลาน้อยมาก การแสดง Spinner ทันทีอาจทำให้ Spinner กระพริบเพียงเสี้ยววินาที

แนวทางที่เหมาะสมคือ

```text
0 - 250 ms
→ แสดงพื้นหลัง/Splash แบบนิ่ง

เกินประมาณ 250 ms
→ เริ่มแสดง Spinner หรือ Animation
```

ตัวอย่างแนวคิด

```tsx
const [showLoader, setShowLoader] = useState(false)

useEffect(() => {
  const timer = setTimeout(() => {
    setShowLoader(true)
  }, 250)

  initLiff().finally(() => {
    clearTimeout(timer)
  })

  return () => clearTimeout(timer)
}, [])
```

ผลลัพธ์

```text
กรณีโหลดเร็ว
Splash → หน้าปลายทาง

กรณีโหลดช้า
Splash → Spinner → หน้าปลายทาง
```

ทำให้ UI ดูนิ่งและเป็นธรรมชาติมากกว่า

---

## 8. Architecture ที่แนะนำ

### Option A: ใช้ Route เดิม

```text
/
├── /service
└── /booking
```

หน้า `/` ตรวจสอบก่อนว่ากำลังอยู่ใน LIFF Redirect Flow หรือไม่

```text
/
├── เปิดจาก Web ปกติ
│   └── Home
│
└── เปิดจาก LIFF
    └── Splash / Loading
         ↓
       liff.init()
         ↓
       /service หรือ /booking
```

หลักการคือ

```tsx
if (isLiffRedirect) {
  return <LiffSplash />
}

return <HomePage />
```

ไม่ควรให้ Home ถูก Render ก่อนแล้วค่อย Redirect ภายหลัง

---

## 9. Architecture สำหรับระบบที่อาจขยายใหญ่

อีกแนวทางคือแยกพื้นที่ของ LIFF ออกจาก Web ปกติ

```text
/
├── /service
├── /booking
│
└── /liff
    ├── /service
    └── /booking
```

ตัวอย่าง

```text
app/
├── page.tsx
├── service/
│   └── page.tsx
├── booking/
│   └── page.tsx
│
└── liff/
    ├── layout.tsx
    ├── page.tsx
    ├── service/
    │   └── page.tsx
    └── booking/
        └── page.tsx
```

โดย `/liff` ทำหน้าที่เป็น Bootstrap Area สำหรับ

- `liff.init()`
- Loading State
- Authentication
- LINE Profile
- LIFF Context

Business Component สามารถใช้ร่วมกับหน้า Web ปกติได้ เพื่อลดการเขียนโค้ดซ้ำ

---

## 10. แนวทางที่เหมาะกับระบบปัจจุบัน

สำหรับระบบที่มี

```text
/service
/booking
```

และทั้งสองหน้าอยู่ใน Flow เดียวกัน แนะนำ

### ระยะปัจจุบัน

ใช้

```text
1 LIFF App
+
หลาย Route
+
Splash/Loading ระหว่าง liff.init()
```

โดยไม่ต้องแยก LIFF App ต่อหน้า

### หากระบบขยายใหญ่ขึ้น

พิจารณาจัด LIFF Route เป็น Namespace

```text
/liff/service
/liff/booking
/liff/history
/liff/profile
```

และให้ `/liff` เป็น Bootstrap Entry Point โดยเฉพาะ

---

## 11. Flow ที่แนะนำ

```text
LINE Rich Menu / Message
          ↓
       LIFF URL
          ↓
   LIFF Bootstrap
          ↓
   ┌───────────────┐
   │ Splash Screen │
   │ Logo + Loader │
   └───────────────┘
          ↓
      liff.init()
          ↓
 ┌────────┴────────┐
 ↓                 ↓
/service       /booking
                    ↓
            /booking/confirm
                    ↓
            /booking/success
```

---

## 12. ข้อสรุป

แนวทางที่เหมาะสมที่สุดสำหรับกรณีนี้คือ

> **ใช้ LIFF App เดียว และใช้ Routing ภายใน Web App**

พร้อมเพิ่ม

> **LIFF Splash / Loading Screen ก่อน Render หน้าจริง**

เพื่อไม่ให้ผู้ใช้เห็นหน้า Home แสดงชั่วครู่ก่อน Redirect

รูปแบบที่แนะนำคือ

```text
1 LINE Login Channel
        +
1 LIFF App
        +
LIFF Bootstrap
        +
Splash / Spinner
        +
หลาย Route
```

เช่น

```text
/service
/booking
/booking/confirm
/booking/success
```

หัวใจสำคัญคือ

> **ระหว่าง `liff.init()` ไม่ควร Render หน้า Home**

แต่ควร Render เฉพาะ Loading/Splash UI แล้วจึงเข้าสู่ Route ปลายทางเมื่อ LIFF พร้อมใช้งาน

แนวทางนี้ช่วยให้ได้ทั้ง

- UX ที่ต่อเนื่อง
- Configuration ที่ไม่ซับซ้อน
- ดูแลรักษาง่าย
- รองรับการขยายระบบในอนาคต
- ลดอาการหน้า Home กระพริบก่อนเข้าสู่หน้าปลายทาง
