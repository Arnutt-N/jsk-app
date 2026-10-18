"use client"

import { useCallback, useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import liff from '@line/liff'
import type { Province } from '../../../types/location'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import LiffStatusBadge from '@/components/liff/LiffStatusBadge'
import { Alert } from '@/components/ui/Alert'
import { AGENCIES } from '@/lib/constants/agencies'
import { PREFIX_OPTIONS } from '@/lib/constants/prefixes'
import { isValidPhone } from '@/lib/liff/validation'
import {
    User,
    Building2,
    MessageSquare,
    Paperclip,
    CheckCircle2,
    Upload,
    X,
    Shield,
    Loader2
} from 'lucide-react'
import { logger } from '@/lib/logger';
import { useToast } from '@/components/ui/Toast';
import { Select } from '@/components/ui/Select'
import { TOPIC_OPTIONS } from '@/lib/constants/categories'
import { loadTaxonomy, type TaxonomyTable } from '@/lib/booking/service-mapping'
import { useLiffInit } from '@/hooks/useLiffInit'
import { useLiffLeave } from '@/hooks/useLiffLeave'
import { LeaveConfirmDialog } from '@/components/liff/LeaveConfirmDialog'
import { LiffClearButton } from '@/components/liff/LiffClearButton'
import { LiffWizardNav } from '@/components/liff/LiffWizardNav'
import { LiffStepCard } from '@/components/liff/LiffStepCard'
import LiffStepper from '@/components/liff/LiffStepper'
import { useAutoCloseCountdown } from '@/hooks/useAutoCloseCountdown'
import { useLocationCascade, type LocationSelection } from '@/hooks/useLocationCascade'
import { submitServiceRequest } from '@/lib/liff/submit-service-request'
import { uploadLiffMedia, attachmentCapMessage, readErrorDetail } from '@/lib/liff/upload-media'
import { SESSION_EXPIRED_MESSAGE, isSessionExpired } from '@/lib/liff/session-expired'

// --- CONSTANTS ---
const STEPS = [
    { title: 'ข้อมูลส่วนตัว', icon: <User className="w-4 h-4" /> },
    { title: 'หน่วยงาน', icon: <Building2 className="w-4 h-4" /> },
    { title: 'รายละเอียด', icon: <MessageSquare className="w-4 h-4" /> },
    { title: 'เอกสารแนบ', icon: <Paperclip className="w-4 h-4" /> }
]

export default function LiffServiceRequestV2() {
    // --- STATE ---
    const [step, setStep] = useState(0)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const { leaveOpen, requestLeave, cancelLeave, confirmLeave } = useLiffLeave()
    const { toast } = useToast()

    // LIFF init (profile / idToken / in-LINE detection)
    const { profile, idToken, isInLineApp, setIsInLineApp } = useLiffInit({
        getLiff: () => liff,
        requireLiffId: true,
        redirectLogin: true,
        trackInLineApp: true
    })

    // Cascading selects live in the shared hook (stale guards kept there);
    // this page only maps ids to Thai names in its own form data.
    const cascade = useLocationCascade(
        useCallback((patch: Partial<LocationSelection>) => {
            setFormData((prev) => ({ ...prev, ...patch }))
            setFieldErrors((prev) => {
                const next = { ...prev }
                for (const key of Object.keys(patch)) delete next[key]
                return next
            })
        }, []),
    )
    const {
        districts,
        subDistricts,
        loadingDistricts,
        loadingSubDistricts,
        selectedProvinceId,
        selectedDistrictId,
    } = cascade
    // Uploads started but not yet resolved — counted toward the attachment
    // cap so rapid file picks cannot exceed the shared rate-limit budget.
    const inflightUploadsRef = useRef(0)

    // Location Data State
    const [provinces, setProvinces] = useState<Province[]>([])

    const INITIAL_FORM_DATA = {
        // Personal
        prefix: '',
        firstname: '',
        lastname: '',
        phone_number: '',
        email: '',

        // Location
        agency: '',
        province: '',     // Store Thai Name
        district: '',     // Store Thai Name
        sub_district: '', // Store Thai Name

        // Topic
        topic_category: '',
        topic_subcategory: '',
        description: '',

        // Attachments
        attachments: [] as Array<{ id: string, url: string, name: string }>
    }
    const [formData, setFormData] = useState(INITIAL_FORM_DATA)

    const [taxonomy, setTaxonomy] = useState<TaxonomyTable | null>(null)
    useEffect(() => {
        let cancelled = false
        void loadTaxonomy().then((table) => {
            if (!cancelled) setTaxonomy(table)
        })
        return () => {
            cancelled = true
        }
    }, [])

    // --- PROVINCES (initial load) ---
    useEffect(() => {
        const fetchProvinces = async () => {
            try {
                // Use the relative path so the request goes through the Next.js
                // rewrite proxy (same as districts/media/submit). Avoids a
                // cross-origin CORS failure on preview deployments.
                const res = await fetch(`/api/v1/locations/provinces`)

                if (!res.ok) {
                    const txt = await res.text()
                    throw new Error(`Failed to load provinces: ${res.status} ${res.statusText} - ${txt}`)
                }
                const data = await res.json()
                setProvinces(data)
            } catch (err: unknown) {
                logger.error("Provinces fetch error:", err)
                setError(err instanceof Error ? err.message : 'Failed to load provinces') // Show detail to user for debugging
            }
            // No global loading gate — UI renders immediately while provinces load
        }

        fetchProvinces()
    }, [])

    // --- HANDLERS ---

    // Handle Input Change
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        // Digit-only, with +66 international prefix normalized to 0 so a
        // pasted +66 number is not corrupted into a wrong digit string (F12).
        const next = name === 'phone_number' ? value.replace(/^\+66/, '0').replace(/\D/g, '') : value
        setFormData(prev => ({ ...prev, [name]: next }))
        if (fieldErrors[name]) {
            setFieldErrors(prev => {
                const newErrors = { ...prev }
                delete newErrors[name]
                return newErrors
            })
        }
    }

    // Location changes delegate to the shared cascade hook.
    const handleProvinceChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
        cascade.selectProvince(e.target.value, provinces)

    const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
        cascade.selectDistrict(e.target.value, cascade.districts)

    const handleSubDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
        cascade.selectSubDistrict(e.target.value, cascade.subDistricts)

    // Handle File Upload
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = e.target;
        if (!input.files?.length) return

        const capMessage = attachmentCapMessage(formData.attachments.length, inflightUploadsRef.current)
        if (capMessage) {
            alert(capMessage)
            return
        }

        const file = input.files[0]
        let failureMessage = 'อัพโหลดไฟล์ไม่สำเร็จ'
        inflightUploadsRef.current += 1

        try {
            const res = await uploadLiffMedia(file, idToken)

            if (!res.ok) {
                const detail = await readErrorDetail(res)
                if (detail) failureMessage = detail
                throw new Error('Upload failed')
            }

            const data = await res.json()
            setFormData(prev => ({
                ...prev,
                attachments: [...prev.attachments, { id: data.id, url: `/api/v1/media/${data.id}`, name: data.filename }]
            }))
        } catch (err) {
            alert(isSessionExpired(err) ? SESSION_EXPIRED_MESSAGE : failureMessage)
            logger.error(err)
        } finally {
            input.value = '';
            inflightUploadsRef.current -= 1
        }
    }

    const removeAttachment = (index: number) => {
        setFormData(prev => ({
            ...prev,
            attachments: prev.attachments.filter((_, i) => i !== index)
        }))
    }

    // --- VALIDATION ---
    const validateStep = (currentStep: number): boolean => {
        const errors: Record<string, string> = {}

        switch (currentStep) {
            case 0: // Personal
                if (!formData.prefix.trim()) errors.prefix = 'กรุณาระบุ'
                if (!formData.firstname.trim()) errors.firstname = 'กรุณาระบุชื่อ'
                if (!formData.lastname.trim()) errors.lastname = 'กรุณาระบุนามสกุล'
                if (!formData.phone_number) errors.phone_number = 'กรุณาระบุหมายเลขโทรศัพท์'
                else if (!isValidPhone(formData.phone_number)) errors.phone_number = 'หมายเลขโทรศัพท์ไม่ถูกต้อง'
                break
            case 1: // Agency
                if (!formData.agency) errors.agency = 'กรุณาเลือกหน่วยงาน'
                if (!selectedProvinceId) errors.province = 'กรุณาเลือกจังหวัด'
                if (!selectedDistrictId) errors.district = 'กรุณาเลือกอำเภอ'
                if (!formData.sub_district) errors.sub_district = 'กรุณาเลือกตำบล'
                break
            case 2: // Description
                if (!formData.topic_category) errors.topic_category = 'กรุณาเลือกหัวข้อ'
                if (!formData.topic_subcategory) errors.topic_subcategory = 'กรุณาเลือกรายละเอียด'
                if (!formData.description.trim()) errors.description = 'กรุณาระบุรายละเอียด'
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
        // Prevent accidental submit on previous steps (e.g. via Enter key)
        if (step !== STEPS.length - 1) return

        if (validateStep(3)) {
            setShowConfirm(true)
        }
    }

    const submitData = async () => {
        setSubmitting(true)
        setError(null)

        try {
            const payload = {
                ...formData,
                line_user_id: profile?.userId || null
            }

            // Post to backend
            const res = await submitServiceRequest(payload, idToken)

            const resText = await res.text()
            let data
            try {
                data = JSON.parse(resText)
            } catch {
                // If response is not JSON (e.g. 500 HTML or text)
                throw new Error(resText || `Server Error: ${res.status} ${res.statusText}`)
            }

            if (!res.ok) {
                throw new Error(data.detail || JSON.stringify(data))
            }

            setSuccess(true)
            setShowConfirm(false)
            window.scrollTo(0, 0)
            // Re-sync in-client status when success shows so the auto-close
            // below fires reliably even if liff.init() lagged on mobile.
            try { setIsInLineApp(liff.isInClient()) } catch { /* not in LINE */ }
        } catch (err: unknown) {
            logger.error("Submit Error:", err)
            setError(err instanceof Error ? err.message : 'Failed to submit')
            setShowConfirm(false)
            window.scrollTo(0, 0)
        } finally {
            setSubmitting(false)
        }
    }

    // Clear only the fields belonging to the current step ("ล้างค่า" per tab).
    const clearStep = () => {
        if (step === 0) {
            setFormData(prev => ({ ...prev, prefix: '', firstname: '', lastname: '', phone_number: '', email: '' }))
        } else if (step === 1) {
            setFormData(prev => ({ ...prev, agency: '', province: '', district: '', sub_district: '' }))
            cascade.reset()
        } else if (step === 2) {
            setFormData(prev => ({ ...prev, topic_category: '', topic_subcategory: '', description: '' }))
        } else if (step === 3) {
            setFormData(prev => ({ ...prev, attachments: [] }))
        }
        setFieldErrors({})
        toast({ variant: 'success', title: 'ล้างข้อมูลแท็บนี้แล้ว' })
    }

    // Reset the whole form back to its initial state (used by "ยื่นคำร้องใหม่").
    const resetForm = () => {
        setStep(0)
        setFormData({ ...INITIAL_FORM_DATA, attachments: [] })
        cascade.reset()
        setFieldErrors({})
        setError(null)
        setShowConfirm(false)
        setSuccess(false)
        resetCountdown()
        window.scrollTo(0, 0)
    }

    // Close the LIFF window. Only meaningful inside the LINE in-app browser.
    const handleClose = () => {
        try {
            liff.closeWindow()
        } catch (e) {
            logger.error('Close window failed:', e)
        }
    }

    // Auto-close countdown (only ticks inside the LINE in-app browser — an
    // external browser tab cannot be closed programmatically).
    const { timeLeft, resetCountdown } = useAutoCloseCountdown(success && isInLineApp, handleClose)

    if (success) {
        return (
            <div className="min-h-screen p-6 bg-bg flex items-center justify-center">
                <Card glass className="max-w-sm w-full text-center py-8">
                    <CardContent>
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle2 className="w-10 h-10 text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">บันทึกข้อมูลสำเร็จ</h2>
                        <p className="text-gray-500 mb-6">
                            เจ้าหน้าที่ได้รับเรื่องของท่านแล้ว<br />
                            เราจะดำเนินการตรวจสอบโดยเร็วที่สุด
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
                                        กรุณาพิมพ์ <strong>&quot;ติดตาม&quot;</strong> ใน LINE OA<br />
                                        แล้วใส่เบอร์โทรศัพท์ที่ใช้ยื่นเรื่อง
                                    </p>
                                </div>
                                <Button
                                    variant="primary"
                                    className="w-full py-4 text-lg mb-3"
                                    onClick={resetForm}
                                >
                                    ยื่นคำร้องใหม่
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
                <title>ยื่นคำร้อง - JSK 4.0</title>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>

            {/* Header */}
            <div className="sticky top-0 z-50 bg-white/70 backdrop-blur-md border-b border-gray-200/50 px-4 py-4 mb-6">
                <div className="max-w-lg mx-auto flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <Shield className="w-5 h-5 text-primary" />
                            <h1 className="text-lg font-bold text-gray-900 tracking-tight">ยื่นคำขอรับบริการ</h1>
                        </div>
                        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                            JSK 4.0 Platform • ยุติธรรมจังหวัดสกลนคร
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <LiffStatusBadge kind="connectivity" state={provinces.length > 0 ? 'online' : 'loading'} />
                    </div>
                </div>
            </div>

            <main className="px-4 max-w-lg mx-auto">
                <LiffStepper
                    steps={STEPS.map((s) => ({ label: s.title, icon: s.icon }))}
                    currentIndex={step}
                    ariaLabel="ขั้นตอนยื่นคำขอรับบริการ"
                />

                <form onSubmit={handleFormSubmit} className="liff-form space-y-6">
                    {error && (
                        <Alert variant="danger" title="เกิดข้อผิดพลาด">
                            {error}
                        </Alert>
                    )}

                    <LiffStepCard
                        icon={STEPS[step].icon}
                        title={STEPS[step].title}
                        action={<LiffClearButton onClear={clearStep} />}
                    >
                            {step === 0 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="col-span-1">
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                                คำนำหน้า <span className="text-red-500">*</span>
                                            </label>
                                            <Select
                                                name="prefix"
                                                value={formData.prefix}
                                                onChange={handleChange}
                                                options={PREFIX_OPTIONS}
                                                placeholder="เลือก"
                                                state={fieldErrors.prefix ? 'error' : 'default'}
                                                required
                                            />
                                            {fieldErrors.prefix && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.prefix}</p>}
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                                ชื่อ <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                name="firstname"
                                                value={formData.firstname}
                                                onChange={handleChange}
                                                className={`w-full bg-white border text-gray-900 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 outline-none transition-all ${fieldErrors.firstname ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'
                                                    }`}
                                                placeholder="ระบุชื่อจริง"
                                                required
                                            />
                                            {fieldErrors.firstname && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.firstname}</p>}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                            นามสกุล <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            name="lastname"
                                            value={formData.lastname}
                                            onChange={handleChange}
                                            className={`w-full bg-white border text-gray-900 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 outline-none transition-all ${fieldErrors.lastname ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'
                                                }`}
                                            placeholder="ระบุนามสกุล"
                                            required
                                        />
                                        {fieldErrors.lastname && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.lastname}</p>}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                                หมายเลขโทรศัพท์ <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="tel"
                                                name="phone_number"
                                                value={formData.phone_number}
                                                onChange={handleChange}
                                                className={`w-full bg-white border text-gray-900 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 outline-none transition-all ${fieldErrors.phone_number ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'
                                                    }`}
                                                placeholder="08xxxxxxxx"
                                                maxLength={12}
                                                required
                                            />
                                            {fieldErrors.phone_number && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.phone_number}</p>}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">อีเมล (ถ้ามี)</label>
                                            <input
                                                type="email"
                                                name="email"
                                                value={formData.email}
                                                onChange={handleChange}
                                                className="w-full bg-white border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 outline-none transition-all"
                                                placeholder="name@example.com"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {step === 1 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                            หน่วยงาน <span className="text-red-500">*</span>
                                        </label>
                                        <Select
                                            name="agency"
                                            value={formData.agency}
                                            onChange={handleChange}
                                            options={AGENCIES.map((agency) => ({
                                                value: agency.value,
                                                label: agency.label,
                                            }))}
                                            placeholder="-- เลือกหน่วยงานของท่าน --"
                                            state={fieldErrors.agency ? 'error' : 'default'}
                                            required
                                        />
                                        {fieldErrors.agency && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.agency}</p>}
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                            จังหวัด <span className="text-red-500">*</span>
                                        </label>
                                        <Select
                                            value={selectedProvinceId || ''}
                                            onChange={handleProvinceChange}
                                            options={provinces.map((p) => ({
                                                value: String(p.PROVINCE_ID),
                                                label: p.PROVINCE_THAI,
                                            }))}
                                            placeholder="-- เลือกจังหวัด --"
                                            state={fieldErrors.province ? 'error' : 'default'}
                                            required
                                        />
                                        {fieldErrors.province && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.province}</p>}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                                                อำเภอ/เขต <span className="text-red-500">*</span> {loadingDistricts && <Loader2 className="h-4 w-4 animate-spin text-brand-500" />}
                                            </label>
                                            <Select
                                                value={selectedDistrictId || ''}
                                                onChange={handleDistrictChange}
                                                disabled={!selectedProvinceId}
                                                options={districts.map((d) => ({
                                                    value: String(d.DISTRICT_ID),
                                                    label: d.DISTRICT_THAI,
                                                }))}
                                                placeholder="-- เลือก --"
                                                state={fieldErrors.district ? 'error' : 'default'}
                                                required
                                            />
                                            {fieldErrors.district && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.district}</p>}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                                                ตำบล/แขวง <span className="text-red-500">*</span> {loadingSubDistricts && <Loader2 className="h-4 w-4 animate-spin text-brand-500" />}
                                            </label>
                                            <Select
                                                name="sub_district"
                                                onChange={handleSubDistrictChange}
                                                value={subDistricts.find(s => s.SUB_DISTRICT_THAI === formData.sub_district)?.SUB_DISTRICT_ID || ''}
                                                disabled={!selectedDistrictId}
                                                options={subDistricts.map((s) => ({
                                                    value: String(s.SUB_DISTRICT_ID),
                                                    label: s.SUB_DISTRICT_THAI,
                                                }))}
                                                placeholder="-- เลือก --"
                                                state={fieldErrors.sub_district ? 'error' : 'default'}
                                                required
                                            />
                                            {fieldErrors.sub_district && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.sub_district}</p>}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {step === 2 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                            เรื่องที่ขอรับความช่วยเหลือ <span className="text-red-500">*</span>
                                        </label>
                                        <Select
                                            name="topic_category"
                                            value={formData.topic_category}
                                            onChange={handleChange}
                                            options={Object.keys(taxonomy ?? TOPIC_OPTIONS).map((topic) => ({
                                                value: topic,
                                                label: topic,
                                            }))}
                                            placeholder="-- เลือกหัวข้อ --"
                                            state={fieldErrors.topic_category ? 'error' : 'default'}
                                            required
                                        />
                                        {fieldErrors.topic_category && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.topic_category}</p>}
                                    </div>

                                    {formData.topic_category && (taxonomy ?? TOPIC_OPTIONS)[formData.topic_category] && (
                                        <div className="animate-in slide-in-from-top-2">
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                                รายละเอียดเรื่อง <span className="text-red-500">*</span>
                                            </label>
                                            <Select
                                                name="topic_subcategory"
                                                value={formData.topic_subcategory}
                                                onChange={handleChange}
                                                options={(taxonomy ?? TOPIC_OPTIONS)[formData.topic_category].map((sub) => ({
                                                    value: sub,
                                                    label: sub,
                                                }))}
                                                placeholder="-- เลือกรายละเอียด --"
                                                state={fieldErrors.topic_subcategory ? 'error' : 'default'}
                                                required
                                            />
                                            {fieldErrors.topic_subcategory && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.topic_subcategory}</p>}
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                            รายละเอียดเพิ่มเติม <span className="text-red-500">*</span>
                                        </label>
                                        <textarea
                                            name="description"
                                            value={formData.description}
                                            onChange={handleChange}
                                            rows={6}
                                            className={`w-full bg-white border text-gray-900 text-sm rounded-lg focus:ring-primary focus:border-primary block p-3 outline-none transition-all resize-none ${fieldErrors.description ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'
                                                }`}
                                            placeholder="ระบุรายละเอียดเหตุการณ์ หรือความประสงค์..."
                                        />
                                        {fieldErrors.description && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.description}</p>}
                                    </div>
                                </div>
                            )}

                            {step === 3 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="flex flex-wrap gap-4 items-center justify-center py-6 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                                        {formData.attachments.length === 0 && (
                                            <div className="text-center">
                                                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2 text-gray-400">
                                                    <Upload className="w-6 h-6" />
                                                </div>
                                                <p className="text-sm text-gray-500 font-medium">ยังไม่มีไฟล์แนบ</p>
                                                <p className="text-[10px] text-gray-400 uppercase mt-1">รูปภาพ หรือ PDF (ไม่เกิน 5MB)</p>
                                            </div>
                                        )}

                                        <div className="flex flex-wrap gap-3 justify-center w-full px-4">
                                            {formData.attachments.map((file, idx) => (
                                                <div key={idx} className="relative group w-20 h-20 bg-white border border-gray-200 rounded-lg p-2 shadow-sm transition-all hover:border-primary/50">
                                                    <button
                                                        type="button"
                                                        onClick={() => removeAttachment(idx)}
                                                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                    <div className="w-full h-full flex flex-col items-center justify-center overflow-hidden">
                                                        <Paperclip className="w-6 h-6 text-gray-400 mb-1" />
                                                        <span className="text-[8px] text-gray-500 text-center line-clamp-2 px-1">{file.name}</span>
                                                    </div>
                                                </div>
                                            ))}

                                            <label className="w-20 h-20 border-2 border-dashed border-primary/30 rounded-lg flex flex-col items-center justify-center text-primary cursor-pointer hover:bg-primary/5 hover:border-primary transition-all active:scale-95">
                                                <Upload className="w-6 h-6 mb-1" />
                                                <span className="text-[8px] font-bold uppercase tracking-tight">เพิ่มโหล</span>
                                                <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf" />
                                            </label>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-blue-50/50 rounded-lg border border-blue-100 flex gap-3">
                                        <Shield className="w-5 h-5 text-blue-500 shrink-0" />
                                        <p className="text-[10px] text-blue-700 leading-relaxed font-medium">
                                            ระบบรองรับการแนบหลักฐานที่เป็นประโยชน์ต่อคดี เช่น ภาพถ่ายสถานที่เกิดเหตุ หรือเอกสารราชการที่เกี่ยวข้อง ข้อมูลของท่านจะถูกเก็บเป็นความลับสูงสุด
                                        </p>
                                    </div>
                                </div>
                            )}
                        </LiffStepCard>

                    <div className="pt-8 border-t border-gray-100 flex flex-col gap-3">
                        <LiffWizardNav
                            onCancel={requestLeave}
                            back={step > 0 ? { label: 'กลับ', onClick: prevStep } : undefined}
                            next={step < STEPS.length - 1 ? { label: 'ถัดไป', onClick: nextStep } : undefined}
                            submit={step === STEPS.length - 1 ? { label: 'ยื่นคำขอ', onClick: () => setShowConfirm(true), disabled: submitting } : undefined}
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
                                    <MessageSquare className="w-6 h-6" />
                                </div>
                                <CardTitle id="confirm-dialog-title" className="text-lg">ยืนยันคำขอรับบริการ</CardTitle>
                            </CardHeader>
                            <CardContent className="text-center space-y-4">
                                <p className="text-sm text-gray-500">
                                    กรุณาตรวจสอบข้อมูลให้ถูกต้อง<br />
                                    เมื่อกดส่งแล้วเจ้าหน้าที่จะได้รับเรื่องทันที
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
            </main >
        </div >
    )
}
