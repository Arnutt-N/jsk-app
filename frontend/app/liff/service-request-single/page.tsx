"use client"

import { useState, useEffect } from 'react'
import Head from 'next/head'
import Script from 'next/script'
import { Province, District, SubDistrict } from '../../../types/location'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Alert'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import {
    User,
    MessageSquare,
    Paperclip,
    CheckCircle2,
    Upload,
    X,
    Shield,
    Building2,
    Loader2
} from 'lucide-react'

// --- CONSTANTS ---
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

export default function LiffServiceRequestSingle() {
    interface LiffProfile {
        userId: string;
    }

    // --- STATE ---
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const [profile, setProfile] = useState<LiffProfile | null>(null)

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
        phone: '',
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
                if (liffId && typeof window !== 'undefined' && window.liff) {
                    await window.liff.init({ liffId })
                    if (window.liff.isLoggedIn()) {
                        const userProfile = await window.liff.getProfile()
                        setProfile(userProfile)
                    }
                }
            } catch (err: unknown) {
                console.error('LIFF Init Error:', err)
            } finally {
                setLoading(false)
            }
        }

        const fetchProvinces = async () => {
            try {
                const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1'
                const res = await fetch(`${API_BASE}/locations/provinces`)
                if (!res.ok) throw new Error('Failed to load provinces')
                const data = await res.json()
                setProvinces(data)
            } catch (err) {
                console.error("Provinces fetch error:", err)
            }
        }

        initLiff()
        fetchProvinces()
    }, [])

    // --- HANDLERS ---
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

    const handleProvinceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const provinceId = parseInt(e.target.value)
        const provinceObj = provinces.find(p => p.PROVINCE_ID === provinceId)

        setSelectedProvinceId(provinceId)
        setFormData(prev => ({
            ...prev,
            province: provinceObj?.PROVINCE_THAI || '',
            district: '',
            sub_district: ''
        }))

        setDistricts([])
        setSubDistricts([])
        setSelectedDistrictId(null)

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

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return
        const file = e.target.files[0]
        const formDataUpload = new FormData()
        formDataUpload.append('file', file)

        try {
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

    const validateForm = (): boolean => {
        const errors: Record<string, string> = {}
        if (!formData.prefix) errors.prefix = 'กรุณาระบุ'
        if (!formData.firstname) errors.firstname = 'กรุณาระบุชื่อ'
        if (!formData.lastname) errors.lastname = 'กรุณาระบุนามสกุล'
        if (!formData.phone) errors.phone = 'กรุณาระบุหมายเลขโทรศัพท์'
        else if (formData.phone.length < 9) errors.phone = 'หมายเลขโทรศัพท์ไม่ถูกต้อง'
        if (!formData.agency) errors.agency = 'กรุณาเลือกหน่วยงาน'
        if (!selectedProvinceId) errors.province = 'กรุณาเลือกจังหวัด'
        if (!selectedDistrictId) errors.district = 'กรุณาเลือกอำเภอ/เขต'
        if (!formData.sub_district) errors.sub_district = 'กรุณาเลือกตำบล/แขวง'
        if (!formData.topic_category) errors.topic_category = 'กรุณาเลือกหัวข้อ'
        if (!formData.topic_subcategory) errors.topic_subcategory = 'กรุณาเลือกรายละเอียด'
        if (!formData.description) errors.description = 'กรุณาระบุรายละเอียด'

        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors)
            setError('กรุณากรอกข้อมูลในช่องขอบสีแดงให้ครบถ้วน')
            return false
        }
        setFieldErrors({})
        setError(null)
        return true
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!validateForm()) return
        setShowConfirm(true)
    }

    const submitData = async () => {
        setSubmitting(true)
        setError(null)

        try {
            const payload = {
                ...formData,
                line_user_id: profile?.userId || 'GUEST'
            }

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
                throw new Error(resText || `Server Error: ${res.status}`)
            }

            if (!res.ok) {
                throw new Error(data.detail || 'Failed to submit')
            }

            setSuccess(true)
            setShowConfirm(false)
            window.scrollTo(0, 0)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to submit')
            setShowConfirm(false)
            window.scrollTo(0, 0)
        } finally {
            setSubmitting(false)
        }
    }

    const handleClose = () => {
        const liff = window.liff
        try {
            if (liff?.isInClient()) {
                liff.closeWindow()
            } else {
                window.close()
                const liffId = process.env.NEXT_PUBLIC_LIFF_ID
                if (liffId) {
                    window.location.href = `https://line.me/R/app/${liffId}`
                }
            }
        } catch (e) {
            console.error('Close window failed:', e)
        }
    }

    const [timeLeft, setTimeLeft] = useState(5)
    useEffect(() => {
        let timer: NodeJS.Timeout
        if (success && timeLeft > 0) {
            timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000)
        } else if (success && timeLeft === 0) {
            handleClose()
        }
        return () => clearTimeout(timer)
    }, [success, timeLeft])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-bg">
                <LoadingSpinner label="กำลังโหลด..." />
            </div>
        )
    }

    if (success) {
        return (
            <div className="min-h-screen p-6 bg-bg flex items-center justify-center">
                <Card glass className="max-w-sm w-full text-center py-8">
                    <CardContent>
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle2 className="w-10 h-10 text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">บันทึกข้อมูลสำเร็จ</h2>
                        <p className="text-gray-500 mb-8">
                            เจ้าหน้าที่ได้รับเรื่องของท่านแล้ว<br />
                            เราจะดำเนินการตรวจสอบโดยเร็วที่สุด<br />
                            <span className="text-xs text-gray-400 mt-2 block">(ปิดหน้าต่างอัตโนมัติใน {timeLeft} วินาที)</span>
                        </p>
                        <Button variant="primary" className="w-full py-4 text-lg" onClick={handleClose}>
                            ปิดหน้าต่าง
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-bg pb-24 font-sans text-gray-900">
            <Head>
                <title>ยื่นคำร้อง - JSK 4.0</title>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>
            <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" strategy="beforeInteractive" />

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
                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && <Alert variant="danger" title="เกิดข้อผิดพลาด">{error}</Alert>}

                    {/* Section 1: Personal Info */}
                    <Card glass>
                        <CardHeader className="bg-gray-50/50 border-b border-gray-100 py-3">
                            <CardTitle className="text-sm flex items-center gap-2 text-gray-700 font-bold uppercase tracking-wider">
                                <User className="w-4 h-4 text-primary" /> ข้อมูลส่วนตัว
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4 pt-6">
                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-1">
                                    <label htmlFor="prefix" className="label-text">คำนำหน้า <span className="text-red-500">*</span></label>
                                    <input
                                        id="prefix"
                                        type="text"
                                        name="prefix"
                                        value={formData.prefix}
                                        onChange={handleChange}
                                        className={`input-field ${fieldErrors.prefix ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                                        placeholder="ระบุพิมพ์"
                                        required
                                    />
                                    {fieldErrors.prefix && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.prefix}</p>}
                                    <p className="text-[9px] text-gray-400 mt-1">*คำนำหน้ายาวให้ย่อ</p>
                                </div>
                                <div className="col-span-2">
                                    <label htmlFor="firstname" className="label-text">ชื่อ <span className="text-red-500">*</span></label>
                                    <input
                                        id="firstname"
                                        type="text"
                                        name="firstname"
                                        value={formData.firstname}
                                        onChange={handleChange}
                                        className={`input-field ${fieldErrors.firstname ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                                        placeholder="ระบุชื่อจริง"
                                        required
                                    />
                                    {fieldErrors.firstname && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.firstname}</p>}
                                </div>
                            </div>
                            <div>
                                <label htmlFor="lastname" className="label-text">นามสกุล <span className="text-red-500">*</span></label>
                                <input
                                    id="lastname"
                                    type="text"
                                    name="lastname"
                                    value={formData.lastname}
                                    onChange={handleChange}
                                    className={`input-field ${fieldErrors.lastname ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                                    placeholder="ระบุนามสกุล"
                                    required
                                />
                                {fieldErrors.lastname && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.lastname}</p>}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="phone" className="label-text">หมายเลขโทรศัพท์ <span className="text-red-500">*</span></label>
                                    <input
                                        id="phone"
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        className={`input-field ${fieldErrors.phone ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                                        placeholder="0xx-xxx-xxxx"
                                        maxLength={10}
                                        required
                                    />
                                    {fieldErrors.phone && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.phone}</p>}
                                </div>
                                <div>
                                    <label htmlFor="email" className="label-text">อีเมล (ถ้ามี)</label>
                                    <input
                                        id="email"
                                        type="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="name@example.com"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Section 2: Location */}
                    <Card glass>
                        <CardHeader className="bg-gray-50/50 border-b border-gray-100 py-3">
                            <CardTitle className="text-sm flex items-center gap-2 text-gray-700 font-bold uppercase tracking-wider">
                                <Building2 className="w-4 h-4 text-primary" /> สถานที่ / หน่วยงาน
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4 pt-6">
                            <div>
                                <label htmlFor="agency" className="label-text">หน่วยงาน <span className="text-red-500">*</span></label>
                                <select
                                    id="agency"
                                    name="agency"
                                    value={formData.agency}
                                    onChange={handleChange}
                                    className={`input-field ${fieldErrors.agency ? 'border-red-500 ring-1 ring-red-500' : ''}`}
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
                                <label htmlFor="province" className="label-text">จังหวัด <span className="text-red-500">*</span></label>
                                <select
                                    id="province"
                                    value={selectedProvinceId || ''}
                                    onChange={handleProvinceChange}
                                    className={`input-field ${fieldErrors.province ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                                    required
                                >
                                    <option value="">-- เลือกจังหวัด --</option>
                                    {provinces.map(p => <option key={p.PROVINCE_ID} value={p.PROVINCE_ID}>{p.PROVINCE_THAI}</option>)}
                                </select>
                                {fieldErrors.province && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.province}</p>}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="district" className="label-text flex items-center gap-1">
                                        อำเภอ/เขต <span className="text-red-500">*</span> {loadingDistricts && <Loader2 className="h-4 w-4 animate-spin text-brand-500" />}
                                    </label>
                                    <select
                                        id="district"
                                        value={selectedDistrictId || ''}
                                        onChange={handleDistrictChange}
                                        disabled={!selectedProvinceId}
                                        className={`input-field ${fieldErrors.district ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                                        required
                                    >
                                        <option value="">-- เลือก --</option>
                                        {districts.map(d => <option key={d.DISTRICT_ID} value={d.DISTRICT_ID}>{d.DISTRICT_THAI}</option>)}
                                    </select>
                                    {fieldErrors.district && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.district}</p>}
                                </div>
                                <div>
                                    <label htmlFor="sub_district" className="label-text flex items-center gap-1">
                                        ตำบล/แขวง <span className="text-red-500">*</span> {loadingSubDistricts && <Loader2 className="h-4 w-4 animate-spin text-brand-500" />}
                                    </label>
                                    <select
                                        id="sub_district"
                                        name="sub_district"
                                        onChange={handleSubDistrictChange}
                                        value={subDistricts.find(s => s.SUB_DISTRICT_THAI === formData.sub_district)?.SUB_DISTRICT_ID || ''}
                                        disabled={!selectedDistrictId}
                                        className={`input-field ${fieldErrors.sub_district ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                                        required
                                    >
                                        <option value="">-- เลือก --</option>
                                        {subDistricts.map(s => <option key={s.SUB_DISTRICT_ID} value={s.SUB_DISTRICT_ID}>{s.SUB_DISTRICT_THAI}</option>)}
                                    </select>
                                    {fieldErrors.sub_district && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.sub_district}</p>}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Section 3: Details */}
                    <Card glass>
                        <CardHeader className="bg-gray-50/50 border-b border-gray-100 py-3">
                            <CardTitle className="text-sm flex items-center gap-2 text-gray-700 font-bold uppercase tracking-wider">
                                <MessageSquare className="w-4 h-4 text-primary" /> รายละเอียดคำร้อง
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4 pt-6">
                            <div>
                                <label htmlFor="topic_category" className="label-text">เรื่องที่ขอรับความช่วยเหลือ <span className="text-red-500">*</span></label>
                                <select
                                    id="topic_category"
                                    name="topic_category"
                                    value={formData.topic_category}
                                    onChange={handleChange}
                                    className={`input-field ${fieldErrors.topic_category ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                                    required
                                >
                                    <option value="">-- เลือกหัวข้อ --</option>
                                    {Object.keys(TOPIC_OPTIONS).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                {fieldErrors.topic_category && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.topic_category}</p>}
                            </div>
                            {formData.topic_category && (
                                <div className="animate-in slide-in-from-top-2 duration-300">
                                    <label htmlFor="topic_subcategory" className="label-text">รายละเอียดเรื่อง <span className="text-red-500">*</span></label>
                                    <select
                                        id="topic_subcategory"
                                        name="topic_subcategory"
                                        value={formData.topic_subcategory}
                                        onChange={handleChange}
                                        className={`input-field ${fieldErrors.topic_subcategory ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                                        required
                                    >
                                        <option value="">-- เลือกรายละเอียด --</option>
                                        {TOPIC_OPTIONS[formData.topic_category].map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    {fieldErrors.topic_subcategory && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.topic_subcategory}</p>}
                                </div>
                            )}
                            <div>
                                <label htmlFor="description" className="label-text">รายละเอียดเพิ่มเติม <span className="text-red-500">*</span></label>
                                <textarea
                                    id="description"
                                    name="description"
                                    value={formData.description}
                                    onChange={handleChange}
                                    rows={4}
                                    className={`input-field resize-none ${fieldErrors.description ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                                    placeholder="ระบุรายละเอียดเหตุการณ์ หรือความประสงค์..."
                                    required
                                />
                                {fieldErrors.description && <p className="text-red-500 text-[10px] mt-1">{fieldErrors.description}</p>}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Section 4: Attachments */}
                    <Card glass>
                        <CardHeader className="bg-gray-50/50 border-b border-gray-100 py-3">
                            <CardTitle className="text-sm flex items-center gap-2 text-gray-700 font-bold uppercase tracking-wider">
                                <Paperclip className="w-4 h-4 text-primary" /> เอกสารแนบ
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4 pt-6">
                            <div className="flex flex-wrap gap-4 py-8 px-2 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50 justify-center">
                                {formData.attachments.length === 0 && (
                                    <div className="text-center w-full py-2">
                                        <p className="text-xs text-gray-400">ยังไม่มีไฟล์แนบ (ถ้ามี)</p>
                                    </div>
                                )}
                                {formData.attachments.map((file, idx) => (
                                    <div key={idx} className="relative group w-16 h-16 bg-white border border-gray-200 rounded-lg flex items-center justify-center shadow-sm">
                                        <button
                                            type="button"
                                            onClick={() => removeAttachment(idx)}
                                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-md active:scale-95 transition-transform"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                        <Paperclip className="w-5 h-5 text-gray-400" />
                                    </div>
                                ))}
                                <label className="w-16 h-16 border-2 border-dashed border-primary/30 rounded-lg flex flex-col items-center justify-center text-primary cursor-pointer hover:bg-primary/5 transition-all active:scale-95">
                                    <Upload className="w-5 h-5" />
                                    <span className="text-[8px] font-bold mt-1 uppercase">เพิ่มไฟล์</span>
                                    <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf" />
                                </label>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Actions */}
                    <div className="flex gap-4 pt-4 pb-12">
                        <Button
                            type="button"
                            variant="outline"
                            className="flex-1 py-6 text-lg font-medium border-2"
                            onClick={handleClose}
                        >
                            ยกเลิก
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            className="flex-[2] py-6 text-lg font-bold shadow-lg shadow-primary/20"
                            isLoading={submitting}
                        >
                            {submitting ? 'กำลังส่งข้อมูล...' : 'ยืนยันข้อมูล'}
                        </Button>
                    </div>
                </form>
            </main>

            {/* Confirmation Dialog */}
            {showConfirm && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-300" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
                    <Card glass className="w-full max-w-sm mb-4 sm:mb-0 shadow-2xl animate-in slide-in-from-bottom-4 duration-500 overflow-hidden">
                        <CardHeader className="text-center pb-2 bg-gray-50/50 pt-8">
                            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Shield className="w-8 h-8 text-primary" />
                            </div>
                            <CardTitle id="confirm-dialog-title" className="text-xl">ยืนยันการส่งข้อมูล</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                            <p className="text-center text-gray-500 text-sm">
                                กรุณาตรวจสอบข้อมูลให้ถูกต้อง<br />ก่อนทำการส่งคำร้องขอรับบริการ
                            </p>
                            <div className="flex flex-col gap-2 pt-2 pb-4">
                                <Button
                                    variant="primary"
                                    className="w-full py-4 font-bold text-lg"
                                    onClick={submitData}
                                    isLoading={submitting}
                                >
                                    ยืนยันและส่งข้อมูล
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="w-full py-4 text-gray-500"
                                    onClick={() => setShowConfirm(false)}
                                    disabled={submitting}
                                >
                                    กลับไปแก้ไข
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            <style jsx global>{`
                .label-text {
                    @apply block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide;
                }
                .input-field {
                    @apply w-full bg-white border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 outline-none transition-all;
                }
                .shadow-up {
                    box-shadow: 0 -4px 6px -1px rgba(0, 0, 0, 0.05);
                }
            `}</style>
        </div>
    )
}
