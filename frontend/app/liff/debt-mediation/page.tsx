"use client"

import { useState, useEffect } from 'react'
import Head from 'next/head'
import { Province } from '../../../types/location'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Alert'
import {
    User,
    Wallet,
    Handshake,
    Scale,
    CheckCircle2,
    ChevronRight,
    ChevronLeft,
    AlertTriangle,
    X
} from 'lucide-react'
import { logger } from '@/lib/logger';
import { useLiffInit } from '@/hooks/useLiffInit'
import { useAutoCloseCountdown } from '@/hooks/useAutoCloseCountdown'
import { submitDebtMediation, DebtMediationPayload, formatLiffSubmitError, isValidPhone, normalizePhone } from '@/lib/liff/submit-debt-mediation'

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
    full_name: '',
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
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
    const [provinces, setProvinces] = useState<Province[]>([])

    const { profile, idToken, isInLineApp, setIsInLineApp } = useLiffInit({
        getLiff: () => getLiff(),
        requireLiffId: true,
        redirectLogin: true,
        trackInLineApp: true
    })

    // --- PROVINCES (initial load via the Next.js rewrite proxy) ---
    useEffect(() => {
        const fetchProvinces = async () => {
            try {
                const res = await fetch(`/api/v1/locations/provinces`)
                if (!res.ok) {
                    throw new Error(`Failed to load provinces: ${res.status} ${res.statusText}`)
                }
                const data = await res.json()
                setProvinces(data)
            } catch (err: unknown) {
                logger.error('Provinces fetch error:', err)
            }
        }
        fetchProvinces()
    }, [])

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

    const validateStep = (currentStep: number): boolean => {
        const errors: Record<string, string> = {}

        switch (currentStep) {
            case 0: // Submitter
                if (!formData.submitter_type) errors.submitter_type = 'กรุณาเลือกสถานะผู้ยื่นคำขอ'
                break
            case 1: // Debt info
                if (!formData.full_name) errors.full_name = 'กรุณาระบุชื่อ-สกุล'
                if (!formData.phone_number) errors.phone_number = 'กรุณาระบุหมายเลขโทรศัพท์'
                else if (!isValidPhone(formData.phone_number)) errors.phone_number = 'เบอร์โทรไม่ถูกต้อง'
                if (!formData.province) errors.province = 'กรุณาเลือกจังหวัดที่อาศัย'
                if (!formData.debt_amount || Number(formData.debt_amount) <= 0) errors.debt_amount = 'กรุณาระบุยอดหนี้สิน'
                if (!formData.debt_type) errors.debt_type = 'กรุณาเลือกประเภทหนี้'
                break
            case 2: // Counterparty
                if (!formData.counterparty_name) errors.counterparty_name = isDebtor ? 'กรุณาระบุชื่อเจ้าหนี้' : 'กรุณาระบุชื่อลูกหนี้'
                if (isDebtor && !formData.interest_rate) errors.interest_rate = 'กรุณาระบุอัตราดอกเบี้ย'
                if (!formData.issue_category) errors.issue_category = 'กรุณาเลือกประเด็นความเดือดร้อน'
                else if (formData.issue_category === ISSUE_OTHER_LABEL && !formData.issue_other) errors.issue_other = 'กรุณาระบุ'
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
        full_name: formData.full_name,
        phone_number: normalizePhone(formData.phone_number),
        province: formData.province,
        sub_district: formData.sub_district || null,
        debt_amount: formData.debt_amount,
        debt_type: formData.debt_type as DebtType,
        counterparty_name: formData.counterparty_name,
        interest_rate: isDebtor ? formData.interest_rate || null : null,
        issue_category: formData.issue_category,
        issue_other: formData.issue_category === ISSUE_OTHER_LABEL ? formData.issue_other || null : null,
        line_user_id: profile?.userId || null
    })

    const submitData = async () => {
        setSubmitting(true)
        setError(null)

        try {
            const res = await submitDebtMediation(buildPayload(), idToken)

            const resText = await res.text()
            let data
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
            setFormData(prev => ({ ...prev, full_name: '', phone_number: '', province: '', sub_district: '', debt_amount: '', debt_type: '' }))
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

    const requestCancel = () => {
        setShowLeaveConfirm(true)
    }

    const confirmLeave = () => {
        setShowLeaveConfirm(false)
        if (getLiff()?.isInClient()) {
            handleClose()
        } else {
            window.location.href = '/'
        }
    }

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
                        <Badge variant={provinces.length > 0 ? "success" : "warning"} className="h-6">
                            {provinces.length > 0 ? "Online" : "Connecting..."}
                        </Badge>
                    </div>
                </div>
            </div>

            <main className="px-4 max-w-lg mx-auto">
                {/* Progress Steps */}
                <div className="mb-8 flex justify-between items-center px-2">
                    {STEPS.map((s, idx) => (
                        <div key={idx} className="flex flex-col items-center gap-2 relative flex-1">
                            <div className={`
                                w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold z-10 transition-all duration-300
                                ${idx <= step ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-gray-200 text-gray-500'}
                            `}>
                                {idx < step ? <CheckCircle2 className="w-5 h-5" /> : s.icon}
                            </div>
                            <span className={`text-[10px] font-semibold ${idx <= step ? 'text-primary' : 'text-gray-400'}`}>
                                {s.title}
                            </span>
                            {idx < STEPS.length - 1 && (
                                <div className={`absolute left-[60%] top-4 w-full h-[2px] -z-0 ${idx < step ? 'bg-primary' : 'bg-gray-200'}`} />
                            )}
                        </div>
                    ))}
                </div>

                <form onSubmit={handleFormSubmit} className="liff-form space-y-6">
                    {error && (
                        <Alert variant="danger" title="เกิดข้อผิดพลาด">
                            {error}
                        </Alert>
                    )}

                    <Card glass className="overflow-hidden">
                        <CardHeader className="bg-gray-50/50 border-b border-gray-100">
                            <div className="flex items-center justify-between gap-2">
                                <CardTitle className="text-base flex items-center gap-2">
                                    {STEPS[step].icon}{' '}
                                    {step === 2 && formData.submitter_type
                                        ? (isDebtor ? 'ข้อมูลเจ้าหนี้' : 'ข้อมูลลูกหนี้')
                                        : STEPS[step].title}
                                </CardTitle>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={clearStep}
                                    className="h-7 px-2 text-xs text-gray-500 dark:text-gray-400 shrink-0"
                                >
                                    ล้างค่า
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6">
                            {/* Step 1: Submitter */}
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
                                                onClick={() => setField('submitter_type', opt.value)}
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

                            {/* Step 2: Submitter info + debt */}
                            {step === 1 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                            ชื่อ-สกุล <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            name="full_name"
                                            value={formData.full_name}
                                            onChange={handleChange}
                                            className={`${inputBaseClass} ${fieldErrors.full_name ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'}`}
                                            placeholder="ระบุชื่อ-นามสกุล"
                                            required
                                        />
                                        {fieldErrors.full_name && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.full_name}</p>}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                                หมายเลขโทรศัพท์ <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="tel"
                                                name="phone_number"
                                                value={formData.phone_number}
                                                onChange={handleChange}
                                                className={`${inputBaseClass} ${fieldErrors.phone_number ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'}`}
                                                placeholder="0xx-xxx-xxxx"
                                                maxLength={10}
                                                required
                                            />
                                            {fieldErrors.phone_number && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.phone_number}</p>}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                                ยอดหนี้สิน (บาท) <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="number"
                                                name="debt_amount"
                                                value={formData.debt_amount}
                                                onChange={handleChange}
                                                className={`${inputBaseClass} ${fieldErrors.debt_amount ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'}`}
                                                placeholder="0.00"
                                                min="0"
                                                step="0.01"
                                                required
                                            />
                                            {fieldErrors.debt_amount && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.debt_amount}</p>}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                            จังหวัดที่อาศัย <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            name="province"
                                            value={formData.province}
                                            onChange={handleChange}
                                            className={`${inputBaseClass} ${fieldErrors.province ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'}`}
                                            required
                                        >
                                            <option value="">-- เลือกจังหวัด --</option>
                                            {provinces.map(p => (
                                                <option key={p.PROVINCE_ID} value={p.PROVINCE_THAI}>
                                                    {p.PROVINCE_THAI}
                                                </option>
                                            ))}
                                        </select>
                                        {fieldErrors.province && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.province}</p>}
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                            ตำบลที่อาศัย
                                        </label>
                                        <input
                                            type="text"
                                            name="sub_district"
                                            value={formData.sub_district}
                                            onChange={handleChange}
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

                            {/* Step 3: Counterparty */}
                            {step === 2 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                            {isDebtor ? 'ชื่อเจ้าหนี้' : 'ชื่อลูกหนี้'} <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            name="counterparty_name"
                                            value={formData.counterparty_name}
                                            onChange={handleChange}
                                            className={`${inputBaseClass} ${fieldErrors.counterparty_name ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'}`}
                                            placeholder={isDebtor ? 'ระบุชื่อเจ้าหนี้ (บุคคลหรือสถาบัน)' : 'ระบุชื่อลูกหนี้'}
                                            required
                                        />
                                        {fieldErrors.counterparty_name && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.counterparty_name}</p>}
                                    </div>

                                    {isDebtor && (
                                        <div className="animate-in slide-in-from-top-2">
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                                อัตราดอกเบี้ย <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                name="interest_rate"
                                                value={formData.interest_rate}
                                                onChange={handleChange}
                                                className={`${inputBaseClass} ${fieldErrors.interest_rate ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'}`}
                                                placeholder="เช่น ร้อยละ 5 ต่อเดือน"
                                                required
                                            />
                                            {fieldErrors.interest_rate && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.interest_rate}</p>}
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
                                                <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                                    ระบุประเด็น <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    name="issue_other"
                                                    value={formData.issue_other}
                                                    onChange={handleChange}
                                                    className={`${inputBaseClass} ${fieldErrors.issue_other ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'}`}
                                                    placeholder="ระบุประเด็นความเดือดร้อน"
                                                    required
                                                />
                                                {fieldErrors.issue_other && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.issue_other}</p>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Navigation Buttons */}
                    <div className="pt-8 border-t border-gray-100 flex flex-col gap-3">
                        <div className="flex gap-3 w-full">
                            {step > 0 && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1 py-3 h-auto"
                                    onClick={prevStep}
                                    leftIcon={<ChevronLeft className="w-4 h-4" />}
                                >
                                    กลับ
                                </Button>
                            )}

                            {step < STEPS.length - 1 ? (
                                <Button
                                    type="button"
                                    variant="primary"
                                    className="flex-[2] py-3 h-auto"
                                    onClick={nextStep}
                                    rightIcon={<ChevronRight className="w-4 h-4" />}
                                >
                                    ถัดไป
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    variant="primary"
                                    onClick={() => {
                                        if (validateStep(step)) setShowConfirm(true)
                                    }}
                                    disabled={submitting}
                                    className="flex-[2] py-3 h-auto font-bold"
                                >
                                    ยื่นคำขอ
                                </Button>
                            )}
                        </div>

                        <Button
                            type="button"
                            variant="ghost"
                            className="w-full py-2 h-auto text-xs text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium"
                            onClick={requestCancel}
                            leftIcon={<X className="w-3.5 h-3.5" />}
                        >
                            ยกเลิกรายการ
                        </Button>

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

                {/* Leave / cancel confirmation */}
                {showLeaveConfirm && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="cancel-dialog-title">
                        <Card className="w-full max-w-sm shadow-2xl">
                            <CardHeader className="text-center pb-2">
                                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                                    <AlertTriangle className="w-6 h-6" />
                                </div>
                                <CardTitle id="cancel-dialog-title" className="text-lg">
                                    {isInLineApp ? 'ปิดแบบฟอร์มนี้?' : 'ออกจากหน้านี้?'}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="text-center space-y-4">
                                <p className="text-sm text-gray-500">
                                    ข้อมูลที่กรอกไว้ทั้งหมดจะหายไป<br />
                                    และไม่สามารถกู้คืนได้
                                </p>
                                <div className="flex gap-3 pt-2">
                                    <Button
                                        variant="ghost"
                                        className="flex-1"
                                        onClick={() => setShowLeaveConfirm(false)}
                                    >
                                        ไม่ใช่
                                    </Button>
                                    <Button
                                        variant="danger"
                                        className="flex-1"
                                        onClick={confirmLeave}
                                    >
                                        ยืนยัน
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </main>
        </div>
    )
}