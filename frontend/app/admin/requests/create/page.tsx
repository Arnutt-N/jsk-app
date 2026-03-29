'use client';
// Client Component required: useAuth() reads JWT from localStorage for API calls.
// To convert to RSC, auth must migrate to httpOnly cookies.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useAuth } from '@/contexts/AuthContext';
import PageHeader from '@/app/admin/components/PageHeader';
import {
    ArrowLeft,
    ArrowRight,
    Check,
    ChevronLeft,
    Phone,
    FileText,
    MapPin,
} from 'lucide-react';

// ---------- Zod Schema ----------

const requestSchema = z.object({
    source: z.string().default('PHONE'),
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
});

type RequestFormValues = z.infer<typeof requestSchema>;

// ---------- Constants ----------

const SOURCE_OPTIONS = [
    { value: 'PHONE', label: 'โทรศัพท์' },
    { value: 'PAPER', label: 'กระดาษ' },
    { value: 'WALK_IN', label: 'Walk-in' },
    { value: 'ADMIN', label: 'อื่นๆ' },
];

const PREFIX_OPTIONS = [
    { value: 'นาย', label: 'นาย' },
    { value: 'นาง', label: 'นาง' },
    { value: 'นางสาว', label: 'นางสาว' },
    { value: 'อื่นๆ', label: 'อื่นๆ' },
];

const CATEGORY_OPTIONS = [
    { value: 'ร้องเรียน', label: 'ร้องเรียน' },
    { value: 'ร้องทุกข์', label: 'ร้องทุกข์' },
    { value: 'แจ้งเบาะแส', label: 'แจ้งเบาะแส' },
    { value: 'ขอความช่วยเหลือ', label: 'ขอความช่วยเหลือ' },
    { value: 'อื่นๆ', label: 'อื่นๆ' },
];

const PRIORITY_OPTIONS = [
    { value: 'LOW', label: 'LOW — ต่ำ' },
    { value: 'MEDIUM', label: 'MEDIUM — ปานกลาง' },
    { value: 'HIGH', label: 'HIGH — สูง' },
    { value: 'URGENT', label: 'URGENT — เร่งด่วน' },
];

const STEPS = [
    { label: 'ข้อมูลผู้ร้อง', icon: Phone },
    { label: 'รายละเอียดคำร้อง', icon: FileText },
    { label: 'ที่อยู่ / หน่วยงาน', icon: MapPin },
];

// Fields validated per step before allowing navigation forward
const STEP_FIELDS: Record<number, (keyof RequestFormValues)[]> = {
    0: ['firstname', 'lastname', 'email'],
    1: ['topic_category', 'description'],
};

export default function CreateRequestPage() {
    const router = useRouter();
    const { token } = useAuth();

    const [step, setStep] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const form = useForm<RequestFormValues>({
        resolver: zodResolver(requestSchema),
        defaultValues: {
            source: 'PHONE',
            prefix: 'นาย',
            firstname: '',
            lastname: '',
            phone_number: '',
            email: '',
            topic_category: 'ร้องเรียน',
            topic_subcategory: '',
            description: '',
            priority: 'MEDIUM',
            province: '',
            district: '',
            sub_district: '',
            agency: '',
        },
        mode: 'onTouched',
    });

    const { register, handleSubmit, trigger, formState: { errors } } = form;

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

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

    const onSubmit = async (data: RequestFormValues) => {
        setSubmitting(true);
        setError(null);

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const res = await fetch(`${API_BASE}/admin/requests`, {
                method: 'POST',
                headers,
                body: JSON.stringify(data),
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
            <PageHeader title="สร้างคำร้องใหม่" subtitle="บันทึกคำร้องจากช่องทางอื่น เช่น โทรศัพท์ กระดาษ หรือ Walk-in">
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
                                    // อนุญาตให้กดกลับไปขั้นตอนก่อนหน้าได้
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
                    <form onSubmit={handleSubmit(onSubmit)}>
                        {/* Step 0: ข้อมูลผู้ร้อง */}
                        {step === 0 && (
                            <div className="space-y-5">
                                <h2 className="text-lg font-bold text-text-primary">ข้อมูลผู้ร้อง & ช่องทาง</h2>

                                <div>
                                    <label className="block text-xs font-medium text-text-secondary mb-1.5">ช่องทางรับเรื่อง</label>
                                    <Select
                                        {...register('source')}
                                        options={SOURCE_OPTIONS}
                                    />
                                </div>

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
                                        <label className="block text-xs font-medium text-text-secondary mb-1.5">เบอร์โทรศัพท์</label>
                                        <Input
                                            type="tel"
                                            {...register('phone_number')}
                                            placeholder="0xx-xxx-xxxx"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1.5">อีเมล</label>
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

                        {/* Step 1: รายละเอียดคำร้อง */}
                        {step === 1 && (
                            <div className="space-y-5">
                                <h2 className="text-lg font-bold text-text-primary">รายละเอียดคำร้อง</h2>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1.5">หมวดหมู่</label>
                                        <Select
                                            {...register('topic_category')}
                                            options={CATEGORY_OPTIONS}
                                            state={errors.topic_category ? 'error' : 'default'}
                                            errorMessage={errors.topic_category?.message}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1.5">หมวดหมู่ย่อย</label>
                                        <Input
                                            {...register('topic_subcategory')}
                                            placeholder="ระบุหมวดหมู่ย่อย (ถ้ามี)"
                                        />
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
                                    <label className="block text-xs font-medium text-text-secondary mb-1.5">ความเร่งด่วน</label>
                                    <Select
                                        {...register('priority')}
                                        options={PRIORITY_OPTIONS}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Step 2: ที่อยู่ / หน่วยงาน */}
                        {step === 2 && (
                            <div className="space-y-5">
                                <h2 className="text-lg font-bold text-text-primary">ที่อยู่ / หน่วยงาน</h2>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1.5">จังหวัด</label>
                                        <Input
                                            {...register('province')}
                                            placeholder="จังหวัด"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1.5">อำเภอ / เขต</label>
                                        <Input
                                            {...register('district')}
                                            placeholder="อำเภอ / เขต"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1.5">ตำบล / แขวง</label>
                                        <Input
                                            {...register('sub_district')}
                                            placeholder="ตำบล / แขวง"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1.5">หน่วยงานที่รับผิดชอบ</label>
                                        <Input
                                            {...register('agency')}
                                            placeholder="หน่วยงาน"
                                        />
                                    </div>
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
                                    variant="success"
                                    isLoading={submitting}
                                    loadingText="กำลังบันทึก..."
                                    leftIcon={<Check className="w-4 h-4" />}
                                >
                                    บันทึกคำร้อง
                                </Button>
                            )}
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
