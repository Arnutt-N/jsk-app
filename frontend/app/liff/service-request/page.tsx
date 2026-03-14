"use client"

import { useState, useEffect } from 'react'
import Head from 'next/head'
import liff from '@line/liff'
import { Province, District, SubDistrict } from '../../../types/location'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Alert'
import {
    User,
    Building2,
    MessageSquare,
    Paperclip,
    CheckCircle2,
    ChevronRight,
    ChevronLeft,
    Upload,
    X,
    Shield
} from 'lucide-react'

// --- CONSTANTS ---
const STEPS = [
    { title: 'ข้อมูลส่วนตัว', icon: <User className="w-4 h-4" /> },
    { title: 'หน่วยงาน', icon: <Building2 className="w-4 h-4" /> },
    { title: 'รายละเอียด', icon: <MessageSquare className="w-4 h-4" /> },
    { title: 'เอกสารแนบ', icon: <Paperclip className="w-4 h-4" /> }
]

const TOPIC_OPTIONS: Record<string, string[]> = {
    "กองทุนยุติธรรม": [
        "ค่าจ้างทนายความ",
        "ค่าธรรมเนียมศาล",
        "เงินประกันตัว",
        "อื่นๆ"
    ],
    "เงินเยียวยาเหยื่ออาชญากรรม": [
        "กรณีถูกทำร้ายร่างกาย/ถูกลูกหลง",
        "กรณีอุบัติเหตุจราจร",
        "กรณีอนาจาร/ข่มขืน",
        "กรณีจำเลยในคดีอาญาที่ศาลยกฟ้อง",
        "อื่นๆ"
    ],
    "ไกล่เกลี่ยข้อพิพาท": [
        "ข้อพิพาททางแพ่ง (ที่ดิน มรดก ครอบครัว หนี้ ค้ำประกัน เช่าชื้อ)",
        "ข้อพิพาททางอาญา (เพศ ร่างกาย ทรัพย์ รถชน)",
        "อื่นๆ"
    ],
    "ร้องเรียน/ร้องทุกข์": [
        "อธิบายสั้นๆ"
    ]
}

export default function LiffServiceRequestV2() {
    interface LiffProfile {
        userId: string;
    }

    // --- STATE ---
    const [step, setStep] = useState(0)
    const [, setLoading] = useState(false) // Start as false to render immediately
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const [profile, setProfile] = useState<LiffProfile | null>(null)
    const [isInLineApp, setIsInLineApp] = useState(false)

    // Location Data State
    const [provinces, setProvinces] = useState<Province[]>([])
    const [districts, setDistricts] = useState<District[]>([])
    const [subDistricts, setSubDistricts] = useState<SubDistrict[]>([])

    // Loading States for Location
    const [loadingDistricts, setLoadingDistricts] = useState(false)
    const [loadingSubDistricts, setLoadingSubDistricts] = useState(false)

    // Form Data
    const [formData, setFormData] = useState({
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
    })

    // Selected IDs for cascading logic (Not submitted)
    const [selectedProvinceId, setSelectedProvinceId] = useState<number | null>(null)
    const [selectedDistrictId, setSelectedDistrictId] = useState<number | null>(null)

    // --- INITIALIZATION ---
    useEffect(() => {
        const initLiff = async () => {
            try {
                const liffId = process.env.NEXT_PUBLIC_LIFF_ID
                if (!liffId) {
                    throw new Error('LIFF ID is not specified in environment variables.')
                }

                // Initialize LIFF
                await liff.init({ liffId })

                // Check if running inside LINE App
                const inClient = liff.isInClient()
                setIsInLineApp(inClient)

                // Get profile if logged in
                if (liff.isLoggedIn()) {
                    const userProfile = await liff.getProfile()
                    setProfile(userProfile)
                } else {
                    // Not logged in - trigger login
                    liff.login()
                    return
                }
            } catch (err: unknown) {
                console.error('LIFF Init Error:', err)
                // Don't show error to user immediately, just log it. 
                // We'll fallback to manual inputs if LIFF fails.
            }
        }

        const fetchProvinces = async () => {
            try {
                // Use env var or default to relative path (which uses proxy)
                const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1'
                const res = await fetch(`${API_BASE}/locations/provinces`)

                if (!res.ok) {
                    const txt = await res.text()
                    throw new Error(`Failed to load provinces: ${res.status} ${res.statusText} - ${txt}`)
                }
                const data = await res.json()
                setProvinces(data)
            } catch (err: unknown) {
                console.error("Provinces fetch error:", err)
                setError(err instanceof Error ? err.message : 'Failed to load provinces') // Show detail to user for debugging
            } finally {
                // Unblock UI as soon as provinces are loaded (or failed)
                // We don't wait for LIFF anymore
                setLoading(false)
            }
        }

        initLiff()
        fetchProvinces()
    }, [])

    // --- HANDLERS ---

    // Handle Input Change
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
        if (fieldErrors[name]) {
            setFieldErrors(prev => {
                const newErrors = { ...prev }
                delete newErrors[name]
                return newErrors
            })
        }
    }

    // Handle Location Changes
    const handleProvinceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const provinceId = parseInt(e.target.value)
        const provinceObj = provinces.find(p => p.PROVINCE_ID === provinceId)

        // Update Form Data (Name) & Logic ID
        setSelectedProvinceId(provinceId)
        setFormData(prev => ({
            ...prev,
            province: provinceObj?.PROVINCE_THAI || '',
            district: '',
            sub_district: ''
        }))

        // Reset sub-levels
        setDistricts([])
        setSubDistricts([])
        setSelectedDistrictId(null)

        // Fetch Districts
        if (provinceId) {
            setLoadingDistricts(true)
            try {
                const res = await fetch(`/api/v1/locations/provinces/${provinceId}/districts`)
                const data = await res.json()
                setDistricts(data)
            } catch (err) {
                console.error(err)
            } finally {
                setLoadingDistricts(false)
            }
        }
    }

    const handleDistrictChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const districtId = parseInt(e.target.value)
        const districtObj = districts.find(d => d.DISTRICT_ID === districtId)

        setSelectedDistrictId(districtId)
        setFormData(prev => ({
            ...prev,
            district: districtObj?.DISTRICT_THAI || '',
            sub_district: ''
        }))
        setSubDistricts([])

        // Fetch SubDistricts
        if (districtId) {
            setLoadingSubDistricts(true)
            try {
                const res = await fetch(`/api/v1/locations/districts/${districtId}/sub-districts`)
                const data = await res.json()
                setSubDistricts(data)
            } catch (err) {
                console.error(err)
            } finally {
                setLoadingSubDistricts(false)
            }
        }
    }

    const handleSubDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const subDistrictId = parseInt(e.target.value)
        const subObj = subDistricts.find(s => s.SUB_DISTRICT_ID === subDistrictId)

        setFormData(prev => ({ ...prev, sub_district: subObj?.SUB_DISTRICT_THAI || '' }))
    }

    // Handle File Upload
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return

        const file = e.target.files[0]
        const formDataUpload = new FormData()
        formDataUpload.append('file', file)

        try {
            // Show simple loading/toast here if needed
            const res = await fetch('/api/v1/media', {
                method: 'POST',
                body: formDataUpload
            })

            if (!res.ok) throw new Error('Upload failed')

            const data = await res.json()
            setFormData(prev => ({
                ...prev,
                attachments: [...prev.attachments, { id: data.id, url: `/api/v1/media/${data.id}`, name: data.filename }]
            }))
        } catch (err) {
            alert('อัพโหลดไฟล์ไม่สำเร็จ')
            console.error(err)
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
                if (!formData.prefix) errors.prefix = 'กรุณาระบุ'
                if (!formData.firstname) errors.firstname = 'กรุณาระบุชื่อ'
                if (!formData.lastname) errors.lastname = 'กรุณาระบุนามสกุล'
                if (!formData.phone_number) errors.phone_number = 'กรุณาระบุเบอร์โทร'
                else if (formData.phone_number.length < 9) errors.phone_number = 'เบอร์โทรไม่ถูกต้อง'
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
                if (!formData.description) errors.description = 'กรุณาระบุรายละเอียด'
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
            const res = await fetch('/api/v1/liff/service-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

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
        } catch (err: unknown) {
            console.error("Submit Error:", err)
            setError(err instanceof Error ? err.message : 'Failed to submit')
            setShowConfirm(false)
            window.scrollTo(0, 0)
        } finally {
            setSubmitting(false)
        }
    }

    const handleClose = () => {
        try {
            if (liff.isInClient()) {
                // Inside LINE App - use LIFF close
                liff.closeWindow()
            } else {
                // External Browser - just try window.close()
                // DO NOT redirect to LIFF URL as it reopens the form!
                window.close()
                // If window.close() doesn't work (e.g., not opened by script),
                // the user will see the "please close manually" message.
            }
        } catch (e) {
            console.error('Close window failed:', e)
        }
    }

    // Auto-close countdown state (only works in LINE App)
    const [timeLeft, setTimeLeft] = useState(5)

    useEffect(() => {
        let timer: NodeJS.Timeout
        // Only auto-close if inside LINE App
        if (success && isInLineApp && timeLeft > 0) {
            timer = setTimeout(() => {
                setTimeLeft(prev => prev - 1)
            }, 1000)
        } else if (success && isInLineApp && timeLeft === 0) {
            handleClose()
        }
        return () => clearTimeout(timer)
    }, [success, timeLeft, isInLineApp])

    // Global loading spinner removed to allow instant render
    // if (loading) { ... }

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
                                <p className="text-[11px] text-gray-400 px-4">
                                    ท่านสามารถปิดหน้านี้ได้ทันที
                                </p>
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
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
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
                    <Badge variant={provinces.length > 0 ? "success" : "warning"} className="h-6">
                        {provinces.length > 0 ? "Online" : "Connecting..."}
                    </Badge>
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

                <form onSubmit={handleFormSubmit} className="space-y-6">
                    {error && (
                        <Alert variant="danger" title="เกิดข้อผิดพลาด">
                            {error}
                        </Alert>
                    )}

                    <Card glass className="overflow-hidden">
                        <CardHeader className="bg-gray-50/50 border-b border-gray-100">
                            <CardTitle className="text-base flex items-center gap-2">
                                {STEPS[step].icon} {STEPS[step].title}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                            {/* Step 1: Personal */}
                            {step === 0 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="col-span-1">
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                                คำนำหน้า <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                name="prefix"
                                                value={formData.prefix}
                                                onChange={handleChange}
                                                className={`w-full bg-white border text-gray-900 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 outline-none transition-all ${fieldErrors.prefix ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'
                                                    }`}
                                                placeholder="ระบุพิมพ์"
                                                required
                                            />
                                            {fieldErrors.prefix && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.prefix}</p>}
                                            <p className="text-[9px] text-gray-400 mt-1">*คำนำหน้ายาวให้ย่อ</p>
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
                                                placeholder="0xx-xxx-xxxx"
                                                maxLength={10}
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

                            {/* Step 2: Location / Agency */}
                            {step === 1 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                            หน่วยงาน <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            name="agency"
                                            value={formData.agency}
                                            onChange={handleChange}
                                            className={`w-full bg-white border text-gray-900 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 outline-none transition-all ${fieldErrors.agency ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'
                                                }`}
                                            required
                                        >
                                            <option value="">-- เลือกหน่วยงานของท่าน --</option>
                                            <option value="ศูนย์ยุติธรรมชุมชน">ศูนย์ยุติธรรมชุมชน</option>
                                            <option value="ศูนย์ดำรงธรรม">ศูนย์ดำรงธรรม</option>
                                            <option value="สถานีตำรวจภูธร">สถานีตำรวจภูธร</option>
                                        </select>
                                        {fieldErrors.agency && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.agency}</p>}
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                            จังหวัด <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            value={selectedProvinceId || ''}
                                            onChange={(e) => {
                                                handleProvinceChange(e)
                                                setFieldErrors(prev => ({ ...prev, province: '' }))
                                            }}
                                            className={`w-full bg-white border text-gray-900 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 outline-none transition-all ${fieldErrors.province ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'
                                                }`}
                                            required
                                        >
                                            <option value="">-- เลือกจังหวัด --</option>
                                            {provinces.map(p => (
                                                <option key={p.PROVINCE_ID} value={p.PROVINCE_ID}>
                                                    {p.PROVINCE_THAI}
                                                </option>
                                            ))}
                                        </select>
                                        {fieldErrors.province && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.province}</p>}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                                                อำเภอ/เขต <span className="text-red-500">*</span> {loadingDistricts && <div className="w-3 h-3 border-2 border-primary border-t-transparent animate-spin rounded-full"></div>}
                                            </label>
                                            <select
                                                value={selectedDistrictId || ''}
                                                onChange={(e) => {
                                                    handleDistrictChange(e)
                                                    setFieldErrors(prev => ({ ...prev, district: '' }))
                                                }}
                                                disabled={!selectedProvinceId}
                                                className={`w-full bg-white border text-gray-900 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 outline-none transition-all disabled:opacity-50 ${fieldErrors.district ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'
                                                    }`}
                                                required
                                            >
                                                <option value="">-- เลือก --</option>
                                                {districts.map(d => (
                                                    <option key={d.DISTRICT_ID} value={d.DISTRICT_ID}>
                                                        {d.DISTRICT_THAI}
                                                    </option>
                                                ))}
                                            </select>
                                            {fieldErrors.district && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.district}</p>}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                                                ตำบล/แขวง <span className="text-red-500">*</span> {loadingSubDistricts && <div className="w-3 h-3 border-2 border-primary border-t-transparent animate-spin rounded-full"></div>}
                                            </label>
                                            <select
                                                name="sub_district"
                                                onChange={(e) => {
                                                    handleSubDistrictChange(e)
                                                    setFieldErrors(prev => ({ ...prev, sub_district: '' }))
                                                }}
                                                value={subDistricts.find(s => s.SUB_DISTRICT_THAI === formData.sub_district)?.SUB_DISTRICT_ID || ''}
                                                disabled={!selectedDistrictId}
                                                className={`w-full bg-white border text-gray-900 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 outline-none transition-all disabled:opacity-50 ${fieldErrors.sub_district ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'
                                                    }`}
                                                required
                                            >
                                                <option value="">-- เลือก --</option>
                                                {subDistricts.map(s => (
                                                    <option key={s.SUB_DISTRICT_ID} value={s.SUB_DISTRICT_ID}>
                                                        {s.SUB_DISTRICT_THAI}
                                                    </option>
                                                ))}
                                            </select>
                                            {fieldErrors.sub_district && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.sub_district}</p>}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Step 3: Description */}
                            {step === 2 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                            เรื่องที่ขอรับความช่วยเหลือ <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            name="topic_category"
                                            value={formData.topic_category}
                                            onChange={handleChange}
                                            className={`w-full bg-white border text-gray-900 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 outline-none transition-all ${fieldErrors.topic_category ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'
                                                }`}
                                            required
                                        >
                                            <option value="">-- เลือกหัวข้อ --</option>
                                            {Object.keys(TOPIC_OPTIONS).map(topic => (
                                                <option key={topic} value={topic}>{topic}</option>
                                            ))}
                                        </select>
                                        {fieldErrors.topic_category && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.topic_category}</p>}
                                    </div>

                                    {formData.topic_category && TOPIC_OPTIONS[formData.topic_category] && (
                                        <div className="animate-in slide-in-from-top-2">
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                                                รายละเอียดเรื่อง <span className="text-red-500">*</span>
                                            </label>
                                            <select
                                                name="topic_subcategory"
                                                value={formData.topic_subcategory}
                                                onChange={handleChange}
                                                className={`w-full bg-white border text-gray-900 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 outline-none transition-all ${fieldErrors.topic_subcategory ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'
                                                    }`}
                                                required
                                            >
                                                <option value="">-- เลือกรายละเอียด --</option>
                                                {TOPIC_OPTIONS[formData.topic_category].map(sub => (
                                                    <option key={sub} value={sub}>{sub}</option>
                                                ))}
                                            </select>
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

                            {/* Step 4: Attachments */}
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
                        </CardContent>
                    </Card>

                    {/* Navigation Buttons (Static) */}
                    <div className="pt-8 border-t border-gray-100 flex flex-col gap-3">
                        {/* Row 1: Navigation (Back / Next) */}
                        <div className="flex gap-3 w-full">
                            {step > 0 && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1 py-3 h-auto"
                                    onClick={prevStep}
                                >
                                    <ChevronLeft className="w-4 h-4 mr-2" /> กลับ
                                </Button>
                            )}

                            {step < STEPS.length - 1 ? (
                                <Button
                                    type="button"
                                    variant="primary"
                                    className="flex-[2] py-3 h-auto"
                                    onClick={nextStep}
                                >
                                    ถัดไป <ChevronRight className="w-4 h-4 ml-2" />
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    variant="primary"
                                    onClick={() => setShowConfirm(true)}
                                    className="flex-[2] py-3 h-auto font-bold"
                                >
                                    ยื่นคำขอ
                                </Button>
                            )}
                        </div>

                        {/* Row 2: Cancel */}
                        <Button
                            type="button"
                            variant="ghost"
                            className="w-full py-2 h-auto text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 font-medium"
                            onClick={handleClose}
                        >
                            ยกเลิกรายการ
                        </Button>

                        <p className="text-center text-[10px] text-gray-400 mt-4 px-4 leading-relaxed opacity-70">
                            ข้อมูลของท่านจะถูกใช้เพื่อการวิเคราะห์และดำเนินการให้ความช่วยเหลือโดยบุคลากรของรัฐที่เกี่ยวข้องเท่านั้น ภายใต้กฎหมายคุ้มครองข้อมูลส่วนบุคคล (PDPA)
                        </p>
                    </div>
                </form>

                {/* Confirmation Modal */}
                {showConfirm && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                        <Card className="w-full max-w-sm shadow-2xl">
                            <CardHeader className="text-center pb-2">
                                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
                                    <MessageSquare className="w-6 h-6" />
                                </div>
                                <CardTitle className="text-lg">ยืนยันคำขอรับบริการ</CardTitle>
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
            </main >
        </div >
    )
}
