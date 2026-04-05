'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Eye, SquarePen, Trash2 } from 'lucide-react';
import { AdminTableHead, type AdminTableHeadColumn } from '@/components/admin/AdminTableHead';
import PageHeader from '@/app/admin/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { ActionIconButton } from '@/components/ui/ActionIconButton';

interface IntentCategory {
    id: number;
    name: string;
    description?: string;
    is_active: boolean;
    keyword_count: number;
    response_count: number;
    keywords_preview: string[];
}

export default function IntentsPage() {
    const [categories, setCategories] = useState<IntentCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [formData, setFormData] = useState({ name: '', description: '', is_active: true });
    const tableColumns: AdminTableHeadColumn[] = [
        { key: 'category', label: 'Category' },
        { key: 'keywords', label: 'Keywords' },
        { key: 'status', label: 'สถานะ', align: 'center' },
        { key: 'actions', label: 'จัดการ', align: 'center' },
    ];

    const API_BASE = '/api/v1';

    const fetchCategories = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/intents/categories`);
            if (res.ok) setCategories(await res.json());
        } catch (error) {
            console.error('Error fetching categories:', error);
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch(`${API_BASE}/admin/intents/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        if (res.ok) {
            await fetchCategories();
            setShowAddForm(false);
            setFormData({ name: '', description: '', is_active: true });
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('ต้องการลบ Category นี้?')) return;

        const res = await fetch(`${API_BASE}/admin/intents/categories/${id}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            fetchCategories();
        }
    };

    const handleToggleStatus = async (id: number, isActive: boolean) => {
        const res = await fetch(`${API_BASE}/admin/intents/categories/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: isActive })
        });

        if (res.ok) {
            fetchCategories();
        }
    };
    return (
        <div className="space-y-5 animate-in fade-in duration-500 thai-text">
            {/* Header */}
            <PageHeader title="Intent Categories" subtitle="จัดการหมวดหมู่การตอบกลับอัตโนมัติ">
                <Button size="sm" onClick={() => setShowAddForm(true)}>
                    + New Category
                </Button>
            </PageHeader>

            {/* Add Form Modal */}
            <Modal
                isOpen={showAddForm}
                onClose={() => setShowAddForm(false)}
                title="เพิ่ม Category ใหม่"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">ชื่อ Category</label>
                        <Input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
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
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={formData.is_active}
                            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                            className="w-4 h-4 text-brand-600 rounded cursor-pointer focus-ring"
                        />
                        <label className="text-sm text-text-secondary">เปิดใช้งาน</label>
                    </div>
                    <div className="flex gap-2 pt-2">
                        <Button type="submit" className="flex-1">
                            บันทึก
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            className="flex-1"
                            onClick={() => setShowAddForm(false)}
                        >
                            ยกเลิก
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Table */}
            <div className="bg-surface rounded-2xl border border-border-default overflow-hidden shadow-sm">
                <table className="w-full">
                    <AdminTableHead columns={tableColumns} />
                    <tbody className="divide-y divide-border-subtle">
                        {loading ? (
                            // Skeleton Loading
                            [...Array(5)].map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td className="px-5 py-4">
                                        <div className="h-4 bg-border-default rounded w-32 mb-2 animate-pulse"></div>
                                        <div className="h-3 bg-border-subtle rounded w-48"></div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="h-3 bg-border-subtle rounded w-40"></div>
                                    </td>
                                    <td className="px-5 py-4 text-center">
                                        <div className="mx-auto h-4 w-7 bg-border-default rounded-full"></div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center justify-center gap-1">
                                            <div className="h-8 w-8 bg-bg rounded-lg"></div>
                                            <div className="h-8 w-8 bg-bg rounded-lg"></div>
                                            <div className="h-8 w-8 bg-bg rounded-lg"></div>
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
                            categories.map((category) => (
                                <tr key={category.id} className="hover:bg-bg/50 transition-colors">
                                    <td className="px-5 py-4">
                                        <div className="font-medium text-text-primary">{category.name}</div>
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
                                            onClick={() => handleToggleStatus(category.id, !category.is_active)}
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
                                                onClick={() => handleDelete(category.id)}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
