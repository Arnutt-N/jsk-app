'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, SquarePen, Trash2 } from 'lucide-react';
import { AdminTableHead, type AdminTableHeadColumn } from '@/components/admin/AdminTableHead';
import PageHeader from '@/app/admin/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { ActionIconButton } from '@/components/ui/ActionIconButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { getHttpStatusMessage } from '@/lib/api-error';
import { logger } from '@/lib/logger';

interface IntentCategory {
    id: number;
    name: string;
    description?: string;
    is_active: boolean;
    keyword_count: number;
    response_count: number;
    keywords_preview: string[];
}

type CreateMode = 'configure' | 'only';

interface Readiness {
    label: string;
    variant: 'warning' | 'danger';
}

const DUPLICATE_CATEGORY_MESSAGE = 'ชื่อ Category นี้ถูกใช้แล้ว หรือข้อมูลไม่ถูกต้อง';
const INCOMPLETE_CATEGORY_MESSAGE = 'ต้องมีอย่างน้อย 1 คีย์เวิร์ดและ 1 ข้อความตอบกลับก่อนเปิดใช้งาน';
const MISSING_CREATED_ID_MESSAGE = 'สร้าง Category แล้ว แต่ระบบยังไม่สามารถเปิดหน้าตั้งค่าต่อได้';

function getReadiness(category: IntentCategory): Readiness | null {
    const hasKeywords = category.keyword_count > 0;
    const hasResponses = category.response_count > 0;

    if (hasKeywords && hasResponses) return null;

    let label = 'ยังไม่พร้อมใช้งาน';
    if (hasKeywords && !hasResponses) label = 'ยังไม่มีข้อความตอบกลับ';
    if (!hasKeywords && hasResponses) label = 'ยังไม่มีคีย์เวิร์ด';

    return {
        label,
        variant: category.is_active ? 'danger' : 'warning',
    };
}

export default function IntentsPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [categories, setCategories] = useState<IntentCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [formData, setFormData] = useState({ name: '', description: '' });
    const [createError, setCreateError] = useState<string | null>(null);
    const [pendingMode, setPendingMode] = useState<CreateMode | null>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const tableColumns: AdminTableHeadColumn[] = [
        { key: 'category', label: 'Category' },
        { key: 'keywords', label: 'Keywords' },
        { key: 'status', label: 'สถานะ', align: 'center' },
        { key: 'actions', label: 'จัดการ', align: 'center' },
    ];

    const [confirmDelete, setConfirmDelete] = useState<{open: boolean; id: number | null}>({open: false, id: null});
    const API_BASE = '/api/v1';

    const resetCreateForm = () => {
        setFormData({ name: '', description: '' });
        setCreateError(null);
    };

    const fetchCategories = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/intents/categories`);
            if (res.ok) setCategories(await res.json());
        } catch (error) {
            logger.error('Error fetching categories:', error);
        } finally {
            setLoading(false);
        }
    }, [API_BASE]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void fetchCategories();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchCategories]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (pendingMode) return;

        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const mode: CreateMode = submitter?.value === 'only' ? 'only' : 'configure';
        const trimmedName = formData.name.trim();

        if (!trimmedName) {
            setCreateError(DUPLICATE_CATEGORY_MESSAGE);
            nameInputRef.current?.focus();
            return;
        }

        setPendingMode(mode);
        setCreateError(null);

        try {
            const res = await fetch(`${API_BASE}/admin/intents/categories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, name: trimmedName, is_active: false })
            });

            if (!res.ok) {
                const message = res.status === 400 ? DUPLICATE_CATEGORY_MESSAGE : getHttpStatusMessage(res.status);
                setCreateError(message);
                nameInputRef.current?.focus();
                return;
            }

            const created: Partial<IntentCategory> = await res.json().catch(() => ({}));

            if (mode === 'configure' && typeof created.id === 'number') {
                router.push(`/admin/auto-replies/${created.id}?created=1`);
                return;
            }

            await fetchCategories();
            setShowAddForm(false);
            resetCreateForm();

            if (mode === 'configure') {
                toast({
                    title: MISSING_CREATED_ID_MESSAGE,
                    variant: 'warning',
                });
            }
        } catch (error) {
            logger.error('Error creating category:', error);
            setCreateError(getHttpStatusMessage(0));
            nameInputRef.current?.focus();
        } finally {
            setPendingMode(null);
        }
    };

    const handleDelete = async (id: number) => {
        const res = await fetch(`${API_BASE}/admin/intents/categories/${id}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            fetchCategories();
        }
    };

    const handleToggleStatus = async (category: IntentCategory, isActive: boolean) => {
        if (isActive && (category.keyword_count === 0 || category.response_count === 0)) {
            toast({
                title: INCOMPLETE_CATEGORY_MESSAGE,
                variant: 'warning',
            });
            return;
        }

        const res = await fetch(`${API_BASE}/admin/intents/categories/${category.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: isActive })
        });

        if (res.ok) {
            fetchCategories();
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 thai-text">
            <PageHeader title="Intent Categories" subtitle="จัดการหมวดหมู่การตอบกลับอัตโนมัติ">
                <Button size="sm" onClick={() => setShowAddForm(true)}>
                    + New Category
                </Button>
            </PageHeader>

            <Modal
                isOpen={showAddForm}
                onClose={() => setShowAddForm(false)}
                title="เพิ่ม Category ใหม่"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="category-name" className="block text-sm font-medium text-text-secondary mb-1">
                            ชื่อ Category
                        </label>
                        <Input
                            id="category-name"
                            ref={nameInputRef}
                            type="text"
                            value={formData.name}
                            onChange={(e) => {
                                setFormData({ ...formData, name: e.target.value });
                                setCreateError(null);
                            }}
                            state={createError ? 'error' : 'default'}
                            aria-invalid={createError ? true : undefined}
                            aria-describedby={createError ? 'category-name-error' : undefined}
                            required
                        />
                        {createError && (
                            <p id="category-name-error" role="alert" className="mt-1.5 text-xs text-danger-text dark:text-danger-light">
                                {createError}
                            </p>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">คำอธิบาย</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="w-full px-4 py-2.5 border border-border-default rounded-xl text-sm text-text-primary bg-surface placeholder:text-text-tertiary transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500/20 hover:border-border-hover"
                            rows={3}
                        />
                    </div>
                    <div className="flex flex-col gap-2 pt-2">
                        <Button
                            type="submit"
                            name="intent-create-mode"
                            value="configure"
                            className="w-full"
                            disabled={pendingMode !== null}
                            isLoading={pendingMode === 'configure'}
                        >
                            สร้างและตั้งค่าต่อ
                        </Button>
                        <Button
                            type="submit"
                            name="intent-create-mode"
                            value="only"
                            variant="secondary"
                            className="w-full"
                            disabled={pendingMode !== null}
                            isLoading={pendingMode === 'only'}
                        >
                            สร้างอย่างเดียว
                        </Button>
                    </div>
                </form>
            </Modal>

            <div className="bg-surface rounded-2xl border border-border-default shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                        <AdminTableHead columns={tableColumns} />
                        <tbody className="divide-y divide-border-subtle">
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-5 py-4">
                                            <div className="h-4 bg-muted rounded w-32 mb-2 animate-pulse"></div>
                                            <div className="h-3 bg-muted/50 rounded w-48"></div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="h-3 bg-muted/50 rounded w-40"></div>
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            <div className="mx-auto h-4 w-7 bg-muted rounded-full"></div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center justify-center gap-1">
                                                <div className="h-8 w-8 bg-muted/50 rounded-lg"></div>
                                                <div className="h-8 w-8 bg-muted/50 rounded-lg"></div>
                                                <div className="h-8 w-8 bg-muted/50 rounded-lg"></div>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : categories.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-5 py-8 text-center text-text-tertiary text-sm">
                                        ยังไม่มี Category
                                    </td>
                                </tr>
                            ) : (
                                categories.map((category) => {
                                    const readiness = getReadiness(category);

                                    return (
                                        <tr key={category.id} className="hover:bg-bg/50 transition-colors">
                                            <td className="px-5 py-4">
                                                <div className="font-medium text-text-primary">{category.name}</div>
                                                {readiness && (
                                                    <Badge variant={readiness.variant} size="sm" className="mt-1">
                                                        {readiness.label}
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="px-5 py-4">
                                                {category.keywords_preview && category.keywords_preview.length > 0 ? (
                                                    <div className="text-sm text-text-secondary">
                                                        {category.keywords_preview.slice(0, 3).join(', ')}
                                                        {category.keyword_count > 3 && (
                                                            <span className="text-text-tertiary"> ...</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-text-tertiary">-</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <button
                                                    onClick={() => handleToggleStatus(category, !category.is_active)}
                                                    aria-label={category.is_active ? 'ปิดใช้งาน Category' : 'เปิดใช้งาน Category'}
                                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer focus-ring ${category.is_active ? 'bg-brand-500' : 'bg-border-hover'
                                                        }`}
                                                >
                                                    <span
                                                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${category.is_active ? 'translate-x-4' : 'translate-x-0.5'
                                                            }`}
                                                    />
                                                </button>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Link href={`/admin/auto-replies/${category.id}`}>
                                                        <ActionIconButton
                                                            icon={<Eye className="w-4 h-4" />}
                                                            label="เรียกดู"
                                                            variant="default"
                                                        />
                                                    </Link>
                                                    <Link href={`/admin/auto-replies/${category.id}?mode=edit`}>
                                                        <ActionIconButton
                                                            icon={<SquarePen className="w-4 h-4" />}
                                                            label="แก้ไข"
                                                            variant="muted"
                                                        />
                                                    </Link>
                                                    <ActionIconButton
                                                        icon={<Trash2 className="w-4 h-4" />}
                                                        label="ลบ"
                                                        variant="danger"
                                                        onClick={() => setConfirmDelete({open: true, id: category.id})}
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <ConfirmDialog
                isOpen={confirmDelete.open}
                onClose={() => setConfirmDelete({open: false, id: null})}
                onConfirm={() => { handleDelete(confirmDelete.id!); setConfirmDelete({open: false, id: null}); }}
                title="ยืนยันการลบ"
                description="ต้องการลบ Category นี้หรือไม่?"
                confirmText="ลบ"
                variant="danger"
            />
        </div>
    );
}
