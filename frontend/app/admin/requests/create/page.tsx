'use client';
// Client Component required: useAuth() reads JWT from localStorage for API calls.
// To convert to RSC, auth must migrate to httpOnly cookies.

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useAuth } from '@/contexts/AuthContext';
import PageHeader from '@/app/admin/components/PageHeader';
import { TOPIC_OPTIONS, TOPIC_CATEGORY_OPTIONS } from '@/lib/constants/categories';
import { AGENCIES } from '@/lib/constants/agencies';
import { ThaiAddressCascade } from '@/components/forms/ThaiAddressCascade';
import {
    ArrowLeft,
    ArrowRight,
    Check,
    Save,
    ChevronLeft,
    Phone,
    FileText,
    MapPin,
    MessageSquare,
    X,
    Calendar,
    StickyNote,
    Flag,
    Building2,
} from 'lucide-react';

const CalendarPickerTH = dynamic(() => import('@/components/ui/CalendarPickerTH'));

// ---------- Zod Schema ----------

const requestSchema = z.object({
    source: z.string().default('PHONE'),
    source_other: z.string().optional(),
    prefix: z.string().default('นาย'),
    firstname: z.string().min(1, 'กรุณากรอกชื่อ'),
    lastname: z.string().min(1, 'กรุณากรอกนามสกุล'),
    phone_number: z.string().optional(),
    email: z.string().email('อีเมลไม่ถูกต้อง').optional().or(z.literal('')),
    topic_category: z.string().min(1, 'กรุณาเลือกหมวดหมู่'),
    topic_subcategory: z.string().optional(),
    description: z.string().min(10, 'กรุณากรอกรายละเอียดอย่างน้อย 10 ตัวอักษร'),
    priority: z.string().default('MEDIUM'),
    province: z.string().optional(),
    district: z.string().optional(),
    sub_district: z.string().optional(),
    agency: z.string().optional(),
    created_at: z.string().optional(),
    note: z.string().optional(),
});

type RequestFormValues = z.infer<typeof requestSchema>;

// ---------- Constants ----------

const SOURCE_OPTIONS = [
    { value: 'FORM', label: 'แบบฟอร์มคำร้อง' },
    { value: 'PHONE', label: 'โทรศัพท์ติดต่อ' },
    { value: 'FACEBOOK', label: 'Facebook' },
    { value: 'LINE', label: 'LINE' },
    { value: 'WALK_IN', label: 'Walk-in' },
    { value: 'OTHER', label: 'อื่นๆ' },
];

const PREFIX_OPTIONS = [
    { value: 'นาย', label: 'นาย' },
    { value: 'นาง', label: 'นาง' },
    { value: 'นางสาว', label: 'นางสาว' },
    { value: 'อื่นๆ', label: 'อื่นๆ' },
];

const PRIORITY_OPTIONS = [
    { value: 'LOW', label: 'LOW — ต่ำ' },
    { value: 'MEDIUM', label: 'MEDIUM — ปานกลาง' },
    { value: 'HIGH', label: 'HIGH — สูง' },
    { value: 'URGENT', label: 'URGENT — เร่งด่วน' },
];

// Order mirrors the LIFF request-v2 form: ผู้ร้อง → สถานที่/หน่วยงาน →
// รายละเอียด, so the final step holds the submit and address is filled before
// the request is created (previously address was last but felt skippable).
const STEPS = [
    { label: 'ข้อมูลผู้ร้อง & ช่องทาง', icon: Phone },
    { label: 'สถานที่ / หน่วยงาน', icon: MapPin },
    { label: 'รายละเอียดคำร้อง', icon: FileText },
];

// Fields validated per step before allowing navigation forward. Step 1
// (address/agency) is optional, so it has no gate. The required topic
// fields live in the final step and are validated by the zod resolver on
// submit.
const STEP_FIELDS: Record<number, (keyof RequestFormValues)[]> = {
    0: ['firstname', 'lastname', 'email'],
};

export default function CreateRequestPage() {
    const router = useRouter();
    const { token } = useAuth();

    const [step, setStep] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);

    const form = useForm<RequestFormValues>({
        resolver: zodResolver(requestSchema),
        defaultValues: {
            source: 'PHONE',
            source_other: '',
            prefix: 'นาย',
            firstname: '',
            lastname: '',
            phone_number: '',
            email: '',
            topic_category: 'แจ้งเบาะแสยาเสพติด',
            topic_subcategory: '',
            description: '',
            priority: 'MEDIUM',
            province: '',
            district: '',
            sub_district: '',
            agency: 'ผู้นำชุมชนและจิตอาสา',
            created_at: new Date().toISOString().split('T')[0],
            note: '',
        },
        mode: 'onTouched',
    });

    const { register, handleSubmit, trigger, watch, setValue, formState: { errors } } = form;

    const selectedCategory = watch('topic_category');
    const selectedSource = watch('source');
    const createdAtValue = watch('created_at');

    // Subcategory options depend on the selected category, so clear a stale
    // selection whenever the category changes (mirrors the LIFF cascade).
    useEffect(() => {
        setValue('topic_subcategory', '');
    }, [selectedCategory, setValue]);

    const API_BASE = '/api/v1';

    const handleNext = async () => {
        const fieldsToValidate = STEP_FIELDS[step];
        if (fieldsToValidate) {
            const valid = await trigger(fieldsToValidate);
            if (!valid) return;
        }
        if (step < 2) {
            setStep(prev => prev + 1);
        }
    };

    const handleBack = () => {
        if (step > 0) {
            setStep(prev => prev - 1);
        }
    };

    const handleDateChange = (iso: string | null) => {
        if (!iso) {
            setValue('created_at', '');
            return;
        }
        const d = new Date(iso);
        const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        setValue('created_at', ymd);
    };

    const onFormSubmit = () => {
        // Show confirmation modal instead of submitting directly
        setShowConfirm(true);
    };

    const doSubmit = async (data: RequestFormValues) => {
        setSubmitting(true);
        setError(null);
        setShowConfirm(false);

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const { created_at, source_other, ...rest } = data;
            const payload = {
                ...rest,
                // If source is OTHER, append the custom text
                ...(rest.source === 'OTHER' && source_other ? { source: source_other } : {}),
                ...(created_at ? { created_at: new Date(`${created_at}T00:00:00`).toISOString() } : {}),
            };

            const res = await fetch(`${API_BASE}/admin/requests`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => null);
                const message = errorData?.detail || `เกิดข้อผิดพลาด (${res.status})`;
                throw new Error(message);
            }

            router.push('/admin/requests');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'ไม่สามารถสร้างคำร้องได้ กรุณาลองใหม่';
            setError(message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 thai-text">
            {/* Page Header */}
            <PageHeader title="สร้างคำร้องใหม่" subtitle="บันทึกคำร้องจากช่องทางอื่น เช่น โทรศัพท์ แบบฟอร์ม Facebook LINE Walk-in">
                <Link href="/admin/requests">
                    <Button variant="outline" size="sm" leftIcon={<ChevronLeft className="w-4 h-4" />}>
                        กลับ
                    </Button>
                </Link>
            </PageHeader>

            {/* Step Indicator */}
            <div className="flex items-center justify-center gap-2">
                {STEPS.map((s, i) => {
                    const Icon = s.icon;
                    const isActive = i === step;
                    const isCompleted = i < step;

                    return (
                        <div key={i} className="flex items-center gap-2">
                            {i > 0 && (
                                <div className={`w-8 h-0.5 rounded-full transition-colors ${isCompleted ? 'bg-brand-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    if (i < step) setStep(i);
                                }}
                                className={`
                                    flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all
                                    ${isActive
                                        ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/30'
                                        : isCompleted
                                            ? 'bg-success/10 text-success cursor-pointer hover:bg-success/20'
                                            : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500 cursor-default'
                                    }
                                `}
                                disabled={i > step}
                                aria-current={isActive ? 'step' : undefined}
                            >
                                {isCompleted ? (
                                    <Check className="w-4 h-4" />
                                ) : (
                                    <Icon className="w-4 h-4" />
                                )}
                                <span className="hidden sm:inline">{s.label}</span>
                                <span className="sm:hidden">{i + 1}</span>
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Form Card */}
            <Card glass className="border-none shadow-sm max-w-2xl mx-auto">
                <CardContent className="p-6">
                    <form onSubmit={handleSubmit(onFormSubmit)}>
                        {/* Step 0: ข้อมูลผู้ร้อง & ช่องทาง */}
                        {step === 0 && (
                            <div className="space-y-5">
                                <h2 className="text-lg font-bold text-text-primary">ข้อมูลผู้ร้อง & ช่องทาง</h2>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1.5">
                                            <Phone className="w-3.5 h-3.5 text-text-tertiary" />
                                            ช่องทางรับเรื่อง
                                        </label>
                                        <Select
                                            {...register('source')}
                                            options={SOURCE_OPTIONS}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1.5">
                                            <Calendar className="w-3.5 h-3.5 text-text-tertiary" />
                                            วันที่รับเรื่อง
                                        </label>
                                        <CalendarPickerTH
                                            value={createdAtValue ? new Date(`${createdAtValue}T00:00:00`).toISOString() : null}
                                            onChange={handleDateChange}
                                        />
                                    </div>
                                </div>

                                {/* Show "other" channel input when อื่นๆ is selected */}
                                {selectedSource === 'OTHER' && (
                                    <div className="animate-in slide-in-from-top-2">
                                        <label className="block text-xs font-medium text-text-secondary mb-1.5">
                                            ระบุช่องทาง <span className="text-danger">*</span>
                                        </label>
                                        <Input
                                            {...register('source_other')}
                                            placeholder="ระบุช่องทางรับเรื่อง..."
                                        />
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1.5">คำนำหน้า</label>
                                        <Select
                                            {...register('prefix')}
                                            options={PREFIX_OPTIONS}
                                        />
                                    </div>
                                    <div>{/* spacer */}</div>

                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1.5">
                                            ชื่อ <span className="text-danger">*</span>
                                        </label>
                                        <Input
                                            {...register('firstname')}
                                            placeholder="ชื่อจริง"
                                            state={errors.firstname ? 'error' : 'default'}
                                            errorMessage={errors.firstname?.message}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1.5">
                                            นามสกุล <span className="text-danger">*</span>
                                        </label>
                                        <Input
                                            {...register('lastname')}
                                            placeholder="นามสกุล"
                                            state={errors.lastname ? 'error' : 'default'}
                                            errorMessage={errors.lastname?.message}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1.5">
                                            <Phone className="w-3.5 h-3.5 text-text-tertiary" />
                                            เบอร์โทรศัพท์
                                        </label>
                                        <Input
                                            type="tel"
                                            {...register('phone_number')}
                                            placeholder="0xx-xxx-xxxx"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1.5">
                                            <MessageSquare className="w-3.5 h-3.5 text-text-tertiary" />
                                            อีเมล
                                        </label>
                                        <Input
                                            type="email"
                                            {...register('email')}
                                            placeholder="email@example.com"
                                            state={errors.email ? 'error' : 'default'}
                                            errorMessage={errors.email?.message}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 2: รายละเอียดคำร้อง (final step — submit lives here) */}
                        {step === 2 && (
                            <div className="space-y-5">
                                <h2 className="text-lg font-bold text-text-primary">รายละเอียดคำร้อง</h2>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1.5">หมวดหมู่</label>
                                        <Select
                                            {...register('topic_category')}
                                            options={TOPIC_CATEGORY_OPTIONS}
                                            state={errors.topic_category ? 'error' : 'default'}
                                            errorMessage={errors.topic_category?.message}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1.5">หมวดหมู่ย่อย</label>
                                        {TOPIC_OPTIONS[selectedCategory]?.length ? (
                                            <Select
                                                options={TOPIC_OPTIONS[selectedCategory].map((s) => ({ value: s, label: s }))}
                                                value={watch('topic_subcategory') || ''}
                                                onChange={(e) => setValue('topic_subcategory', e.target.value)}
                                                placeholder="-- เลือกรายละเอียด --"
                                            />
                                        ) : (
                                            <Input
                                                {...register('topic_subcategory')}
                                                placeholder="ระบุหมวดหมู่ย่อย (ถ้ามี)"
                                            />
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-text-secondary mb-1.5">
                                        รายละเอียด <span className="text-danger">*</span>
                                    </label>
                                    <Textarea
                                        {...register('description')}
                                        placeholder="อธิบายรายละเอียดของคำร้อง..."
                                        size="lg"
                                        state={errors.description ? 'error' : 'default'}
                                        errorMessage={errors.description?.message}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1.5">
                                        <Flag className="w-3.5 h-3.5 text-text-tertiary" />
                                        ความเร่งด่วน
                                    </label>
                                    <Select
                                        {...register('priority')}
                                        options={PRIORITY_OPTIONS}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1.5">
                                        <StickyNote className="w-3.5 h-3.5 text-text-tertiary" />
                                        หมายเหตุ
                                    </label>
                                    <Textarea
                                        {...register('note')}
                                        placeholder="บันทึกเพิ่มเติม (ถ้ามี)..."
                                        rows={3}
                                        className="w-full p-3 bg-bg border border-border-default rounded-xl text-sm outline-none focus:border-primary/40 focus:bg-surface focus:ring-4 focus:ring-primary/10 transition-all resize-none"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Step 1: สถานที่ / หน่วยงาน — cascade dropdowns mirroring LIFF */}
                        {step === 1 && (
                            <div className="space-y-5">
                                <h2 className="text-lg font-bold text-text-primary">สถานที่ / หน่วยงาน</h2>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1.5">
                                            <Building2 className="w-3.5 h-3.5 text-text-tertiary" />
                                            หน่วยงานที่รับผิดชอบ
                                        </label>
                                        <Select
                                            {...register('agency')}
                                            options={[...AGENCIES]}
                                            placeholder="-- เลือกหน่วยงาน --"
                                        />
                                    </div>

                                    {/* จังหวัด → อำเภอ/เขต → ตำบล/แขวง (reuse ThaiAddressCascade) */}
                                    <ThaiAddressCascade
                                        labelClassName="block text-xs font-medium text-text-secondary mb-1.5"
                                        value={{
                                            province: watch('province') || '',
                                            district: watch('district') || '',
                                            sub_district: watch('sub_district') || '',
                                        }}
                                        onChange={(addr) => {
                                            setValue('province', addr.province);
                                            setValue('district', addr.district);
                                            setValue('sub_district', addr.sub_district);
                                        }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Error Display */}
                        {error && (
                            <div className="mt-4 p-3 bg-danger/10 text-danger-text rounded-xl text-sm">
                                {error}
                            </div>
                        )}

                        {/* Navigation Buttons */}
                        <div className="flex items-center justify-between mt-8 pt-5 border-t border-border-default">
                            {step > 0 ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleBack}
                                    leftIcon={<ArrowLeft className="w-4 h-4" />}
                                >
                                    ย้อนกลับ
                                </Button>
                            ) : (
                                <div />
                            )}

                            <div className="flex items-center gap-3">
                                <Link href="/admin/requests">
                                    <Button type="button" variant="ghost" leftIcon={<X className="w-4 h-4" />}>
                                        ยกเลิก
                                    </Button>
                                </Link>
                                {step < 2 ? (
                                    <Button
                                        type="button"
                                        variant="primary"
                                        onClick={handleNext}
                                        rightIcon={<ArrowRight className="w-4 h-4" />}
                                    >
                                        ถัดไป
                                    </Button>
                                ) : (
                                    <Button
                                        type="submit"
                                        variant="primary"
                                        leftIcon={<Save className="w-4 h-4" />}
                                    >
                                        บันทึกคำร้อง
                                    </Button>
                                )}
                            </div>
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* Confirmation Modal */}
            {showConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="confirm-create-title">
                    <Card className="w-full max-w-sm shadow-2xl">
                        <CardHeader className="text-center pb-2">
                            <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4 text-brand-600">
                                <MessageSquare className="w-6 h-6" />
                            </div>
                            <CardTitle id="confirm-create-title" className="text-lg">ยืนยันสร้างคำร้อง</CardTitle>
                        </CardHeader>
                        <CardContent className="text-center space-y-4">
                            <p className="text-sm text-text-secondary">
                                กรุณาตรวจสอบข้อมูลให้ถูกต้อง<br />
                                เมื่อกดบันทึกแล้วคำร้องจะเข้าสู่ระบบทันที
                            </p>
                            <div className="flex gap-3 pt-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="flex-1"
                                    onClick={() => setShowConfirm(false)}
                                    leftIcon={<X className="w-4 h-4" />}
                                >
                                    ยกเลิก
                                </Button>
                                <Button
                                    type="button"
                                    variant="primary"
                                    className="flex-1"
                                    onClick={handleSubmit(doSubmit)}
                                    isLoading={submitting}
                                    loadingText="กำลังบันทึก..."
                                    leftIcon={<Save className="w-4 h-4" />}
                                >
                                    ยืนยันบันทึก
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
