// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import LiffDebtMediationPage from '../page'
import { SESSION_EXPIRED_MESSAGE } from '@/lib/liff/session-expired'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
const liffCloseWindow = vi.fn()

function stubLiff() {
  vi.stubGlobal('liff', {
    init: vi.fn(async () => {}),
    isLoggedIn: vi.fn(() => true),
    isInClient: vi.fn(() => true),
    getProfile: vi.fn(async () => ({ userId: 'U1', displayName: 'สมชาย' })),
    getIDToken: vi.fn(() => 'token-123'),
    closeWindow: liffCloseWindow,
  })
}

function stubFetch(overrides: { submitStatus?: number; submitBody?: unknown; provincesOk?: boolean } = {}) {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/locations/provinces')) {
      if (overrides.provincesOk === false) return jsonResponse({ detail: 'fail' }, 500)
      return jsonResponse([
        { PROVINCE_ID: 74, PROVINCE_THAI: 'สกลนคร', PROVINCE_ENGLISH: 'Sakon Nakhon' },
        { PROVINCE_ID: 1, PROVINCE_THAI: 'กรุงเทพมหานคร', PROVINCE_ENGLISH: 'Bangkok' },
      ])
    }
    if (u.includes('/liff/debt-mediation') && init?.method === 'POST') {
      const status = overrides.submitStatus ?? 201
      const body = overrides.submitBody ?? { id: 9, status: 'PENDING' }
      return jsonResponse(body, status)
    }
    throw new Error(`Unexpected fetch: ${u}`)
  })
  vi.stubGlobal('fetch', fetchMock)
}

/** Fill step 2 (personal + debt info) fields. */
async function fillStep2(
  user: ReturnType<typeof userEvent.setup>,
  phone = '0812345678',
) {
  await user.type(screen.getByPlaceholderText('ระบุชื่อ-นามสกุล'), 'สมชาย ใจดี')
  await user.type(screen.getByPlaceholderText('0xx-xxx-xxxx'), phone)
  await user.type(screen.getByPlaceholderText('0.00'), '20000')
  await user.selectOptions(screen.getByRole('combobox'), 'สกลนคร')
}

/** Choose the first issue option (debtor path). */
async function chooseDebtorIssue(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('button', {
      name: 'ค้างชำระหนี้ ถูกข่มขู่/กลั่นแกล้ง ไม่สามารถจ่ายได้',
    }),
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  process.env.NEXT_PUBLIC_LIFF_ID = 'test-liff-id'
  stubLiff()
  stubFetch()
})

describe('debt mediation wizard', () => {
  it('renders the 3-step wizard with the submitter step first', async () => {
    render(<LiffDebtMediationPage />)
    expect(await screen.findByText('ขอแก้หนี้')).toBeInTheDocument()
    expect(screen.getByText('สถานะของผู้ยื่นคำขอ')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^ลูกหนี้/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^เจ้าหนี้/ })).toBeInTheDocument()
  })

  it('blocks advancing until a submitter type is chosen', async () => {
    const user = userEvent.setup()
    render(<LiffDebtMediationPage />)
    await screen.findByText('สถานะของผู้ยื่นคำขอ')

    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    expect(screen.getByText('กรุณาเลือกสถานะผู้ยื่นคำขอ')).toBeInTheDocument()
    expect(screen.getByText('กรุณากรอกข้อมูลในช่องขอบสีแดงให้ครบถ้วน')).toBeInTheDocument()
  })

  it('walks the full debtor path and submits the expected payload', async () => {
    const user = userEvent.setup()
    render(<LiffDebtMediationPage />)
    await screen.findByText('สถานะของผู้ยื่นคำขอ')

    // Step 1: submitter = debtor
    await user.click(screen.getByRole('button', { name: /^ลูกหนี้/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))

    // Step 2: personal + debt info
    await waitFor(() => screen.getByPlaceholderText('ระบุชื่อ-นามสกุล'))
    await fillStep2(user)
    await user.click(screen.getByRole('button', { name: /^หนี้นอกระบบ/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))

    // Step 3: creditor info — interest rate visible for the debtor path
    expect(screen.getByText('ข้อมูลเจ้าหนี้')).toBeInTheDocument()
    expect(screen.getByText('อัตราดอกเบี้ย')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('ระบุชื่อเจ้าหนี้ (บุคคลหรือสถาบัน)'), 'นายทุนตลาดทอน')
    await user.type(screen.getByPlaceholderText('เช่น ร้อยละ 5 ต่อเดือน'), 'ร้อยละ 20 ต่อเดือน')
    await chooseDebtorIssue(user)
    await user.click(screen.getByRole('button', { name: 'ยื่นคำขอ' }))

    // Confirm modal
    await user.click(screen.getByRole('button', { name: 'ยืนยันคำขอ' }))
    expect(await screen.findByText('ลงทะเบียนสำเร็จ')).toBeInTheDocument()

    const call = fetchMock.mock.calls.find(
      ([u, init]) => String(u).includes('/liff/debt-mediation') && init?.method === 'POST',
    )
    expect(call).toBeDefined()
    const headers = new Headers(call![1]?.headers as HeadersInit)
    expect(headers.get('x-liff-id-token')).toBe('token-123')
    const payload = JSON.parse(String(call![1].body))
    expect(payload).toMatchObject({
      submitter_type: 'DEBTOR',
      full_name: 'สมชาย ใจดี',
      phone_number: '0812345678',
      province: 'สกลนคร',
      debt_amount: '20000',
      debt_type: 'INFORMAL',
      counterparty_name: 'นายทุนตลาดทอน',
      interest_rate: 'ร้อยละ 20 ต่อเดือน',
      line_user_id: 'U1',
    })

    // In-LINE success screen offers auto close
    expect(screen.getByText(/ปิดหน้าต่างอัตโนมัติ/)).toBeInTheDocument()
  })

  it('walks the creditor path: no interest rate, creditor issue options', async () => {
    const user = userEvent.setup()
    render(<LiffDebtMediationPage />)
    await screen.findByText('สถานะของผู้ยื่นคำขอ')

    await user.click(screen.getByRole('button', { name: /^เจ้าหนี้/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    await fillStep2(user)
    await user.click(screen.getByRole('button', { name: /^หนี้ในระบบ/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))

    expect(screen.getByText('ข้อมูลลูกหนี้')).toBeInTheDocument()
    expect(screen.queryByText('อัตราดอกเบี้ย')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ลูกหนี้ไม่มีเงินจ่ายหนี้' })).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('ระบุชื่อลูกหนี้'), 'สมหญิง ก่อหนี้')
    await user.click(screen.getByRole('button', { name: 'ลูกหนี้ปฏิเสธไม่ยอมชำระหนี้' }))
    await user.click(screen.getByRole('button', { name: 'ยื่นคำขอ' }))
    await user.click(screen.getByRole('button', { name: 'ยืนยันคำขอ' }))
    expect(await screen.findByText('ลงทะเบียนสำเร็จ')).toBeInTheDocument()

    const call = fetchMock.mock.calls.find(
      ([u, init]) => String(u).includes('/liff/debt-mediation') && init?.method === 'POST',
    )
    const payload = JSON.parse(String(call![1].body))
    expect(payload).toMatchObject({ submitter_type: 'CREDITOR' })
    expect(payload.interest_rate).toBeNull()
  })

  it('rejects "อื่น ๆ" without detail on step 3', async () => {
    const user = userEvent.setup()
    render(<LiffDebtMediationPage />)
    await screen.findByText('สถานะของผู้ยื่นคำขอ')

    await user.click(screen.getByRole('button', { name: /^ลูกหนี้/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    await fillStep2(user)
    await user.click(screen.getByRole('button', { name: /^หนี้นอกระบบ/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))

    await user.type(screen.getByPlaceholderText('ระบุชื่อเจ้าหนี้ (บุคคลหรือสถาบัน)'), 'นายทุน')
    await user.type(screen.getByPlaceholderText('เช่น ร้อยละ 5 ต่อเดือน'), 'ร้อยละ 5')
    await user.click(screen.getByRole('button', { name: /^อื่น ๆ$/ }))
    await user.click(screen.getByRole('button', { name: 'ยื่นคำขอ' }))

    expect(screen.getByText('กรุณาระบุ')).toBeInTheDocument()
    expect(screen.queryByText('ลงทะเบียนสำเร็จ')).not.toBeInTheDocument()
  })

  it('surfaces the server error instead of the success screen on failure', async () => {
    stubFetch({
      submitStatus: 422,
      submitBody: { detail: 'interest_rate is required when the submitter is a debtor.' },
    })
    const user = userEvent.setup()
    render(<LiffDebtMediationPage />)
    await screen.findByText('สถานะของผู้ยื่นคำขอ')

    await user.click(screen.getByRole('button', { name: /^ลูกหนี้/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    await fillStep2(user)
    await user.click(screen.getByRole('button', { name: /^หนี้นอกระบบ/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    await user.type(screen.getByPlaceholderText('ระบุชื่อเจ้าหนี้ (บุคคลหรือสถาบัน)'), 'นายทุน')
    await user.type(screen.getByPlaceholderText('เช่น ร้อยละ 5 ต่อเดือน'), 'ร้อยละ 20')
    await chooseDebtorIssue(user)
    await user.click(screen.getByRole('button', { name: 'ยื่นคำขอ' }))
    await user.click(screen.getByRole('button', { name: 'ยืนยันคำขอ' }))

    expect(
      await screen.findByText('interest_rate is required when the submitter is a debtor.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('ลงทะเบียนสำเร็จ')).not.toBeInTheDocument()
  })

  it('blocks step 2 when the phone number has no digits', async () => {
    const user = userEvent.setup()
    render(<LiffDebtMediationPage />)
    await screen.findByText('สถานะของผู้ยื่นคำขอ')

    await user.click(screen.getByRole('button', { name: /^ลูกหนี้/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    await waitFor(() => screen.getByPlaceholderText('ระบุชื่อ-นามสกุล'))
    await user.type(screen.getByPlaceholderText('ระบุชื่อ-นามสกุล'), 'สมชาย ใจดี')
    await user.type(screen.getByPlaceholderText('0xx-xxx-xxxx'), 'abcdefghij')
    await user.type(screen.getByPlaceholderText('0.00'), '20000')
    await user.selectOptions(screen.getByRole('combobox'), 'สกลนคร')
    await user.click(screen.getByRole('button', { name: /^หนี้นอกระบบ/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))

    expect(screen.getByText('เบอร์โทรไม่ถูกต้อง')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('ระบุชื่อ-นามสกุล')).toBeInTheDocument()
  })

  it('shows a Thai fallback instead of dumping a 422 array', async () => {
    stubFetch({
      submitStatus: 422,
      submitBody: {
        detail: [{ loc: ['body', 'phone_number'], msg: 'Value error', type: 'value_error' }],
      },
    })
    const user = userEvent.setup()
    render(<LiffDebtMediationPage />)
    await screen.findByText('สถานะของผู้ยื่นคำขอ')

    await user.click(screen.getByRole('button', { name: /^ลูกหนี้/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    await fillStep2(user)
    await user.click(screen.getByRole('button', { name: /^หนี้นอกระบบ/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    await user.type(screen.getByPlaceholderText('ระบุชื่อเจ้าหนี้ (บุคคลหรือสถาบัน)'), 'นายทุน')
    await user.type(screen.getByPlaceholderText('เช่น ร้อยละ 5 ต่อเดือน'), 'ร้อยละ 20')
    await chooseDebtorIssue(user)
    await user.click(screen.getByRole('button', { name: 'ยื่นคำขอ' }))
    await user.click(screen.getByRole('button', { name: 'ยืนยันคำขอ' }))

    expect(
      await screen.findByText('ไม่สามารถส่งคำขอได้ กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง'),
    ).toBeInTheDocument()
    expect(screen.queryByText('ลงทะเบียนสำเร็จ')).not.toBeInTheDocument()
    expect(screen.queryByText(/Value error/)).not.toBeInTheDocument()
  })

  it('clears path-specific fields when switching submitter mid-wizard (F02)', async () => {
    const user = userEvent.setup()
    render(<LiffDebtMediationPage />)
    await screen.findByText('สถานะของผู้ยื่นคำขอ')

    await user.click(screen.getByRole('button', { name: /^ลูกหนี้/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    await waitFor(() => screen.getByPlaceholderText('ระบุชื่อ-นามสกุล'))
    await fillStep2(user)
    await user.click(screen.getByRole('button', { name: /^หนี้นอกระบบ/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))

    await user.type(screen.getByPlaceholderText('ระบุชื่อเจ้าหนี้ (บุคคลหรือสถาบัน)'), 'นายทุนตลาดทอน')
    await user.type(screen.getByPlaceholderText('เช่น ร้อยละ 5 ต่อเดือน'), 'ร้อยละ 20 ต่อเดือน')
    await chooseDebtorIssue(user)

    await user.click(screen.getByRole('button', { name: 'กลับ' }))
    await user.click(screen.getByRole('button', { name: 'กลับ' }))
    await user.click(screen.getByRole('button', { name: /^เจ้าหนี้/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))

    expect(screen.getByText('ข้อมูลลูกหนี้')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('ระบุชื่อลูกหนี้')).toHaveValue('นายทุนตลาดทอน')

    // The debtor-path issue must be deselected after the submitter switch.
    expect(
      screen.getByRole('button', { name: 'ลูกหนี้ปฏิเสธไม่ยอมชำระหนี้' }),
    ).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: 'ลูกหนี้ปฏิเสธไม่ยอมชำระหนี้' }))
    await user.click(screen.getByRole('button', { name: 'ยื่นคำขอ' }))
    await user.click(screen.getByRole('button', { name: 'ยืนยันคำขอ' }))

    const call = fetchMock.mock.calls.find(
      ([u, init]) => String(u).includes('/liff/debt-mediation') && init?.method === 'POST',
    )
    const payload = JSON.parse(String(call![1].body))
    expect(payload.submitter_type).toBe('CREDITOR')
    expect(payload.issue_category).toBe('ลูกหนี้ปฏิเสธไม่ยอมชำระหนี้')
    expect(payload.interest_rate).toBeNull()
  })

  it('accepts dashed local phone numbers end to end (F03)', async () => {
    const user = userEvent.setup()
    render(<LiffDebtMediationPage />)
    await screen.findByText('สถานะของผู้ยื่นคำขอ')

    await user.click(screen.getByRole('button', { name: /^ลูกหนี้/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    await waitFor(() => screen.getByPlaceholderText('ระบุชื่อ-นามสกุล'))
    await fillStep2(user, '081-234-5678')
    await user.click(screen.getByRole('button', { name: /^หนี้นอกระบบ/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))

    await user.type(screen.getByPlaceholderText('ระบุชื่อเจ้าหนี้ (บุคคลหรือสถาบัน)'), 'นายทุน')
    await user.type(screen.getByPlaceholderText('เช่น ร้อยละ 5 ต่อเดือน'), 'ร้อยละ 20')
    await chooseDebtorIssue(user)
    await user.click(screen.getByRole('button', { name: 'ยื่นคำขอ' }))
    await user.click(screen.getByRole('button', { name: 'ยืนยันคำขอ' }))

    const call = fetchMock.mock.calls.find(
      ([u, init]) => String(u).includes('/liff/debt-mediation') && init?.method === 'POST',
    )
    const payload = JSON.parse(String(call![1].body))
    expect(payload.phone_number).toBe('0812345678')
  })

  it('accepts +66 international phone numbers end to end (F03)', async () => {
    const user = userEvent.setup()
    render(<LiffDebtMediationPage />)
    await screen.findByText('สถานะของผู้ยื่นคำขอ')

    await user.click(screen.getByRole('button', { name: /^ลูกหนี้/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    await waitFor(() => screen.getByPlaceholderText('ระบุชื่อ-นามสกุล'))
    await fillStep2(user, '+66812345678')
    await user.click(screen.getByRole('button', { name: /^หนี้นอกระบบ/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))

    await user.type(screen.getByPlaceholderText('ระบุชื่อเจ้าหนี้ (บุคคลหรือสถาบัน)'), 'นายทุน')
    await user.type(screen.getByPlaceholderText('เช่น ร้อยละ 5 ต่อเดือน'), 'ร้อยละ 20')
    await chooseDebtorIssue(user)
    await user.click(screen.getByRole('button', { name: 'ยื่นคำขอ' }))
    await user.click(screen.getByRole('button', { name: 'ยืนยันคำขอ' }))

    const call = fetchMock.mock.calls.find(
      ([u, init]) => String(u).includes('/liff/debt-mediation') && init?.method === 'POST',
    )
    const payload = JSON.parse(String(call![1].body))
    expect(payload.phone_number).toBe('+66812345678')
  })

  it('surfaces a Thai load error with retry when provinces fail (F04)', async () => {
    stubFetch({ provincesOk: false })
    const user = userEvent.setup()
    render(<LiffDebtMediationPage />)

    expect(
      await screen.findByText('ไม่สามารถโหลดรายชื่อจังหวัดได้ กรุณาลองใหม่'),
    ).toBeInTheDocument()
    expect(screen.getByText('โหลดไม่สำเร็จ')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'ลองใหม่' }))

    const provinceCalls = fetchMock.mock.calls.filter(([u]) =>
      String(u).includes('/locations/provinces'),
    )
    expect(provinceCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('shows the session-expired message when submit returns 401 (F06)', async () => {
    stubFetch({ submitStatus: 401 })
    const user = userEvent.setup()
    render(<LiffDebtMediationPage />)
    await screen.findByText('สถานะของผู้ยื่นคำขอ')

    await user.click(screen.getByRole('button', { name: /^ลูกหนี้/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    await waitFor(() => screen.getByPlaceholderText('ระบุชื่อ-นามสกุล'))
    await fillStep2(user)
    await user.click(screen.getByRole('button', { name: /^หนี้นอกระบบ/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    await user.type(screen.getByPlaceholderText('ระบุชื่อเจ้าหนี้ (บุคคลหรือสถาบัน)'), 'นายทุน')
    await user.type(screen.getByPlaceholderText('เช่น ร้อยละ 5 ต่อเดือน'), 'ร้อยละ 20')
    await chooseDebtorIssue(user)
    await user.click(screen.getByRole('button', { name: 'ยื่นคำขอ' }))
    await user.click(screen.getByRole('button', { name: 'ยืนยันคำขอ' }))

    expect(await screen.findByText(SESSION_EXPIRED_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText('ลงทะเบียนสำเร็จ')).not.toBeInTheDocument()
  })

  it('marks the submitter aria-pressed and reaches step 1 with labeled inputs (F08+F17)', async () => {
    const user = userEvent.setup()
    render(<LiffDebtMediationPage />)
    await screen.findByText('สถานะของผู้ยื่นคำขอ')

    await user.click(screen.getByRole('button', { name: /^ลูกหนี้/ }))
    expect(screen.getByRole('button', { name: /^ลูกหนี้/ })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    expect(screen.getByLabelText(/ชื่อ-สกุล/)).toBeInTheDocument()
  })

  it('blocks whitespace-only full name on step 1 (F11)', async () => {
    const user = userEvent.setup()
    render(<LiffDebtMediationPage />)
    await screen.findByText('สถานะของผู้ยื่นคำขอ')

    await user.click(screen.getByRole('button', { name: /^ลูกหนี้/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    await waitFor(() => screen.getByPlaceholderText('ระบุชื่อ-นามสกุล'))
    await user.type(screen.getByPlaceholderText('ระบุชื่อ-นามสกุล'), '   ')
    await user.type(screen.getByPlaceholderText('0xx-xxx-xxxx'), '0812345678')
    await user.type(screen.getByPlaceholderText('0.00'), '20000')
    await user.selectOptions(screen.getByRole('combobox'), 'สกลนคร')
    await user.click(screen.getByRole('button', { name: /^หนี้นอกระบบ/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))

    expect(screen.getByText('กรุณาระบุชื่อ-สกุล')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('ระบุชื่อ-นามสกุล')).toBeInTheDocument()
  })
})