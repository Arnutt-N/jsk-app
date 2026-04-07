"use client"

import { useState, useEffect } from 'react'
import Head from 'next/head'
import Script from 'next/script'
import { Province, District, SubDistrict } from '../../../types/location'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

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
        "กรณีอุบัติเหตุอื่นๆ/ไม่ทราบผู้กระทำผิด",
        "อื่นๆ"
    ],
    "พยานในคดีอาญา": [
        "ค่าพาหนะ/ค่าที่พัก/ค่าอาหาร (พยาน)",
        "ค่าตอบแทนความเสียหาย (พยาน)",
        "การคุ้มครองพยาน"
    ],
    "ไกล่เกลี่ยระงับข้อพิพาท": [
        "หนี้สิน",
        "ที่ดิน",
        "มรดก",
        "อื่นๆ"
    ],
    "รับเรื่องราวร้องทุกข์": [
        "ขอถวายฎีกา/รื้อฟื้นคดี",
        "การบังคับคดี",
        "ความขัดแย้งกับหน่วยงานรัฐ",
        "อื่นๆ"
    ],
    "ให้คำปรึกษากฎหมาย": [
        "แพ่ง",
        "อาญา",
        "อื่นๆ"
    ]
}

export default function LiffServiceRequestV2() {
    interface LiffProfile {
        userId: string;
    }

    // --- STATE ---
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
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
                if (!liffId) {
                    throw new Error('LIFF ID is not specified in environment variables.')
                }

                // Check if LIFF SDK is loaded
                if (typeof window !== 'undefined' && window.liff) {
                    await window.liff.init({ liffId })
                    if (!window.liff.isLoggedIn()) {
                        window.liff.login()
                        return
                    }
                    const userProfile = await window.liff.getProfile()
                    setProfile(userProfile)
                } else {
                    console.warn("LIFF SDK not found. Running in browser mode?")
                    // Mock profile for dev if needed
                }
            } catch (err: unknown) {
                console.error('LIFF Init Error:', err)
                setError('Failed to initialize LIFF. You might be opening this outside LINE.')
            } finally {
                setLoading(false)
            }
        }

        const fetchProvinces = async () => {
            try {
                const res = await fetch('/api/v1/locations/provinces')
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

    // Handle Input Change
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)
        setError(null)

        try {
            const payload = {
                ...formData,
                line_user_id: profile?.userId || 'GUEST'
            }

            // Post to backend
            const res = await fetch('/api/v1/liff/service-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!res.ok) {
                const errData = await res.json()
                throw new Error(errData.detail || 'Failed to submit')
            }

            setSuccess(true)
            window.scrollTo(0, 0)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to submit')
            window.scrollTo(0, 0)
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <LoadingSpinner label="กำลังโหลด..." />
            </div>
        )
    }

    if (success) {
        return (
            <div className="min-h-screen p-4 bg-gray-50 flex items-center justify-center">
                <div className="bg-white rounded-2xl p-8 shadow-sm text-center max-w-sm w-full">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">บันทึกข้อมูลสำเร็จ</h2>
                    <p className="text-gray-500 mb-6">เจ้าหน้าที่ได้รับเรื่องของท่านแล้ว<br />เราจะดำเนินการตรวจสอบโดยเร็วที่สุด</p>
                    <button
                        onClick={() => window.liff?.closeWindow()}
                        className="w-full bg-gray-900 text-white py-3 rounded-xl font-medium"
                    >
                        ปิดหน้าต่าง
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-safe">
            <Head>
                <title>ยื่นคำร้องขอรับความช่วยเหลือ</title>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>
            <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" strategy="beforeInteractive" />

            <div className="bg-brand-600 border-b sticky top-0 z-50 px-4 py-3 text-white shadow-lg">
                <h1 className="text-lg font-bold">ยื่นคำร้อง (V2-Nationwide)</h1>
                <p className="text-xs opacity-80">ยุติธรรมจังหวัดสกลนคร | API: {provinces.length > 0 ? 'Connected' : 'Connecting...'}</p>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-6 max-w-lg mx-auto">
                {error && (
                    <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">
                        {error}
                    </div>
                )}

                {/* --- 1. ข้อมูลส่วนตัว --- */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-1 h-6 bg-primary rounded-full"></div>
                        <h2 className="text-sm font-semibold text-gray-900">ข้อมูลผู้ยื่นคำร้อง</h2>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-1">
                            <label htmlFor="prefix" className="block text-xs font-medium text-gray-700 mb-1">คำนำหน้า</label>
                            <select
                                id="prefix"
                                name="prefix"
                                value={formData.prefix}
                                onChange={handleChange}
                                className="w-full p-2.5 rounded-xl border-gray-200 bg-white text-sm focus:ring-2 focus:ring-black/5"
                                required
                            >
                                <option value="">เลือก</option>
                                <option value="นาย">นาย</option>
                                <option value="นาง">นาง</option>
                                <option value="นางสาว">นางสาว</option>
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label htmlFor="firstname" className="block text-xs font-medium text-gray-700 mb-1">ชื่อ</label>
                            <input
                                id="firstname"
                                type="text"
                                name="firstname"
                                value={formData.firstname}
                                onChange={handleChange}
                                className="w-full p-2.5 rounded-xl border-gray-200 bg-white text-sm"
                                placeholder="ชื่อจริง"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="lastname" className="block text-xs font-medium text-gray-700 mb-1">นามสกุล</label>
                        <input
                            id="lastname"
                            type="text"
                            name="lastname"
                            value={formData.lastname}
                            onChange={handleChange}
                            className="w-full p-2.5 rounded-xl border-gray-200 bg-white text-sm"
                            placeholder="นามสกุล"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="phone" className="block text-xs font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
                            <input
                                id="phone"
                                type="tel"
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                className="w-full p-2.5 rounded-xl border-gray-200 bg-white text-sm"
                                placeholder="0xx-xxx-xxxx"
                                maxLength={10}
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="email" className="block text-xs font-medium text-gray-700 mb-1">อีเมล (ถ้ามี)</label>
                            <input
                                id="email"
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                className="w-full p-2.5 rounded-xl border-gray-200 bg-white text-sm"
                                placeholder="name@example.com"
                            />
                        </div>
                    </div>
                </section>

                <hr className="border-dashed border-gray-200" />

                {/* --- 2. ข้อมูลสถานที่/หน่วยงาน --- */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-1 h-6 bg-primary rounded-full"></div>
                        <h2 className="text-sm font-semibold text-gray-900">สถานที่ / หน่วยงาน</h2>
                    </div>

                    <div>
                        <label htmlFor="agency" className="block text-xs font-medium text-gray-700 mb-1">หน่วยงานเจ้าของเรื่อง</label>
                        <select
                            id="agency"
                            name="agency"
                            value={formData.agency}
                            onChange={handleChange}
                            className="w-full p-2.5 rounded-xl border-gray-200 bg-white text-sm"
                            required
                        >
                            <option value="">-- เลือกหน่วยงาน --</option>
                            <option value="สำนักงานยุติธรรมจังหวัด">สำนักงานยุติธรรมจังหวัด</option>
                            <option value="ศูนย์ดำรงธรรม">ศูนย์ดำรงธรรม</option>
                            <option value="สถานีตำรวจภูธร">สถานีตำรวจภูธร</option>
                            <option value="ที่ว่าการอำเภอ">ที่ว่าการอำเภอ (ศูนย์ไกล่เกลี่ยฯ)</option>
                            <option value="อื่นๆ">อื่นๆ</option>
                        </select>
                    </div>

                    {/* Cascading Location: Province -> District -> SubDistrict */}
                    <div>
                        <label htmlFor="province" className="block text-xs font-medium text-gray-700 mb-1">จังหวัด</label>
                        <select
                            id="province"
                            value={selectedProvinceId || ''}
                            onChange={handleProvinceChange}
                            className="w-full p-2.5 rounded-xl border-gray-200 bg-white text-sm"
                            required
                        >
                            <option value="">-- เลือกจังหวัด --</option>
                            {provinces.map(p => (
                                <option key={p.PROVINCE_ID} value={p.PROVINCE_ID}>
                                    {p.PROVINCE_THAI}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="district" className="block text-xs font-medium text-gray-700 mb-1">
                                อำเภอ/เขต {loadingDistricts && "..."}
                            </label>
                            <select
                                id="district"
                                value={selectedDistrictId || ''}
                                onChange={handleDistrictChange}
                                disabled={!selectedProvinceId}
                                className="w-full p-2.5 rounded-xl border-gray-200 bg-white text-sm disabled:bg-gray-100 disabled:text-gray-400"
                                required
                            >
                                <option value="">-- เลือก --</option>
                                {districts.map(d => (
                                    <option key={d.DISTRICT_ID} value={d.DISTRICT_ID}>
                                        {d.DISTRICT_THAI}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="sub_district" className="block text-xs font-medium text-gray-700 mb-1">
                                ตำบล/แขวง {loadingSubDistricts && "..."}
                            </label>
                            <select
                                id="sub_district"
                                name="sub_district"
                                onChange={handleSubDistrictChange}
                                value={subDistricts.find(s => s.SUB_DISTRICT_THAI === formData.sub_district)?.SUB_DISTRICT_ID || ''}
                                disabled={!selectedDistrictId}
                                className="w-full p-2.5 rounded-xl border-gray-200 bg-white text-sm disabled:bg-gray-100 disabled:text-gray-400"
                            >
                                <option value="">-- เลือก --</option>
                                {subDistricts.map(s => (
                                    <option key={s.SUB_DISTRICT_ID} value={s.SUB_DISTRICT_ID}>
                                        {s.SUB_DISTRICT_THAI}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </section>

                <hr className="border-dashed border-gray-200" />

                {/* --- 3. รายละเอียดการขอรับบริการ --- */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-1 h-6 bg-primary rounded-full"></div>
                        <h2 className="text-sm font-semibold text-gray-900">รายละเอียดคำร้อง</h2>
                    </div>

                    <div>
                        <label htmlFor="topic_category" className="block text-xs font-medium text-gray-700 mb-1">เรื่องที่ขอรับความช่วยเหลือ</label>
                        <select
                            id="topic_category"
                            name="topic_category"
                            value={formData.topic_category}
                            onChange={handleChange}
                            className="w-full p-2.5 rounded-xl border-gray-200 bg-white text-sm"
                            required
                        >
                            <option value="">-- เลือกหัวข้อ --</option>
                            {Object.keys(TOPIC_OPTIONS).map(topic => (
                                <option key={topic} value={topic}>{topic}</option>
                            ))}
                        </select>
                    </div>

                    {formData.topic_category && TOPIC_OPTIONS[formData.topic_category] && (
                        <div className="animate-fade-in-up">
                            <label htmlFor="topic_subcategory" className="block text-xs font-medium text-gray-700 mb-1">รายละเอียดเรื่อง</label>
                            <select
                                id="topic_subcategory"
                                name="topic_subcategory"
                                value={formData.topic_subcategory}
                                onChange={handleChange}
                                className="w-full p-2.5 rounded-xl border-gray-200 bg-white text-sm"
                                required
                            >
                                <option value="">-- เลือกรายละเอียด --</option>
                                {TOPIC_OPTIONS[formData.topic_category].map(sub => (
                                    <option key={sub} value={sub}>{sub}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div>
                        <label htmlFor="description" className="block text-xs font-medium text-gray-700 mb-1">รายละเอียดเพิ่มเติม</label>
                        <textarea
                            id="description"
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows={4}
                            className="w-full p-3 rounded-xl border-gray-200 bg-white text-sm resize-none"
                            placeholder="ระบุรายละเอียดเหตุการณ์ หรือความประสงค์..."
                        />
                    </div>

                    {/* File Upload */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-2">เอกสารแนบ (รูปภาพ/PDF) - ถ้ามี</label>
                        <div className="flex gap-2 mb-2 overflow-x-auto pb-2">
                            {formData.attachments.map((file, idx) => (
                                <div key={file.id} className="relative flex-shrink-0 bg-gray-100 border rounded-lg p-2 w-24 h-24 flex flex-col items-center justify-center text-center">
                                    <button
                                        type="button"
                                        onClick={() => removeAttachment(idx)}
                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-sm"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                    <div className="text-xs text-gray-500 truncate w-full px-1">{file.name}</div>
                                </div>
                            ))}

                            <label className="flex-shrink-0 w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:bg-gray-50 active:bg-gray-100">
                                <svg className="w-8 h-8 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                </svg>
                                <span className="text-xs">เพิ่มไฟล์</span>
                                <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf" />
                            </label>
                        </div>
                    </div>
                </section>

                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-primary text-white font-bold py-3.5 rounded-xl shadow-lg shadow-primary/30 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {submitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                </button>

                <p className="text-center text-xs text-gray-400 pb-8">
                    ข้อมูลของท่านจะถูกเก็บเป็นความลับ <br />
                    และใช้เพื่อการดำเนินการให้ความช่วยเหลือเท่านั้น
                </p>
            </form>
        </div>
    )
}
