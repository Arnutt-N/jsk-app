"use client"

import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import { Province } from '../../../types/location'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import LiffStatusBadge from '@/components/liff/LiffStatusBadge'
import { Alert } from '@/components/ui/Alert'
import {
    User,
    Wallet,
    Handshake,
    Scale,
    CheckCircle2
} from 'lucide-react'
import { logger } from '@/lib/logger';
import { useLiffInit } from '@/hooks/useLiffInit'
import { useLiffLeave } from '@/hooks/useLiffLeave'
import { LeaveConfirmDialog } from '@/components/liff/LeaveConfirmDialog'
import { LiffClearButton } from '@/components/liff/LiffClearButton'
import { LiffWizardNav } from '@/components/liff/LiffWizardNav'
import { LiffStepCard } from '@/components/liff/LiffStepCard'
import LiffStepper from '@/components/liff/LiffStepper'
import { useAutoCloseCountdown } from '@/hooks/useAutoCloseCountdown'
import { submitDebtMediation, DebtMediationPayload, formatLiffSubmitError, isValidPhone, normalizePhone } from '@/lib/liff/submit-debt-mediation'
import { composeContactName } from '@/lib/liff/validation'
import { PREFIX_OPTIONS } from '@/lib/constants/prefixes'
import { Select } from '@/components/ui/Select'

// --- FORM CONTENT (mirrors the MoJ debt-mediation registration form) ---

type SubmitterType = 'DEBTOR' | 'CREDITOR'
type DebtType = 'INFORMAL' | 'FORMAL'

const SUBMITTER_OPTIONS: Array<{ value: SubmitterType, label: string, description: string }> = [
    { value: 'DEBTOR', label: 'ลูกหนี้', description: 'ผู้เป็นหนี้ ต้องการไกล่เกลี่ยกับเจ้าหนี้' },
    { value: 'CREDITOR', label: 'เจ้าหนี้', description: 'ผู้ให้กู้ ต้องการไกล่เกลี่ยกับลูกหนี้' }
]

const DEBT_TYPE_OPTIONS: Array<{ value: DebtType, label: string, description: string }> = [
    {
        value: 'INFORMAL',
        label: 'หนี้นอกระบบ',
        description: 'หนี้กับบุคคล หรือกลุ่มบุคคลที่ไม่จดทะเบียน เช่น ตลาดทอน ญาติพี่น้อง เพื่อนฝูง สินเชื่อนอกระบบ'
    },
    {
        value: 'FORMAL',
        label: 'หนี้ในระบบ',
        description: 'สถาบันการเงินที่จดทะเบียน เช่น ธนาคาร บริษัทเงินทุน สหกรณ์ โรงรับจำนำ'
    }
]

const DEBTOR_ISSUE_OPTIONS = [
    'ค้างชำระหนี้ ถูกข่มขู่/กลั่นแกล้ง ไม่สามารถจ่ายได้',
    'ทำสัญญา/ข้อตกลงที่ลักษณะเป็นอาชญากรรม (ถูกหลอก สัญญาไม่ชอบด้วยกฎหมาย)',
    'ถูกข่มขู่/หนวกหู จากบุคคลอื่น',
    'รายได้ไม่เพียงพอจะชำระหนี้',
    'ผู้ไกล่เกลี่ยติดต่อเจ้าหนี้ไม่ได้'
]

const CREDITOR_ISSUE_OPTIONS = [
    'ลูกหนี้ไม่มีเงินจ่ายหนี้',
    'ลูกหนี้ปฏิเสธว่าไม่ได้เป็นหนี้',
    'ลูกหนี้ปฏิเสธไม่ยอมชำระหนี้',
    'ลูกหนี้หลบหนีหนี้'
]

const ISSUE_OTHER_LABEL = 'อื่น ๆ'

// --- CONSTANTS ---
const STEPS = [
    { title: 'ผู้ยื่นคำขอ', icon: <User className="w-4 h-4" /> },
    { title: 'ข้อมูลหนี้', icon: <Wallet className="w-4 h-4" /> },
    { title: 'คู่กรณี', icon: <Handshake className="w-4 h-4" /> }
]

const INITIAL_FORM_DATA = {
    submitter_type: '' as SubmitterType | '',
    prefix: '',
    firstname: '',
    lastname: '',
    phone_number: '',
    province: '',
    sub_district: '',
    debt_amount: '',
    debt_type: '' as DebtType | '',
    counterparty_name: '',
    interest_rate: '',
    issue_category: '',
    issue_other: ''
}

const inputBaseClass =
    'w-full bg-white border text-gray-900 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 outline-none transition-all'

const getLiff = () => (typeof window !== 'undefined' ? window.liff : undefined)

export default function LiffDebtMediation() {
    const [step, setStep] = useState(0)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const { leaveOpen, requestLeave, cancelLeave, confirmLeave } = useLiffLeave()
    const [provinces, setProvinces] = useState<Province[]>([])
    type ProvinceLoad = 'loading' | 'ok' | 'failed'
    const [provinceLoad, setProvinceLoad] = useState<ProvinceLoad>('loading')

    const { profile, idToken, isInLineApp, setIsInLineApp } = useLiffInit({
        getLiff: () => getLiff(),
        requireLiffId: true,
        redirectLogin: true,
        trackInLineApp: true
    })

    // --- PROVINCES (initial load via the Next.js rewrite proxy) ---
    const loadProvinces = useCallback(async () => {
        setProvinceLoad('loading')
        try {
            const res = await fetch(`/api/v1/locations/provinces`)
            if (!res.ok) {
                throw new Error(`Failed to load provinces: ${res.status} ${res.statusText}`)
            }
            const data: unknown = await res.json()
            if (!Array.isArray(data)) {
                throw new Error('Invalid provinces payload')
            }
            setProvinces(data as Province[])
            setProvinceLoad('ok')
            setError(null)
        } catch (err: unknown) {
            logger.error('Provinces fetch error:', err)
            setProvinces([])
            setProvinceLoad('failed')
            setError('ไม่สามารถโหลดรายชื่อจังหวัดได้ กรุณาลองใหม่')
        }
    }, [])

    useEffect(() => {
        void loadProvinces()
    }, [loadProvinces])

    const [formData, setFormData] = useState(INITIAL_FORM_DATA)

    const isDebtor = formData.submitter_type === 'DEBTOR'
    const issueOptions = isDebtor ? DEBTOR_ISSUE_OPTIONS : CREDITOR_ISSUE_OPTIONS

    // --- HANDLERS ---

    const setField = (name: string, value: string) => {
        setFormData(prev => ({ ...prev, [name]: value }))
        if (fieldErrors[name]) {
            setFieldErrors(prev => {
                const next = { ...prev }
                delete next[name]
                return next
            })
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setField(e.target.name, e.target.value)
    }

    const blank = (s: string) => !s.trim()

    const validateStep = (currentStep: number): boolean => {
        const errors: Record<string, string> = {}

        switch (currentStep) {
            case 0: // Submitter
                if (!formData.submitter_type) errors.submitter_type = 'กรุณาเลือกสถานะผู้ยื่นคำขอ'
                break
            case 1: // Debt info
                if (blank(formData.prefix)) errors.prefix = 'กรุณาเลือกคำนำหน้า'
                if (blank(formData.firstname)) errors.firstname = 'กรุณาระบุชื่อ'
                if (blank(formData.lastname)) errors.lastname = 'กรุณาระบุนามสกุล'
                if (blank(formData.phone_number)) errors.phone_number = 'กรุณาระบุหมายเลขโทรศัพท์'
                else if (!isValidPhone(formData.phone_number)) errors.phone_number = 'หมายเลขโทรศัพท์ไม่ถูกต้อง'
                if (blank(formData.province)) errors.province = 'กรุณาเลือกจังหวัดที่อาศัย'
                if (!formData.debt_amount || Number(formData.debt_amount) <= 0) errors.debt_amount = 'กรุณาระบุยอดหนี้สิน'
                if (!formData.debt_type) errors.debt_type = 'กรุณาเลือกประเภทหนี้'
                break
            case 2: // Counterparty
                if (blank(formData.counterparty_name)) errors.counterparty_name = isDebtor ? 'กรุณาระบุชื่อเจ้าหนี้' : 'กรุณาระบุชื่อลูกหนี้'
                if (isDebtor && blank(formData.interest_rate)) errors.interest_rate = 'กรุณาระบุอัตราดอกเบี้ย'
                if (blank(formData.issue_category)) errors.issue_category = 'กรุณาเลือกประเด็นความเดือดร้อน'
                else if (formData.issue_category === ISSUE_OTHER_LABEL && blank(formData.issue_other)) errors.issue_other = 'กรุณาระบุ'
                break
        }

        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors)
            setError('กรุณากรอกข้อมูลในช่องขอบสีแดงให้ครบถ้วน')
            return false
        }

        setFieldErrors({})
        setError(null)
        return true
    }

    const nextStep = () => {
        if (validateStep(step)) {
            setStep(s => Math.min(s + 1, STEPS.length - 1))
            window.scrollTo(0, 0)
        }
    }

    const prevStep = () => {
        setError(null)
        setStep(s => Math.max(s - 1, 0))
    }

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (step !== STEPS.length - 1) return
        if (validateStep(step)) {
            setShowConfirm(true)
        }
    }

    const buildPayload = (): DebtMediationPayload => ({
        submitter_type: formData.submitter_type as SubmitterType,
        prefix: formData.prefix.trim(),
        firstname: formData.firstname.trim(),
        lastname: formData.lastname.trim(),
        full_name: composeContactName({
            prefix: formData.prefix,
            firstname: formData.firstname,
            lastname: formData.lastname,
        }),
        phone_number: normalizePhone(formData.phone_number),
        province: formData.province.trim(),
        sub_district: formData.sub_district.trim() || null,
        debt_amount: formData.debt_amount,
        debt_type: formData.debt_type as DebtType,
        counterparty_name: formData.counterparty_name.trim(),
        interest_rate: isDebtor ? (formData.interest_rate.trim() || null) : null,
        issue_category: formData.issue_category.trim(),
        issue_other: formData.issue_category === ISSUE_OTHER_LABEL
            ? (formData.issue_other.trim() || null)
            : null,
        line_user_id: profile?.userId || null,
    })

    const submitData = async () => {
        setSubmitting(true)
        setError(null)

        try {
            const res = await submitDebtMediation(buildPayload(), idToken)

            const resText = await res.text()
            let data: unknown
            try {
                data = JSON.parse(resText)
            } catch {
                throw new Error(resText || `Server Error: ${res.status} ${res.statusText}`)
            }

            if (!res.ok) {
                throw new Error(formatLiffSubmitError(data))
            }

            setSuccess(true)
            setShowConfirm(false)
            window.scrollTo(0, 0)
            try { setIsInLineApp(getLiff()?.isInClient() ?? false) } catch { /* not in LINE */ }
        } catch (err: unknown) {
            logger.error('Submit Error:', err)
            setError(err instanceof Error ? err.message : 'ไม่สามารถส่งคำขอได้ กรุณาลองอีกครั้ง')
            setShowConfirm(false)
            window.scrollTo(0, 0)
        } finally {
            setSubmitting(false)
        }
    }

    const clearStep = () => {
        if (step === 0) {
            setFormData(prev => ({ ...prev, submitter_type: '' }))
        } else if (step === 1) {
            setFormData(prev => ({ ...prev, prefix: '', firstname: '', lastname: '', phone_number: '', province: '', sub_district: '', debt_amount: '', debt_type: '' }))
        } else if (step === 2) {
            setFormData(prev => ({ ...prev, counterparty_name: '', interest_rate: '', issue_category: '', issue_other: '' }))
        }
        setFieldErrors({})
        setError(null)
    }

    const resetForm = () => {
        setStep(0)
        setFormData({ ...INITIAL_FORM_DATA })
        setFieldErrors({})
        setError(null)
        setShowConfirm(false)
        setSuccess(false)
        resetCountdown()
        window.scrollTo(0, 0)
    }

    const handleClose = () => {
        try {
            getLiff()?.closeWindow()
        } catch (e) {
            logger.error('Close window failed:', e)
        }
    }

    const { timeLeft, resetCountdown } = useAutoCloseCountdown(success && isInLineApp, handleClose)

    if (success) {
        return (
            <div className="min-h-screen p-6 bg-bg flex items-center justify-center">
                <Card glass className="max-w-sm w-full text-center py-8">
                    <CardContent>
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle2 className="w-10 h-10 text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">ลงทะเบียนสำเร็จ</h2>
                        <p className="text-gray-500 mb-6">
                            เจ้าหน้าที่ได้รับความประสงค์<br />
                            การไกล่เกลี่ยหนี้ของท่านแล้ว<br />
                            เราจะติดต่อกลับโดยเร็วที่สุด
                        </p>

                        {isInLineApp ? (
                            <>
                                <p className="text-xs text-gray-400 mb-4">
                                    (ปิดหน้าต่างอัตโนมัติใน {timeLeft} วินาที)
                                </p>
                                <Button
                                    variant="primary"
                                    className="w-full py-4 text-lg"
                                    onClick={handleClose}
                                >
                                    ปิดหน้าต่าง
                                </Button>
                            </>
                        ) : (
                            <>
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                                    <p className="text-amber-700 text-sm font-medium">
                                        📱 หากต้องการติดตามสถานะ<br />
                                        กรุณาพิมพ์ <strong>&quot;ติดตาม&quot;</strong> ใน LINE OA
                                    </p>
                                </div>
                                <Button
                                    variant="primary"
                                    className="w-full py-4 text-lg mb-3"
                                    onClick={resetForm}
                                >
                                    ลงทะเบียนคำขอใหม่
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="w-full"
                                    onClick={() => { window.location.href = '/' }}
                                >
                                    กลับหน้าหลัก
                                </Button>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-bg pb-20 font-sans">
            <Head>
                <title>ขอแก้หนี้ - JSK 4.0</title>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>

            {/* Header */}
            <div className="sticky top-0 z-50 bg-white/70 backdrop-blur-md border-b border-gray-200/50 px-4 py-4 mb-6">
                <div className="max-w-lg mx-auto flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <Scale className="w-5 h-5 text-primary" />
                            <h1 className="text-lg font-bold text-gray-900 tracking-tight">ขอแก้หนี้</h1>
                        </div>
                        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                            แจ้งความประสงค์ไกล่เกลี่ยหนี้ • JSK 4.0 Platform
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <LiffStatusBadge
                            kind="connectivity"
                            state={provinceLoad === 'ok' ? 'online' : provinceLoad === 'failed' ? 'offline' : 'loading'}
                        />
                        {provinceLoad === 'failed' && (
                            <Button type="button" variant="outline" size="sm" onClick={() => void loadProvinces()}>
                                ลองใหม่
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            <main className="px-4 max-w-lg mx-auto">
                <LiffStepper
                    steps={STEPS.map((s) => ({ label: s.title, icon: s.icon }))}
                    currentIndex={step}
                    ariaLabel="ขั้นตอนขอแก้หนี้"
                />

                <form onSubmit={handleFormSubmit} className="liff-form space-y-6">
                    {error && (
                        <Alert variant="danger" title="เกิดข้อผิดพลาด">
                            {error}
                        </Alert>
                    )}

                    <LiffStepCard
                        icon={STEPS[step].icon}
                        title={step === 2 && formData.submitter_type ? (isDebtor ? 'ข้อมูลเจ้าหนี้' : 'ข้อมูลลูกหนี้') : STEPS[step].title}
                        action={<LiffClearButton onClear={clearStep} />}
                    >
                            {step === 0 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                                        สถานะของผู้ยื่นคำขอ <span className="text-red-500">*</span>
                                    </p>
                                    <div className="grid grid-cols-1 gap-3">
                                        {SUBMITTER_OPTIONS.map(opt => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                aria-pressed={formData.submitter_type === opt.value}
                                                onClick={() => {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        submitter_type: opt.value,
                                                        issue_category: '',
                                                        issue_other: '',
                                                        interest_rate: '',
                                                    }))
                                                    setFieldErrors(prev => {
                                                        const next = { ...prev }
                                                        delete next.submitter_type
                                                        delete next.issue_category
                                                        delete next.issue_other
                                                        delete next.interest_rate
                                                        return next
                                                    })
                                                }}
                                                className={`text-left p-4 rounded-xl border-2 transition-all active:scale-[0.99] ${formData.submitter_type === opt.value
                                                    ? 'border-primary bg-primary/5 shadow-sm'
                                                    : 'border-gray-200 bg-white hover:border-gray-300'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${formData.submitter_type === opt.value ? 'border-primary' : 'border-gray-300'}`}>
                                                        {formData.submitter_type === opt.value && <span className="w-2 h-2 rounded-full bg-primary" />}
                                                    </span>
                                                    <span className="font-bold text-gray-900">{opt.label}</span>
                                                </div>
                                                <p className={`text-xs ml-6 ${formData.submitter_type === opt.value ? 'text-primary' : 'text-gray-500'}`}>
                                                    {opt.description}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                    {fieldErrors.submitter_type && <p className="text-red-500 text-[10px]">{fieldErrors.submitter_type}</p>}
                                </div>
                            )}

                            {step === 1 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="col-span-1">
                                            <label htmlFor="dm-prefix" className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                                คำนำหน้า <span className="text-red-500">*</span>
                                            </label>
                                            <Select
                                                id="dm-prefix"
                                                name="prefix"
                                                value={formData.prefix}
                                                onChange={handleChange}
                                                aria-invalid={Boolean(fieldErrors.prefix) || undefined}
                                                aria-describedby={fieldErrors.prefix ? 'dm-prefix-err' : undefined}
                                                options={PREFIX_OPTIONS}
                                                placeholder="เลือก"
                                                state={fieldErrors.prefix ? 'error' : 'default'}
                                                required
                                            />
                                            {fieldErrors.prefix && <p id="dm-prefix-err" className="text-red-500 text-[10px] mt-1">{fieldErrors.prefix}</p>}
                                        </div>
                                        <div className="col-span-2">
                                            <label htmlFor="dm-firstname" className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                                ชื่อ <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                id="dm-firstname"
                                                type="text"
                                                name="firstname"
                                                value={formData.firstname}
                                                onChange={handleChange}
                                                maxLength={100}
                                                aria-invalid={Boolean(fieldErrors.firstname) || undefined}
                                                aria-describedby={fieldErrors.firstname ? 'dm-firstname-err' : undefined}
                                                className={`${inputBaseClass} ${fieldErrors.firstname ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'}`}
                                                placeholder="ระบุชื่อจริง"
                                                required
                                            />
                                            {fieldErrors.firstname && <p id="dm-firstname-err" className="text-red-500 text-[10px] mt-1">{fieldErrors.firstname}</p>}
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="dm-lastname" className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                            นามสกุล <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            id="dm-lastname"
                                            type="text"
                                            name="lastname"
                                            value={formData.lastname}
                                            onChange={handleChange}
                                            maxLength={100}
                                            aria-invalid={Boolean(fieldErrors.lastname) || undefined}
                                            aria-describedby={fieldErrors.lastname ? 'dm-lastname-err' : undefined}
                                            className={`${inputBaseClass} ${fieldErrors.lastname ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'}`}
                                            placeholder="ระบุนามสกุล"
                                            required
                                        />
                                        {fieldErrors.lastname && <p id="dm-lastname-err" className="text-red-500 text-[10px] mt-1">{fieldErrors.lastname}</p>}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="dm-phone" className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                                หมายเลขโทรศัพท์ <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                id="dm-phone"
                                                type="tel"
                                                name="phone_number"
                                                value={formData.phone_number}
                                                onChange={handleChange}
                                                maxLength={20}
                                                aria-invalid={Boolean(fieldErrors.phone_number) || undefined}
                                                aria-describedby={fieldErrors.phone_number ? 'dm-phone-err' : undefined}
                                                className={`${inputBaseClass} ${fieldErrors.phone_number ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'}`}
                                                placeholder="0xx-xxx-xxxx"
                                                required
                                            />
                                            {fieldErrors.phone_number && <p id="dm-phone-err" className="text-red-500 text-[10px] mt-1">{fieldErrors.phone_number}</p>}
                                        </div>
                                        <div>
                                            <label htmlFor="dm-amount" className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                                ยอดหนี้สิน (บาท) <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                id="dm-amount"
                                                type="number"
                                                name="debt_amount"
                                                value={formData.debt_amount}
                                                onChange={handleChange}
                                                max="999999999999.99"
                                                aria-invalid={Boolean(fieldErrors.debt_amount) || undefined}
                                                aria-describedby={fieldErrors.debt_amount ? 'dm-amount-err' : undefined}
                                                className={`${inputBaseClass} ${fieldErrors.debt_amount ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'}`}
                                                placeholder="0.00"
                                                min="0"
                                                step="0.01"
                                                required
                                            />
                                            {fieldErrors.debt_amount && <p id="dm-amount-err" className="text-red-500 text-[10px] mt-1">{fieldErrors.debt_amount}</p>}
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="dm-province" className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                            จังหวัดที่อาศัย <span className="text-red-500">*</span>
                                        </label>
                                        <Select
                                            id="dm-province"
                                            name="province"
                                            value={formData.province}
                                            onChange={handleChange}
                                            aria-invalid={Boolean(fieldErrors.province) || undefined}
                                            aria-describedby={fieldErrors.province ? 'dm-province-err' : undefined}
                                            options={provinces.map((p) => ({
                                                value: p.PROVINCE_THAI,
                                                label: p.PROVINCE_THAI,
                                            }))}
                                            placeholder="-- เลือกจังหวัด --"
                                            state={fieldErrors.province ? 'error' : 'default'}
                                            required
                                        />
                                        {fieldErrors.province && <p id="dm-province-err" className="text-red-500 text-[10px] mt-1">{fieldErrors.province}</p>}
                                    </div>

                                    <div>
                                        <label htmlFor="dm-subdistrict" className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                            ตำบลที่อาศัย
                                        </label>
                                        <input
                                            id="dm-subdistrict"
                                            type="text"
                                            name="sub_district"
                                            value={formData.sub_district}
                                            onChange={handleChange}
                                            maxLength={100}
                                            className={`${inputBaseClass} border-gray-200`}
                                            placeholder="ระบุตำบล (ถ้ามี)"
                                        />
                                    </div>

                                    <div>
                                        <p className="text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                            ประเภทหนี้ <span className="text-red-500">*</span>
                                        </p>
                                        <div className="grid grid-cols-1 gap-3">
                                            {DEBT_TYPE_OPTIONS.map(opt => (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    aria-pressed={formData.debt_type === opt.value}
                                                    onClick={() => setField('debt_type', opt.value)}
                                                    className={`text-left p-4 rounded-xl border-2 transition-all active:scale-[0.99] ${formData.debt_type === opt.value
                                                        ? 'border-primary bg-primary/5 shadow-sm'
                                                        : 'border-gray-200 bg-white hover:border-gray-300'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${formData.debt_type === opt.value ? 'border-primary' : 'border-gray-300'}`}>
                                                            {formData.debt_type === opt.value && <span className="w-2 h-2 rounded-full bg-primary" />}
                                                        </span>
                                                        <span className="font-bold text-gray-900">{opt.label}</span>
                                                    </div>
                                                    <p className={`text-xs ml-6 leading-relaxed ${formData.debt_type === opt.value ? 'text-primary' : 'text-gray-500'}`}>
                                                        {opt.description}
                                                    </p>
                                                </button>
                                            ))}
                                        </div>
                                        {fieldErrors.debt_type && <p className="text-red-500 text-[10px]">{fieldErrors.debt_type}</p>}
                                    </div>
                                </div>
                            )}

                            {step === 2 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div>
                                        <label htmlFor="dm-counterparty" className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                            {isDebtor ? 'ชื่อเจ้าหนี้' : 'ชื่อลูกหนี้'} <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            id="dm-counterparty"
                                            type="text"
                                            name="counterparty_name"
                                            value={formData.counterparty_name}
                                            onChange={handleChange}
                                            maxLength={200}
                                            aria-invalid={Boolean(fieldErrors.counterparty_name) || undefined}
                                            aria-describedby={fieldErrors.counterparty_name ? 'dm-counterparty-err' : undefined}
                                            className={`${inputBaseClass} ${fieldErrors.counterparty_name ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'}`}
                                            placeholder={isDebtor ? 'ระบุชื่อเจ้าหนี้ (บุคคลหรือสถาบัน)' : 'ระบุชื่อลูกหนี้'}
                                            required
                                        />
                                        {fieldErrors.counterparty_name && <p id="dm-counterparty-err" className="text-red-500 text-[10px] mt-1">{fieldErrors.counterparty_name}</p>}
                                    </div>

                                    {isDebtor && (
                                        <div className="animate-in slide-in-from-top-2">
                                            <label htmlFor="dm-interest" className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                                อัตราดอกเบี้ย <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                id="dm-interest"
                                                type="text"
                                                name="interest_rate"
                                                value={formData.interest_rate}
                                                onChange={handleChange}
                                                maxLength={80}
                                                aria-invalid={Boolean(fieldErrors.interest_rate) || undefined}
                                                aria-describedby={fieldErrors.interest_rate ? 'dm-interest-err' : undefined}
                                                className={`${inputBaseClass} ${fieldErrors.interest_rate ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'}`}
                                                placeholder="เช่น ร้อยละ 5 ต่อเดือน"
                                                required
                                            />
                                            {fieldErrors.interest_rate && <p id="dm-interest-err" className="text-red-500 text-[10px] mt-1">{fieldErrors.interest_rate}</p>}
                                        </div>
                                    )}

                                    <div>
                                        <p className="text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                            ประเด็นความเดือดร้อน <span className="text-red-500">*</span>
                                        </p>
                                        <div className="grid grid-cols-1 gap-2">
                                            {issueOptions.map(opt => (
                                                <button
                                                    key={opt}
                                                    type="button"
                                                    aria-pressed={formData.issue_category === opt}
                                                    onClick={() => setField('issue_category', opt)}
                                                    className={`text-left px-4 py-3 rounded-xl border-2 transition-all active:scale-[0.99] text-sm font-medium ${formData.issue_category === opt
                                                        ? 'border-primary bg-primary/5 text-primary'
                                                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                                        }`}
                                                >
                                                    {opt}
                                                </button>
                                            ))}
                                            <button
                                                type="button"
                                                aria-pressed={formData.issue_category === ISSUE_OTHER_LABEL}
                                                onClick={() => setField('issue_category', ISSUE_OTHER_LABEL)}
                                                className={`text-left px-4 py-3 rounded-xl border-2 transition-all active:scale-[0.99] text-sm font-medium ${formData.issue_category === ISSUE_OTHER_LABEL
                                                    ? 'border-primary bg-primary/5 text-primary'
                                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                                    }`}
                                            >
                                                อื่น ๆ
                                            </button>
                                        </div>
                                        {fieldErrors.issue_category && <p className="text-red-500 text-[10px]">{fieldErrors.issue_category}</p>}

                                        {formData.issue_category === ISSUE_OTHER_LABEL && (
                                            <div className="mt-3 animate-in slide-in-from-top-2">
                                                <label htmlFor="dm-issue-other" className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                                    ระบุประเด็น <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    id="dm-issue-other"
                                                    type="text"
                                                    name="issue_other"
                                                    value={formData.issue_other}
                                                    onChange={handleChange}
                                                    maxLength={500}
                                                    aria-invalid={Boolean(fieldErrors.issue_other) || undefined}
                                                    aria-describedby={fieldErrors.issue_other ? 'dm-issue-other-err' : undefined}
                                                    className={`${inputBaseClass} ${fieldErrors.issue_other ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'}`}
                                                    placeholder="ระบุประเด็นความเดือดร้อน"
                                                    required
                                                />
                                                {fieldErrors.issue_other && <p id="dm-issue-other-err" className="text-red-500 text-[10px] mt-1">{fieldErrors.issue_other}</p>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </LiffStepCard>

                    <div className="pt-8 border-t border-gray-100 flex flex-col gap-3">
                        <LiffWizardNav
                            onCancel={requestLeave}
                            back={step > 0 ? { label: 'กลับ', onClick: prevStep } : undefined}
                            next={step < STEPS.length - 1 ? { label: 'ถัดไป', onClick: nextStep } : undefined}
                            submit={step === STEPS.length - 1 ? { label: 'ยื่นคำขอ', onClick: () => { if (validateStep(step)) setShowConfirm(true) }, disabled: submitting } : undefined}
                        />

                        <p className="text-center text-[10px] text-gray-600 dark:text-gray-400 mt-4 px-4 leading-relaxed">
                            ข้อมูลของท่านจะถูกใช้เพื่อการวิเคราะห์และดำเนินการให้ความช่วยเหลือโดยบุคลากรของรัฐที่เกี่ยวข้องเท่านั้น ภายใต้กฎหมายคุ้มครองข้อมูลส่วนบุคคล (PDPA)
                        </p>
                    </div>
                </form>

                {/* Confirmation Modal */}
                {showConfirm && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
                        <Card className="w-full max-w-sm shadow-2xl">
                            <CardHeader className="text-center pb-2">
                                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
                                    <Handshake className="w-6 h-6" />
                                </div>
                                <CardTitle id="confirm-dialog-title" className="text-lg">ยืนยันการลงทะเบียนขอแก้หนี้</CardTitle>
                            </CardHeader>
                            <CardContent className="text-center space-y-4">
                                <p className="text-sm text-gray-500">
                                    กรุณาตรวจสอบข้อมูลให้ถูกต้อง<br />
                                    เมื่อกดส่งแล้วเจ้าหน้าที่จะได้รับคำขอทันที
                                </p>
                                <div className="flex gap-3 pt-2">
                                    <Button
                                        variant="ghost"
                                        className="flex-1"
                                        onClick={() => setShowConfirm(false)}
                                    >
                                        ยกเลิก
                                    </Button>
                                    <Button
                                        variant="primary"
                                        className="flex-1"
                                        onClick={submitData}
                                        isLoading={submitting}
                                    >
                                        ยืนยันคำขอ
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                <LeaveConfirmDialog
                    isOpen={leaveOpen}
                    isInLineApp={isInLineApp}
                    onClose={cancelLeave}
                    onConfirm={confirmLeave}
                />
            </main>
        </div>
    )
}