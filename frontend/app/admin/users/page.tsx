'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
    Users, Shield, UserCog, User, UserPlus,
    Search, Edit2, Trash2, Key,
    ToggleLeft, ToggleRight, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ModalAlert } from '@/components/ui/ModalAlert';
import StatsCard from '../components/StatsCard';
import { StaggerContainer, StaggerItem } from '@/components/ui/PageTransition';

/* ── Types ─────────────────────────────────────────────────────────── */

interface UserRecord {
    id: number;
    username: string | null;
    email: string | null;
    display_name: string | null;
    picture_url: string | null;
    role: string;
    is_active: boolean;
    line_user_id: string | null;
    created_at: string | null;
    updated_at: string | null;
}

interface UserStats {
    total: number;
    active: number;
    inactive: number;
    super_admins: number;
    admins: number;
    agents: number;
    users: number;
}

interface UserListResponse {
    users: UserRecord[];
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const ROLE_BADGE: Record<string, { variant: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'gray'; label: string }> = {
    SUPER_ADMIN: { variant: 'primary', label: 'Super Admin' },
    ADMIN: { variant: 'info', label: 'Admin' },
    AGENT: { variant: 'success', label: 'Agent' },
    USER: { variant: 'gray', label: 'User' },
};

const ROLE_OPTIONS: SelectOption[] = [
    { value: '', label: 'ทุกบทบาท' },
    { value: 'SUPER_ADMIN', label: 'Super Admin' },
    { value: 'ADMIN', label: 'Admin' },
    { value: 'AGENT', label: 'Agent' },
    { value: 'USER', label: 'User' },
];

const STATUS_OPTIONS: SelectOption[] = [
    { value: '', label: 'ทุกสถานะ' },
    { value: 'true', label: 'ใช้งานอยู่' },
    { value: 'false', label: 'ปิดใช้งาน' },
];

const CREATE_ROLE_OPTIONS: SelectOption[] = [
    { value: 'AGENT', label: 'Agent (เจ้าหน้าที่)' },
    { value: 'ADMIN', label: 'Admin (แอดมิน)' },
    { value: 'SUPER_ADMIN', label: 'Super Admin' },
];

const PER_PAGE = 20;

/* ── Component ─────────────────────────────────────────────────────── */

export default function UsersPage() {
    const { token, user: currentUser } = useAuth();

    const [users, setUsers] = useState<UserRecord[]>([]);
    const [stats, setStats] = useState<UserStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    // Filters
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Create modal
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({ username: '', password: '', display_name: '', email: '', role: 'AGENT' });
    const [createLoading, setCreateLoading] = useState(false);
    const [createError, setCreateError] = useState('');

    // Edit modal
    const [editUser, setEditUser] = useState<UserRecord | null>(null);
    const [editForm, setEditForm] = useState({ display_name: '', email: '', role: '', is_active: true, password: '' });
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError] = useState('');

    // Delete confirm
    const [deleteUser, setDeleteUser] = useState<UserRecord | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // Reset password
    const [resetUser, setResetUser] = useState<UserRecord | null>(null);
    const [resetPassword, setResetPassword] = useState('');
    const [resetLoading, setResetLoading] = useState(false);
    const [resetError, setResetError] = useState('');

    // Alert
    const [alert, setAlert] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null);

    const API_BASE = '/api/v1';
    const authHeaders = useMemo(() => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        return headers;
    }, [token]);

    /* ── Fetch ──────────────────────────────────────────────────────── */

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('page', String(page));
            params.set('per_page', String(PER_PAGE));
            if (roleFilter) params.set('role', roleFilter);
            if (statusFilter) params.set('is_active', statusFilter);
            if (search) params.set('search', search);

            const res = await fetch(`${API_BASE}/admin/users?${params}`, { headers: authHeaders });
            if (res.ok) {
                const data: UserListResponse = await res.json();
                setUsers(data.users);
                setTotalPages(data.total_pages);
                setTotal(data.total);
            }
        } catch (e) {
            console.error('Failed to fetch users', e);
        } finally {
            setLoading(false);
        }
    }, [API_BASE, authHeaders, page, roleFilter, statusFilter, search]);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/users/stats`, { headers: authHeaders });
            if (res.ok) setStats(await res.json());
        } catch (e) {
            console.error('Failed to fetch stats', e);
        }
    }, [API_BASE, authHeaders]);

    useEffect(() => { fetchStats(); }, [fetchStats]);
    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    // Reset page when filters change
    useEffect(() => { setPage(1); }, [roleFilter, statusFilter, search]);

    /* ── Actions ────────────────────────────────────────────────────── */

    const handleCreate = async () => {
        setCreateError('');
        if (!createForm.username || !createForm.password || !createForm.display_name) {
            setCreateError('กรุณากรอกข้อมูลที่จำเป็นให้ครบ');
            return;
        }
        if (createForm.password.length < 8) {
            setCreateError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
            return;
        }
        setCreateLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/users`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(createForm),
            });
            if (res.ok) {
                setShowCreate(false);
                setCreateForm({ username: '', password: '', display_name: '', email: '', role: 'AGENT' });
                setAlert({ type: 'success', title: 'สำเร็จ', message: 'สร้างผู้ใช้ใหม่เรียบร้อยแล้ว' });
                fetchUsers();
                fetchStats();
            } else {
                const err = await res.json();
                setCreateError(err.detail || 'เกิดข้อผิดพลาด');
            }
        } catch {
            setCreateError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
        } finally {
            setCreateLoading(false);
        }
    };

    const handleEdit = async () => {
        if (!editUser) return;
        setEditError('');
        setEditLoading(true);
        try {
            const payload: Record<string, unknown> = {};
            if (editForm.display_name !== (editUser.display_name || '')) payload.display_name = editForm.display_name;
            if (editForm.email !== (editUser.email || '')) payload.email = editForm.email || null;
            if (editForm.role !== editUser.role) payload.role = editForm.role;
            if (editForm.is_active !== editUser.is_active) payload.is_active = editForm.is_active;
            if (editForm.password) payload.password = editForm.password;

            const res = await fetch(`${API_BASE}/admin/users/${editUser.id}`, {
                method: 'PUT',
                headers: authHeaders,
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                setEditUser(null);
                setAlert({ type: 'success', title: 'สำเร็จ', message: 'อัปเดตข้อมูลผู้ใช้เรียบร้อยแล้ว' });
                fetchUsers();
                fetchStats();
            } else {
                const err = await res.json();
                setEditError(err.detail || 'เกิดข้อผิดพลาด');
            }
        } catch {
            setEditError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
        } finally {
            setEditLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteUser) return;
        setDeleteLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/users/${deleteUser.id}`, {
                method: 'DELETE',
                headers: authHeaders,
            });
            if (res.ok) {
                setDeleteUser(null);
                setAlert({ type: 'success', title: 'สำเร็จ', message: 'ลบผู้ใช้เรียบร้อยแล้ว' });
                fetchUsers();
                fetchStats();
            } else {
                const err = await res.json();
                setDeleteUser(null);
                setAlert({ type: 'error', title: 'ไม่สำเร็จ', message: err.detail || 'ไม่สามารถลบผู้ใช้ได้' });
            }
        } catch {
            setDeleteUser(null);
            setAlert({ type: 'error', title: 'ไม่สำเร็จ', message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' });
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!resetUser) return;
        setResetError('');
        if (resetPassword.length < 8) {
            setResetError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
            return;
        }
        setResetLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/users/${resetUser.id}/reset-password`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ new_password: resetPassword }),
            });
            if (res.ok) {
                setResetUser(null);
                setResetPassword('');
                setAlert({ type: 'success', title: 'สำเร็จ', message: 'รีเซ็ตรหัสผ่านเรียบร้อยแล้ว' });
            } else {
                const err = await res.json();
                setResetError(err.detail || 'เกิดข้อผิดพลาด');
            }
        } catch {
            setResetError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
        } finally {
            setResetLoading(false);
        }
    };

    const openEdit = (u: UserRecord) => {
        setEditUser(u);
        setEditForm({
            display_name: u.display_name || '',
            email: u.email || '',
            role: u.role,
            is_active: u.is_active,
            password: '',
        });
        setEditError('');
    };

    /* ── Password strength ──────────────────────────────────────────── */

    function passwordStrength(pw: string): { level: number; label: string; color: string } {
        if (!pw) return { level: 0, label: '', color: '' };
        let score = 0;
        if (pw.length >= 8) score++;
        if (pw.length >= 12) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;

        if (score <= 1) return { level: 1, label: 'อ่อน', color: 'bg-red-500' };
        if (score <= 2) return { level: 2, label: 'ปานกลาง', color: 'bg-amber-500' };
        if (score <= 3) return { level: 3, label: 'ดี', color: 'bg-blue-500' };
        return { level: 4, label: 'แข็งแรง', color: 'bg-green-500' };
    }

    /* ── Filtered role options for create based on current user ────── */

    const allowedCreateRoles = useMemo(() => {
        if (!currentUser) return [];
        if (currentUser.role === 'SUPER_ADMIN') return CREATE_ROLE_OPTIONS;
        if (currentUser.role === 'ADMIN') return CREATE_ROLE_OPTIONS.filter(o => o.value === 'AGENT');
        return [];
    }, [currentUser]);

    /* ── Render ─────────────────────────────────────────────────────── */

    return (
        <div className="p-6 max-w-7xl mx-auto thai-text space-y-6 animate-fade-in-up">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary tracking-tight thai-no-break">จัดการผู้ใช้งาน</h1>
                    <p className="text-text-secondary text-sm mt-0.5">User Management &mdash; จัดการผู้ใช้ระบบทั้งหมด</p>
                </div>
                {allowedCreateRoles.length > 0 && (
                    <Button
                        variant="primary"
                        leftIcon={<UserPlus className="w-4 h-4" />}
                        onClick={() => {
                            setShowCreate(true);
                            setCreateError('');
                            setCreateForm({ username: '', password: '', display_name: '', email: '', role: allowedCreateRoles[0]?.value || 'AGENT' });
                        }}
                    >
                        เพิ่มผู้ใช้ใหม่
                    </Button>
                )}
            </div>

            {/* Stats Cards */}
            <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                <StaggerItem>
                    <StatsCard
                        title="ผู้ใช้ทั้งหมด"
                        value={stats?.total ?? 0}
                        icon={<Users className="w-6 h-6" />}
                        color="primary"
                        description={`ใช้งาน ${stats?.active ?? 0} / ปิด ${stats?.inactive ?? 0}`}
                    />
                </StaggerItem>
                <StaggerItem>
                    <StatsCard
                        title="แอดมิน"
                        value={(stats?.super_admins ?? 0) + (stats?.admins ?? 0)}
                        icon={<Shield className="w-6 h-6" />}
                        color="navy"
                        description={`Super ${stats?.super_admins ?? 0} / Admin ${stats?.admins ?? 0}`}
                    />
                </StaggerItem>
                <StaggerItem>
                    <StatsCard
                        title="เจ้าหน้าที่"
                        value={stats?.agents ?? 0}
                        icon={<UserCog className="w-6 h-6" />}
                        color="success"
                        description="Agent operators"
                    />
                </StaggerItem>
                <StaggerItem>
                    <StatsCard
                        title="ผู้ใช้ทั่วไป"
                        value={stats?.users ?? 0}
                        icon={<User className="w-6 h-6" />}
                        color="info"
                        description="LINE users"
                    />
                </StaggerItem>
            </StaggerContainer>

            {/* Filters */}
            <div className="bg-surface rounded-2xl border border-border-default p-4 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="col-span-1 md:col-span-2">
                        <Input
                            placeholder="ค้นหาชื่อ, ชื่อผู้ใช้, อีเมล..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            leftIcon={<Search className="w-4 h-4" />}
                            variant="filled"
                        />
                    </div>
                    <Select
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                        variant="filled"
                        options={ROLE_OPTIONS}
                    />
                    <Select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        variant="filled"
                        options={STATUS_OPTIONS}
                    />
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border-default overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 dark:bg-gray-800 border-b border-border-default">
                            <tr className="text-xs font-semibold text-text-secondary tracking-wider">
                                <th className="px-6 py-3 text-left">ผู้ใช้</th>
                                <th className="px-6 py-3 text-left">ชื่อผู้ใช้</th>
                                <th className="px-6 py-3 text-left">บทบาท</th>
                                <th className="px-6 py-3 text-left">สถานะ</th>
                                <th className="px-6 py-3 text-left">วันที่สร้าง</th>
                                <th className="px-6 py-3 text-right">การดำเนินการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-default">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-16 text-center text-text-secondary">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                                            <span>กำลังโหลด...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-16 text-center text-text-secondary">
                                        <Users className="w-12 h-12 mx-auto mb-2 text-text-tertiary" />
                                        <p>ไม่พบผู้ใช้</p>
                                    </td>
                                </tr>
                            ) : (
                                users.map((u) => {
                                    const badge = ROLE_BADGE[u.role] || ROLE_BADGE.USER;
                                    const isSelf = currentUser?.id === String(u.id);
                                    return (
                                        <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-gray-800/50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                                                        {u.picture_url ? (
                                                            <Image src={u.picture_url} alt={u.display_name || 'User avatar'} width={40} height={40} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-text-tertiary">
                                                                <User className="w-5 h-5" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-medium text-text-primary truncate">{u.display_name || 'Unknown'}</div>
                                                        {u.email && <div className="text-xs text-text-tertiary truncate">{u.email}</div>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="text-sm text-text-secondary font-mono">
                                                    {u.username || (u.line_user_id ? `LINE:${u.line_user_id.substring(0, 8)}...` : '-')}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <Badge variant={badge.variant} size="sm">
                                                    {badge.label}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {u.is_active ? (
                                                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                                        ใช้งานอยู่
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-tertiary">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                                                        ปิดใช้งาน
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                                                {u.created_at ? new Date(u.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        onClick={() => openEdit(u)}
                                                        className="p-2 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20 text-text-tertiary hover:text-brand-600 transition-colors"
                                                        title="แก้ไข"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    {currentUser?.role === 'SUPER_ADMIN' && !isSelf && u.username && (
                                                        <button
                                                            onClick={() => { setResetUser(u); setResetPassword(''); setResetError(''); }}
                                                            className="p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 text-text-tertiary hover:text-amber-600 transition-colors"
                                                            title="รีเซ็ตรหัสผ่าน"
                                                        >
                                                            <Key className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    {!isSelf && (
                                                        <button
                                                            onClick={() => setDeleteUser(u)}
                                                            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-text-tertiary hover:text-red-600 transition-colors"
                                                            title="ลบ"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-border-default">
                        <p className="text-sm text-text-secondary">
                            แสดง {((page - 1) * PER_PAGE) + 1}-{Math.min(page * PER_PAGE, total)} จาก {total} รายการ
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                leftIcon={<ChevronLeft className="w-4 h-4" />}
                                disabled={page <= 1}
                                onClick={() => setPage(p => p - 1)}
                            >
                                ก่อนหน้า
                            </Button>
                            <span className="text-sm text-text-secondary px-2">
                                {page} / {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                rightIcon={<ChevronRight className="w-4 h-4" />}
                                disabled={page >= totalPages}
                                onClick={() => setPage(p => p + 1)}
                            >
                                ถัดไป
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Create User Modal ──────────────────────────────────── */}
            <Modal
                isOpen={showCreate}
                onClose={() => setShowCreate(false)}
                title="เพิ่มผู้ใช้ใหม่"
                description="กรอกข้อมูลเพื่อสร้างผู้ใช้ระบบใหม่"
                maxWidth="md"
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-1.5">ชื่อผู้ใช้ (Username) *</label>
                        <Input
                            placeholder="username"
                            value={createForm.username}
                            onChange={(e) => setCreateForm(f => ({ ...f, username: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-1.5">รหัสผ่าน *</label>
                        <Input
                            type="password"
                            placeholder="อย่างน้อย 8 ตัวอักษร"
                            value={createForm.password}
                            onChange={(e) => setCreateForm(f => ({ ...f, password: e.target.value }))}
                        />
                        {createForm.password && (
                            <div className="mt-2">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${passwordStrength(createForm.password).color}`}
                                            style={{ width: `${passwordStrength(createForm.password).level * 25}%` }}
                                        />
                                    </div>
                                    <span className="text-xs text-text-secondary">{passwordStrength(createForm.password).label}</span>
                                </div>
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-1.5">ชื่อที่แสดง (Display Name) *</label>
                        <Input
                            placeholder="ชื่อที่แสดงในระบบ"
                            value={createForm.display_name}
                            onChange={(e) => setCreateForm(f => ({ ...f, display_name: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-1.5">อีเมล</label>
                        <Input
                            type="email"
                            placeholder="email@example.com"
                            value={createForm.email}
                            onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-1.5">บทบาท *</label>
                        <Select
                            value={createForm.role}
                            onChange={(e) => setCreateForm(f => ({ ...f, role: e.target.value }))}
                            options={allowedCreateRoles}
                        />
                    </div>

                    {createError && (
                        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{createError}</p>
                    )}

                    <div className="flex gap-3 pt-2">
                        <Button variant="ghost" className="flex-1" onClick={() => setShowCreate(false)} disabled={createLoading}>
                            ยกเลิก
                        </Button>
                        <Button variant="primary" className="flex-1" onClick={handleCreate} isLoading={createLoading}>
                            สร้างผู้ใช้
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* ── Edit User Modal ────────────────────────────────────── */}
            <Modal
                isOpen={!!editUser}
                onClose={() => setEditUser(null)}
                title="แก้ไขผู้ใช้"
                description={editUser?.display_name || editUser?.username || ''}
                maxWidth="md"
            >
                {editUser && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-text-primary mb-1.5">ชื่อที่แสดง</label>
                            <Input
                                value={editForm.display_name}
                                onChange={(e) => setEditForm(f => ({ ...f, display_name: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-primary mb-1.5">อีเมล</label>
                            <Input
                                type="email"
                                value={editForm.email}
                                onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-primary mb-1.5">บทบาท</label>
                            <Select
                                value={editForm.role}
                                onChange={(e) => setEditForm(f => ({ ...f, role: e.target.value }))}
                                options={ROLE_OPTIONS.filter(o => o.value !== '')}
                                disabled={currentUser?.id === String(editUser.id)}
                            />
                            {currentUser?.id === String(editUser.id) && (
                                <p className="text-xs text-text-tertiary mt-1">ไม่สามารถเปลี่ยนบทบาทของตัวเองได้</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-primary mb-1.5">สถานะ</label>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setEditForm(f => ({ ...f, is_active: !f.is_active }))}
                                    disabled={currentUser?.id === String(editUser.id)}
                                    className="flex items-center gap-2 text-sm"
                                >
                                    {editForm.is_active ? (
                                        <ToggleRight className="w-8 h-8 text-green-500" />
                                    ) : (
                                        <ToggleLeft className="w-8 h-8 text-gray-400" />
                                    )}
                                    <span className={editForm.is_active ? 'text-green-600 font-medium' : 'text-text-tertiary'}>
                                        {editForm.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                                    </span>
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-primary mb-1.5">เปลี่ยนรหัสผ่าน (เว้นว่างถ้าไม่ต้องการเปลี่ยน)</label>
                            <Input
                                type="password"
                                placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)"
                                value={editForm.password}
                                onChange={(e) => setEditForm(f => ({ ...f, password: e.target.value }))}
                            />
                            {editForm.password && (
                                <div className="mt-2">
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${passwordStrength(editForm.password).color}`}
                                                style={{ width: `${passwordStrength(editForm.password).level * 25}%` }}
                                            />
                                        </div>
                                        <span className="text-xs text-text-secondary">{passwordStrength(editForm.password).label}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {editError && (
                            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{editError}</p>
                        )}

                        <div className="flex gap-3 pt-2">
                            <Button variant="ghost" className="flex-1" onClick={() => setEditUser(null)} disabled={editLoading}>
                                ยกเลิก
                            </Button>
                            <Button variant="primary" className="flex-1" onClick={handleEdit} isLoading={editLoading}>
                                บันทึก
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* ── Reset Password Modal ───────────────────────────────── */}
            <Modal
                isOpen={!!resetUser}
                onClose={() => setResetUser(null)}
                title="รีเซ็ตรหัสผ่าน"
                description={resetUser?.display_name || resetUser?.username || ''}
                maxWidth="sm"
            >
                {resetUser && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-text-primary mb-1.5">รหัสผ่านใหม่ *</label>
                            <Input
                                type="password"
                                placeholder="อย่างน้อย 8 ตัวอักษร"
                                value={resetPassword}
                                onChange={(e) => setResetPassword(e.target.value)}
                            />
                            {resetPassword && (
                                <div className="mt-2">
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${passwordStrength(resetPassword).color}`}
                                                style={{ width: `${passwordStrength(resetPassword).level * 25}%` }}
                                            />
                                        </div>
                                        <span className="text-xs text-text-secondary">{passwordStrength(resetPassword).label}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {resetError && (
                            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{resetError}</p>
                        )}

                        <div className="flex gap-3 pt-2">
                            <Button variant="ghost" className="flex-1" onClick={() => setResetUser(null)} disabled={resetLoading}>
                                ยกเลิก
                            </Button>
                            <Button variant="warning" className="flex-1" onClick={handleResetPassword} isLoading={resetLoading}>
                                รีเซ็ตรหัสผ่าน
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* ── Delete Confirmation ────────────────────────────────── */}
            <ModalAlert
                isOpen={!!deleteUser}
                onClose={() => setDeleteUser(null)}
                type="confirm"
                title="ลบผู้ใช้"
                message={
                    <span>
                        คุณต้องการลบผู้ใช้ <strong>{deleteUser?.display_name || deleteUser?.username}</strong> หรือไม่?
                        <br /><br />
                        <span className="text-xs text-text-tertiary">การลบจะเป็นการปิดใช้งานบัญชี (Soft Delete)</span>
                    </span>
                }
                onConfirm={handleDelete}
                confirmText="ลบผู้ใช้"
                cancelText="ยกเลิก"
                isLoading={deleteLoading}
            />

            {/* ── Alert ──────────────────────────────────────────────── */}
            <ModalAlert
                isOpen={!!alert}
                onClose={() => setAlert(null)}
                type={alert?.type === 'success' ? 'success' : 'error'}
                title={alert?.title || ''}
                message={alert?.message || ''}
            />
        </div>
    );
}
