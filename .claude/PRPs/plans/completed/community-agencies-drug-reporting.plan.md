# Plan: Community Agencies + Drug Reporting Category (PRD E)

## Summary
เพิ่มหน่วยงาน "ผู้นำชุมชนและจิตอาสา" (กำนัน/ผู้ใหญ่บ้าน/จิตอาสา/ผู้นำชุมชน) เป็น 1 รายการใน dropdown และเพิ่มหมวด "ปัญหายาเสพติด" เป็นหมวดหลักเรียงก่อน "ร้องเรียน/ร้องทุกข์" พร้อม 4 ปัญหาย่อย (subcategories) และ workflow ส่งต่อให้ ป.ป.ส./ตำรวจ/กรมการปกครอง

## User Story
As a **ประชาชนในพื้นที่**, I want **เลือกผู้นำชุมชนและจิตอาสาและแจ้งปัญหายาเสพติดได้โดยตรง** so that **ปัญหาในพื้นที่ได้รับการแก้ไขเร็วขึ้นและเบาะแสยาเสพติดถึงหน่วยงานที่ถูกต้อง**

## Problem → Solution
- **Before**: มีเฉพาะ 3 หน่วยงานหลัก (ศูนย์ยุติธรรมชุมชน/ศูนย์ดำรงธรรม/สถานีตำรวจ) ไม่มีช่องทางระดับชุมชน และปัญหายาเสพติดถูกจัดรวมใน "ร้องเรียน/ร้องทุกข์" ไม่สะท้อนความเร่งด่วน
- **After**: มี "ผู้นำชุมชนและจิตอาสา" เป็นตัวเลือก เพิ่มหมวด "ปัญหายาเสพติด" แยกชัดเจน พร้อม workflow ส่งต่อให้ ป.ป.ส./ตำรวจ

## Metadata
- **Complexity**: Large
- **Source PRD**: `.claude/PRPs/prds/community-agencies-drug-reporting.prd.md`
- **PRD Phase**: All phases (1+2+3+4+5)
- **Estimated Files**: 12-15 files

---

## UX Design

### Before
```
[เลือกหน่วยงาน]
- ศูนย์ยุติธรรมชุมชน
- ศูนย์ดำรงธรรม
- สถานีตำรวจภูธร

[เลือกหมวดคำร้อง]
- ร้องเรียน
- ร้องทุกข์
- ขอความช่วยเหลือ
```

### After
```
[เลือกหน่วยงาน]
- ผู้นำชุมชนและจิตอาสา (กำนัน/ผู้ใหญ่บ้าน/จิตอาสา/ผู้นำชุมชน)  ← NEW
- ศูนย์ยุติธรรมชุมชน
- ศูนย์ดำรงธรรม
- สถานีตำรวจภูธร

[เลือกหมวดคำร้อง]
- ปัญหายาเสพติด  ← NEW (เรียงก่อน)
  - ผู้เสพ/ผู้ป่วยที่เฝ้าระวัง/อันตราย
  - ขอความช่วยเหลือบำบัดผู้เสพ
  - ครอบครัวที่ต้องเข้าช่วยเหลือจากผลกระทบยาเสพติด
  - แจ้งเบาะสะยาเสพติด
- ร้องเรียน
- ร้องทุกข์
- ขอความช่วยเหลือ
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Agency dropdown | 3 options | 4 options (เพิ่มผู้นำชุมชนและจิตอาสา) | เรียงลำดับให้ชุมชนอยู่ก่อน |
| Category dropdown | ไม่มี "ปัญหายาเสพติด" | มีเป็นหมวดแรก | เรียงก่อน "ร้องเรียน/ร้องทุกข์" |
| Subcategory | แสดงตาม category ที่เลือก | แสดง 4 ปัญหาย่อยเมื่อเลือก "ปัญหายาเสพติด" | ใช้ conditional rendering pattern เดิม |
| Request detail | ไม่มีปุ่มส่งต่อ | มีปุ่ม "ส่งต่อหน่วยงานเฉพาะทาง" | เฉพาะ category ยาเสพติด |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `frontend/app/liff/service-request/page.tsx` | 700-800 | Pattern สำหรับ conditional subcategory dropdown |
| P0 | `frontend/app/liff/request-v2/page.tsx` | 500-600 | Pattern เดียวกันสำหรับ subcategory |
| P0 | `frontend/app/admin/requests/create/page.tsx` | all | Admin create form ต้องเพิ่ม category/subcategory |
| P1 | `frontend/app/admin/requests/[id]/page.tsx` | 400-500 | Action button pattern สำหรับ escalation |
| P1 | `frontend/components/ui/ConfirmDialog.tsx` | all | Dialog pattern สำหรับ escalation confirmation |
| P2 | `backend/app/schemas/service_request.py` | all | ตรวจสอบ agency/category validation |
| P2 | `backend/app/models/service_request.py` | 1-30 | RequestStatus enum (ถ้าต้องเพิ่ม ESCALATED) |

---

## Patterns to Mirror

### CONDITIONAL_SUBCATEGORY (LIFF pattern)
```tsx
// SOURCE: frontend/app/liff/service-request/page.tsx:743
{formData.topic_category && TOPIC_OPTIONS[formData.topic_category] && (
    <div className="animate-in slide-in-from-top-2">
        <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
            รายละเอียดเรื่อง <span className="text-red-500">*</span>
        </label>
        <select
            name="topic_subcategory"
            value={formData.topic_subcategory}
            onChange={handleChange}
            required
        >
            <option value="">-- เลือกรายละเอียด --</option>
            {TOPIC_OPTIONS[formData.topic_category].map(sub => (
                <option key={sub} value={sub}>{sub}</option>
            ))}
        </select>
    </div>
)}
```

### ACTION_BUTTON_PATTERN
```tsx
// SOURCE: frontend/app/admin/requests/[id]/page.tsx:411-499
{request.status === 'IN_PROGRESS' && (isAssignee || canApprove) && (
    <Button
        variant="primary"
        size="sm"
        disabled={submitting}
        onClick={() => { void guardedUpdate({ status: 'NEW_STATUS' }); }}
        leftIcon={<SomeIcon size={18} />}
    >
        Label
    </Button>
)}
```

### TOPIC_OPTIONS_STRUCTURE
```tsx
// SOURCE: frontend/app/liff/service-request/page.tsx
const TOPIC_OPTIONS: Record<string, string[]> = {
    "กองทุนยุติธรรม": ["ค่าจ้างทนายความ", "ค่าธรรมเนียมศาล", "เงินประกันตัว", "อื่นๆ"],
    "ร้องเรียน/ร้องทุกข์": ["อธิบายสั้นๆ"],
    // เพิ่มใหม่:
    "ปัญหายาเสพติด": [
        "ผู้เสพ/ผู้ป่วยที่เฝ้าระวัง/อันตราย",
        "ขอความช่วยเหลือบำบัดผู้เสพ",
        "ครอบครัวที่ต้องเข้าช่วยเหลือจากผลกระทบยาเสพติด",
        "แจ้งเบาะสะยาเสพติด"
    ],
};
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `frontend/lib/constants/agencies.ts` | CREATE | Centralized agency constants |
| `frontend/lib/constants/categories.ts` | CREATE | Centralized category constants |
| `frontend/app/admin/requests/create/page.tsx` | UPDATE | เพิ่ม category/subcategory, เปลี่ยน agency เป็น Select |
| `frontend/app/liff/service-request/page.tsx` | UPDATE | เพิ่ม agency option, เพิ่ม drug category ใน TOPIC_OPTIONS |
| `frontend/app/liff/request-v2/page.tsx` | UPDATE | เพิ่ม agency option, เพิ่ม drug category ใน TOPIC_OPTIONS |
| `frontend/app/admin/requests/page.tsx` | UPDATE | เพิ่ม category filter option |
| `frontend/app/admin/requests/[id]/page.tsx` | UPDATE | เพิ่ม escalation button + dialog |
| `frontend/components/ui/EscalationDialog.tsx` | CREATE | Dialog สำหรับเลือกหน่วยงานส่งต่อ |
| `backend/app/schemas/service_request.py` | UPDATE | ตรวจสอบและเพิ่ม validation สำหรับค่าใหม่ (ถ้าจำเป็น) |
| `backend/app/models/service_request.py` | UPDATE | เพิ่ม ESCALATED status (ถ้าจำเป็น) |
| `backend/tests/test_schemas.py` | CREATE | Unit tests สำหรับ schema validation |
| `frontend/e2e/drug-reporting.spec.ts` | CREATE | E2E tests สำหรับ drug reporting flow |

## NOT Building

- ❌ Real-time notification สำหรับยาเสพติด
- ❌ Anonymous reporting system
- ❌ Database schema ใหม่ (ใช้ fields เดิม)
- ❌ SLA เฉพาะสำหรับยาเสพติด
- ❌ Escalation history tracking (ใช้ details field เดิม)
- ❌ Permission key `can_escalate` แยก (ใช้ permission flow เดิมของหมวดอื่นๆ)

---

## Step-by-Step Tasks

### Task 1: สร้าง constants files (agencies + categories)
- **ACTION**: สร้าง centralized constant files สำหรับ agency และ category options
- **IMPLEMENT**:
  ```ts
  // frontend/lib/constants/agencies.ts
  export const AGENCIES = [
    { value: 'ผู้นำชุมชนและจิตอาสา', label: 'กำนัน ผู้ใหญ่บ้าน จิตอาสา ผู้นำชุมชน' },
    { value: 'ศูนย์ยุติธรรมชุมชน', label: 'ศูนย์ยุติธรรมชุมชน' },
    { value: 'ศูนย์ดำรงธรรม', label: 'ศูนย์ดำรงธรรม' },
    { value: 'สถานีตำรวจภูธร', label: 'สถานีตำรวจภูธร' },
  ];
  
  // frontend/lib/constants/categories.ts
  export const CATEGORIES = [
    { value: 'ปัญหายาเสพติด', label: 'ปัญหายาเสพติด' },
    { value: 'ร้องเรียน', label: 'ร้องเรียน' },
    { value: 'ร้องทุกข์', label: 'ร้องทุกข์' },
    { value: 'ขอความช่วยเหลือ', label: 'ขอความช่วยเหลือ' },
    { value: 'อื่นๆ', label: 'อื่นๆ' },
  ];
  
  export const DRUG_REPORTING_SUBCATEGORIES = [
    { value: 'ผู้เสพ/ผู้ป่วยที่เฝ้าระวัง/อันตราย', label: 'ผู้เสพ/ผู้ป่วยที่เฝ้าระวัง/อันตราย' },
    { value: 'ขอความช่วยเหลือบำบัดผู้เสพ', label: 'ขอความช่วยเหลือบำบัดผู้เสพ' },
    { value: 'ครอบครัวที่ต้องเข้าช่วยเหลือจากผลกระทบยาเสพติด', label: 'ครอบครัวที่ต้องเข้าช่วยเหลือจากผลกระทบยาเสพติด' },
    { value: 'แจ้งเบาะสะยาเสพติด', label: 'แจ้งเบาะสะยาเสพติด' },
  ];
  ```
- **MIRROR**: ใช้ pattern เดียวกับ `request-status.ts`
- **IMPORTS**: None
- **GOTCHA**: ต้องเรียงลำดับให้ "ปัญหายาเสพติด" อยู่ก่อน "ร้องเรียน"
- **VALIDATE**: Import constants ในไฟล์อื่นได้

### Task 2: Backend - ตรวจสอบและเพิ่ม validation สำหรับค่าใหม่
- **ACTION**: ตรวจสอบ backend schema และเพิ่ม agency/category values ถ้ามี validation
- **IMPLEMENT**:
  - อ่าน `backend/app/schemas/service_request.py`
  - ถ้า agency/category เป็น enum ให้เพิ่มค่าใหม่
  - ถ้าเป็น string พร้อม validator ให้เพิ่มค่าใหม่ใน validator
  - ถ้าไม่มี validation ไม่ต้องแก้
- **MIRROR**: ใช้ pattern เดิมของ schema validation
- **IMPORTS**: None
- **GOTCHA**: Backend agent error 403 ต้องตรวจสอบเองตอน implement
- **VALIDATE**: `pytest backend/tests/test_schemas.py` ผ่าน

### Task 3: Admin create form - เพิ่ม category/subcategory + agency dropdown
- **ACTION**: แก้ `frontend/app/admin/requests/create/page.tsx`
- **IMPLEMENT**:
  1. Import constants จาก Task 1
  2. เปลี่ยน agency จาก `<Input>` เป็น `<Select>` ใช้ `AGENCIES`
  3. เปลี่ยน category dropdown ให้ใช้ `CATEGORIES`
  4. เพิ่ม conditional subcategory dropdown เมื่อเลือก "ปัญหายาเสพติด":
     ```tsx
     {formData.topic_category === 'ปัญหายาเสพติด' && (
         <Select
             options={DRUG_REPORTING_SUBCATEGORIES}
             value={formData.topic_subcategory}
             onChange={(e) => setFormData({...formData, topic_subcategory: e.target.value})}
             placeholder="-- เลือกปัญหาย่อย --"
         />
     )}
     ```
- **MIRROR**: ใช้ pattern จาก LIFF conditional subcategory
- **IMPORTS**: `AGENCIES`, `CATEGORIES`, `DRUG_REPORTING_SUBCATEGORIES` from constants
- **GOTCHA**: Admin create ใช้ react-hook-form + zod ต้อง integrate ให้ถูก
- **VALIDATE**: เปิดหน้า create, เลือก category ยาเสพติด, เห็น subcategory dropdown

### Task 4: LIFF service-request - เพิ่ม agency + drug category
- **ACTION**: แก้ `frontend/app/liff/service-request/page.tsx`
- **IMPLEMENT**:
  1. Import `AGENCIES` จาก constants
  2. เปลี่ยน agency `<select>` options ให้ใช้ `AGENCIES.map()`
  3. เพิ่ม "ปัญหายาเสพติด" ใน `TOPIC_OPTIONS`:
     ```tsx
     const TOPIC_OPTIONS: Record<string, string[]> = {
         "ปัญหายาเสพติด": [
             "ผู้เสพ/ผู้ป่วยที่เฝ้าระวัง/อันตราย",
             "ขอความช่วยเหลือบำบัดผู้เสพ",
             "ครอบครัวที่ต้องเข้าช่วยเหลือจากผลกระทบยาเสพติด",
             "แจ้งเบาะสะยาเสพติด"
         ],
         // ... existing categories
     };
     ```
  4. เรียงลำดับให้ "ปัญหายาเสพติด" อยู่แรก (object key order)
- **MIRROR**: ใช้ TOPIC_OPTIONS structure เดิม
- **IMPORTS**: `AGENCIES` from constants
- **GOTCHA**: ต้องเรียง object keys ให้ถูก JavaScript รักษาลำดับ insertion order
- **VALIDATE**: เปิด LIFF form, เห็นหน่วยงานชุมชน + หมวดยาเสพติดเป็นรายการแรก

### Task 5: LIFF request-v2 - เพิ่ม agency + drug category
- **ACTION**: แก้ `frontend/app/liff/request-v2/page.tsx`
- **IMPLEMENT**: ทำเหมือน Task 4 แต่ใช้ pattern ของ request-v2
- **MIRROR**: ใช้ TOPIC_OPTIONS structure เดิมของ request-v2
- **IMPORTS**: `AGENCIES` from constants
- **GOTCHA**: request-v2 มี categories ไม่เหมือน service-request ต้อง merge ให้ถูก
- **VALIDATE**: เปิด request-v2 form, เห็นตัวเลือกใหม่

### Task 6: Admin list - เพิ่ม category filter option
- **ACTION**: แก้ `frontend/app/admin/requests/page.tsx`
- **IMPLEMENT**: เพิ่ม "ปัญหายาเสพติด" ใน category filter dropdown:
  ```tsx
  <Select
      value={filter.category}
      onChange={(e) => setFilter(prev => ({ ...prev, category: e.target.value }))}
      options={[
          { value: '', label: 'ทุกหมวดหมู่' },
          { value: 'ปัญหายาเสพติด', label: 'ปัญหายาเสพติด' },
          // ... existing options
      ]}
  />
  ```
- **MIRROR**: ใช้ pattern เดิมของ filter dropdown
- **IMPORTS**: None
- **GOTCHA**: เรียงลำดับให้สอดคล้องกับ forms อื่น
- **VALIDATE**: เปิด admin list, เลือก filter "ปัญหายาเสพติด"

### Task 7: สร้าง EscalationDialog component
- **ACTION**: สร้าง `frontend/components/ui/EscalationDialog.tsx`
- **IMPLEMENT**:
  ```tsx
  interface EscalationDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (agency: string, reason: string) => void;
    isLoading?: boolean;
  }
  
  const ESCALATION_AGENCIES = [
    { value: 'ปปส', label: 'ป.ป.ส. (สำนักงานคณะกรรมการป้องกันและปราบปรามยาเสพติด)' },
    { value: 'ตำรวจ', label: 'ตำรวจ' },
    { value: 'กรมการปกครอง', label: 'กรมการปกครอง' },
    { value: 'อื่นๆ', label: 'กำหนดเอง' },
  ];
  
  export function EscalationDialog({ isOpen, onClose, onConfirm, isLoading }: EscalationDialogProps) {
    const [agency, setAgency] = useState('');
    const [customAgency, setCustomAgency] = useState('');
    
    const handleConfirm = () => {
      const finalAgency = agency === 'อื่นๆ' ? customAgency : agency;
      onConfirm(finalAgency, '');
    };
    
    return (
      <Modal isOpen={isOpen} onClose={onClose} maxWidth="md">
        <div className="space-y-4">
          <h3 className="text-lg font-bold">ส่งต่อหน่วยงานเฉพาะทาง</h3>
          <Select
            options={ESCALATION_AGENCIES}
            value={agency}
            onChange={(e) => setAgency(e.target.value)}
            placeholder="-- เลือกหน่วยงาน --"
          />
          {agency === 'อื่นๆ' && (
            <Input
              value={customAgency}
              onChange={(e) => setCustomAgency(e.target.value)}
              placeholder="ระบุหน่วยงาน"
            />
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
            <Button 
              variant="warning" 
              onClick={handleConfirm} 
              disabled={!agency || (agency === 'อื่นๆ' && !customAgency)}
            >
              ส่งต่อ
            </Button>
          </div>
        </div>
      </Modal>
    );
  }
  ```
- **MIRROR**: ใช้ pattern จาก ConfirmDialog + AssignModal
- **IMPORTS**: `Modal`, `Button`, `Select`, `Input` from UI components
- **GOTCHA**: ต้อง handle "อื่นๆ" case ให้ user พิมพ์เอง
- **VALIDATE**: เปิด dialog, เลือกหน่วยงาน, กดส่งต่อ

### Task 8: Request detail - เพิ่ม escalation button + dialog
- **ACTION**: แก้ `frontend/app/admin/requests/[id]/page.tsx`
- **IMPLEMENT**:
  1. Import `EscalationDialog`
  2. เพิ่ม state: `const [escalationDialogOpen, setEscalationDialogOpen] = useState(false);`
  3. เพิ่ม handler (ใช้ permission flow เดิมของหมวดอื่นๆ):
     ```tsx
     const handleEscalate = async (agency: string, reason: string) => {
         await handleUpdateField({
             details: {
                 ...request.details,
                 escalated_to: agency,
                 escalation_reason: reason,
                 escalated_at: new Date().toISOString(),
             }
         });
         setEscalationDialogOpen(false);
     };
     ```
  4. เพิ่ม button ใน hero section (เฉพาะ category ยาเสพติด):
     ```tsx
     {request.topic_category === 'ปัญหายาเสพติด' && canApprove && (
         <Button
             variant="warning"
             size="sm"
             disabled={submitting}
             onClick={() => setEscalationDialogOpen(true)}
             leftIcon={<Forward size={18} />}
         >
             ส่งต่อหน่วยงานเฉพาะทาง
         </Button>
     )}
     ```
  5. เพิ่ม dialog:
     ```tsx
     <EscalationDialog
         isOpen={escalationDialogOpen}
         onClose={() => setEscalationDialogOpen(false)}
         onConfirm={handleEscalate}
         isLoading={submitting}
     />
     ```
- **MIRROR**: ใช้ ACTION_BUTTON_PATTERN จาก existing buttons
- **IMPORTS**: `EscalationDialog`, `Forward` icon from lucide-react
- **GOTCHA**: ต้องเช็ค `topic_category` ไม่ใช่ `category` (ตรวจสอบ field name จริง)
- **VALIDATE**: เปิด request detail ของยาเสพติด, เห็นปุ่มส่งต่อ, กดแล้ว dialog เปิด

### Task 9: Unit tests สำหรับ constants
- **ACTION**: สร้าง `frontend/lib/constants/__tests__/agencies.test.ts` และ `categories.test.ts`
- **IMPLEMENT**:
  ```ts
  describe('AGENCIES', () => {
    it('มีผู้นำชุมชนและจิตอาสาเป็นรายการแรก', () => {
      expect(AGENCIES[0].value).toBe('ผู้นำชุมชนและจิตอาสา');
    });
    it('มี 4 หน่วยงาน', () => {
      expect(AGENCIES).toHaveLength(4);
    });
  });
  
  describe('CATEGORIES', () => {
    it('มีปัญหา ยาเสพติดเป็นหมวดแรก', () => {
      expect(CATEGORIES[0].value).toBe('ปัญหายาเสพติด');
    });
  });
  
  describe('DRUG_REPORTING_SUBCATEGORIES', () => {
    it('มี 4 ปัญหาย่อย', () => {
      expect(DRUG_REPORTING_SUBCATEGORIES).toHaveLength(4);
    });
  });
  ```
- **MIRROR**: ใช้ Vitest pattern เดิม
- **IMPORTS**: Constants from Task 1
- **GOTCHA**: ต้อง test ลำดับการเรียง
- **VALIDATE**: `npm test` ผ่าน

### Task 10: Backend unit tests สำหรับ schema validation
- **ACTION**: สร้าง `backend/tests/test_schemas_drug_reporting.py`
- **IMPLEMENT**:
  ```python
  def test_agency_accepts_community_leader():
      data = {
          "agency": "ผู้นำชุมชนและจิตอาสา",
          "category": "ปัญหายาเสพติด",
          # ... other fields
      }
      request = ServiceRequestCreate(**data)
      assert request.agency == "ผู้นำชุมชนและจิตอาสา"
  
  def test_category_accepts_drug_problem():
      # Similar test
  ```
- **MIRROR**: ใช้ pytest pattern เดิม
- **IMPORTS**: `ServiceRequestCreate` from schemas
- **GOTCHA**: ต้องตรวจสอบ field names จริงใน schema
- **VALIDATE**: `pytest backend/tests/test_schemas_drug_reporting.py` ผ่าน

### Task 11: E2E tests สำหรับ drug reporting flow
- **ACTION**: สร้าง `frontend/e2e/drug-reporting.spec.ts`
- **IMPLEMENT**:
  ```ts
  test('สามารถสร้างคำร้องปัญหายาเสพติดได้', async ({ page }) => {
      await page.goto('/admin/requests/create');
      
      // Step through form
      await page.selectOption('[name="agency"]', 'ผู้นำชุมชนและจิตอาสา');
      await page.selectOption('[name="topic_category"]', 'ปัญหายาเสพติด');
      
      // Subcategory should appear
      await expect(page.locator('[name="topic_subcategory"]')).toBeVisible();
      
      await page.selectOption('[name="topic_subcategory"]', 'แจ้งเบาะสะยาเสพติด');
      
      // Submit
      await page.click('button[type="submit"]');
      
      // Verify
      await expect(page.locator('text=สร้างคำร้องสำเร็จ')).toBeVisible();
  });
  
  test('สามารถส่งต่อคำร้องยาเสพติดได้', async ({ page }) => {
      // Navigate to drug reporting request
      await page.goto('/admin/requests/123');
      
      // Click escalation button
      await page.click('text=ส่งต่อหน่วยงานเฉพาะทาง');
      
      // Dialog opens
      await expect(page.locator('text=ส่งต่อหน่วยงานเฉพาะทาง')).toBeVisible();
      
      // Select agency
      await page.selectOption('[name="escalation_agency"]', 'ปปส');
      await page.click('text=ส่งต่อ');
      
      // Verify
      await expect(page.locator('text=ส่งต่อสำเร็จ')).toBeVisible();
  });
  ```
- **MIRROR**: ใช้ Playwright pattern เดิมจาก `admin-requests-supervisor.spec.ts`
- **IMPORTS**: `test`, `expect` from @playwright/test
- **GOTCHA**: ต้องมี test data (request ID 123)
- **VALIDATE**: `npx playwright test drug-reporting` ผ่าน

### Task 12: Manual validation checklist
- **ACTION**: สร้าง checklist สำหรับ manual testing
- **IMPLEMENT**:
  - [ ] เปิด admin create form → เห็น "ผู้นำชุมชนและจิตอาสา" ใน dropdown
  - [ ] เลือก category "ปัญหายาเสพติด" → subcategory dropdown ปรากฏ
  - [ ] เลือก subcategory → form submit ได้
  - [ ] เปิด LIFF service-request → เห็นตัวเลือกใหม่
  - [ ] เปิด LIFF request-v2 → เห็นตัวเลือกใหม่
  - [ ] เปิด admin list → filter "ปัญหายาเสพติด" ทำงาน
  - [ ] เปิด request detail ของยาเสพติด → เห็นปุ่มส่งต่อ
  - [ ] กดปุ่มส่งต่อ → dialog เปิด
  - [ ] เลือก ป.ป.ส. แล้วส่งต่อ → details.updated
- **MIRROR**: N/A
- **IMPORTS**: N/A
- **GOTCHA**: ต้องมี test data สำหรับ request ยาเสพติด
- **VALIDATE**: ทุกข้อใน checklist ผ่าน

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| AGENCIES มี 4 รายการ | - | length === 4 | No |
| AGENCIES[0] คือผู้นำชุมชนและจิตอาสา | - | value === 'ผู้นำชุมชนและจิตอาสา' | No |
| CATEGORIES[0] คือปัญหายาเสพติด | - | value === 'ปัญหายาเสพติด' | No |
| DRUG_REPORTING_SUBCATEGORIES มี 4 รายการ | - | length === 4 | No |
| Schema accepts community leader agency | agency: "ผู้นำชุมชนและจิตอาสา" | Validation passes | No |
| Schema accepts drug problem category | category: "ปัญหายาเสพติด" | Validation passes | No |

### Edge Cases Checklist
- [ ] เลือก category ยาเสพติดแต่ไม่เลือก subcategory → form validation error
- [ ] เลือก category อื่น (ไม่ใช่ยาเสพติด) → ไม่มี subcategory dropdown
- [ ] Request detail ที่ไม่ใช่ยาเสพติด → ไม่มีปุ่มส่งต่อ
- [ ] กดส่งต่อแต่ไม่เลือกหน่วยงาน → button disabled
- [ ] เลือก "อื่นๆ" แล้วไม่พิมพ์ชื่อหน่วยงาน → validation error

---

## Validation Commands

### Static Analysis
```bash
cd frontend && npx tsc --noEmit
```
EXPECT: Zero type errors

### Unit Tests
```bash
cd frontend && npm test agencies.test.ts categories.test.ts
cd backend && pytest tests/test_schemas_drug_reporting.py
```
EXPECT: All tests pass

### Full Test Suite
```bash
cd frontend && npm test
cd backend && pytest
```
EXPECT: No regressions

### E2E Tests
```bash
cd frontend && npx playwright test drug-reporting.spec.ts
```
EXPECT: All E2E tests pass

### Manual Validation
- ทำตาม checklist ใน Task 12
EXPECT: ทุกข้อผ่าน

---

## Acceptance Criteria
- [ ] Task 1-12 completed
- [ ] All validation commands pass
- [ ] Tests written and passing
- [ ] No type errors
- [ ] No lint errors
- [ ] Matches UX design
- [ ] "ผู้นำชุมชนและจิตอาสา" ปรากฏใน dropdown ทั้ง 3 forms
- [ ] หมวด "ปัญหายาเสพติด" ปรากฏเป็นหมวดแรก
- [ ] Subcategory แสดงเมื่อเลือกยาเสพติด
- [ ] ปุ่มส่งต่อปรากฏใน request detail ของยาเสพติด
- [ ] ส่งต่อสำเร็จและบันทึกใน details

## Completion Checklist
- [ ] Code follows discovered patterns
- [ ] Error handling matches codebase style
- [ ] Tests follow test patterns
- [ ] No hardcoded values (ใช้ constants)
- [ ] Documentation updated (ถ้าจำเป็น)
- [ ] No unnecessary scope additions

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Backend schema มี validation ที่ต้องแก้ | Medium | High | Task 2 ตรวจสอบก่อน, ถ้าไม่มี validation ไม่ต้องแก้ |
| Object key order ไม่คงที่ใน JavaScript | Low | Medium | ใช้ array แทน object สำหรับ TOPIC_OPTIONS |
| Admin create form ใช้ react-hook-form ซับซ้อน | Medium | Medium | อ่านโค้ดก่อนแก้, test ทุก step |
| ไม่มี test data สำหรับยาเสพติด | High | Medium | สร้าง test data ใน E2E setup |

## Notes

### Key Decisions
1. **"ผู้นำชุมชนและจิตอาสา" เป็น 1 รายการ** ไม่ใช่ 4 รายการแยก
2. **เรียงลำดับ**: "ปัญหายาเสพติด" ก่อน "ร้องเรียน/ร้องทุกข์"
3. **ใช้ details field** เก็บ escalation info ไม่เพิ่ม column ใหม่
4. **ไม่มี ESCALATED status** ใช้ status เดิม (IN_PROGRESS/AWAITING_APPROVAL)
5. **Centralized constants** สร้างไฟล์ constants ใหม่เพื่อลด duplication
6. **Permission flow เดิม** ของหมวดอื่นๆ (ไม่เพิ่ม permission ใหม่)

### Assumptions (ต้องตรวจสอบตอน implement)
- Backend agency field เป็น string ไม่มี enum constraint
- Backend category field เป็น string ไม่มี enum constraint
- Field name คือ `topic_category` และ `topic_subcategory` (ตรวจสอบใน schema)
- Request detail แสดง `request.topic_category` (ตรวจสอบใน API response)

### Open Questions (from PRD)
- แจ้งเตือนอัตโนมัติให้ ป.ป.ส.? → **MVP: ไม่แจ้ง** (Future: LINE API)
- Track escalation history? → **MVP: ใช้ details field** (Future: escalation_log table)
- จำกัดสิทธิ์ส่งต่อเฉพาะ supervisor? → **MVP: ใช้ can_approve** (permission flow เดิม)
