'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import {
    ArrowLeft, User, Shield, UserCog, Mail, Calendar,
    Key, ToggleLeft, ToggleRight, Save, Loader2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ModalAlert } from '@/components/ui/ModalAlert';

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

const ROLE_BADGE: Record<string, { variant: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'gray'; label: string; icon: React.ReactNode }> = {
    SUPER_ADMIN: { variant: 'primary', label: 'Super Admin', icon: <Shield className="w-4 h-4" /> },
    ADMIN: { variant: 'info', label: 'Admin', icon: <Shield className="w-4 h-4" /> },
    AGENT: { variant: 'success', label: 'Agent', icon: <UserCog className="w-4 h-4" /> },
    USER: { variant: 'gray', label: 'User', icon: <User className="w-4 h-4" /> },
};

const ROLE_OPTIONS: SelectOption[] = [
    { value: 'SUPER_ADMIN', label: 'Super Admin' },
    { value: 'ADMIN', label: 'Admin' },
    { value: 'AGENT', label: 'Agent' },
    { value: 'USER', label: 'User' },
];

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

export default function UserDetailPage() {
    const params = useParams();
    const router = useRouter();
    const userId = params.id as string;
    const { token, user: currentUser } = useAuth();

    const [userData, setUserData] = useState<UserRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Edit form
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('');
    const [isActive, setIsActive] = useState(true);

    // Password change
    const [newPassword, setNewPassword] = useState('');
    const [passwordSaving, setPasswordSaving] = useState(false);

    // Reset password (SUPER_ADMIN)
    const [showReset, setShowReset] = useState(false);
    const [resetPw, setResetPw] = useState('');
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

    const isSelf = currentUser?.id === userId;

    const fetchUser = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/users/${userId}`, { headers: authHeaders });
            if (res.ok) {
                const data: UserRecord = await res.json();
                setUserData(data);
                setDisplayName(data.display_name || '');
                setEmail(data.email || '');
                setRole(data.role);
                setIsActive(data.is_active);
            } else {
                setError('ไม่พบผู้ใช้');
            }
        } catch {
            setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
        } finally {
            setLoading(false);
        }
    }, [API_BASE, authHeaders, userId]);

    useEffect(() => { fetchUser(); }, [fetchUser]);

    const handleSave = async () => {
        if (!userData) return;
        setSaving(true);
        setError('');
        try {
            const payload: Record<string, unknown> = {};
            if (displayName !== (userData.display_name || '')) payload.display_name = displayName;
            if (email !== (userData.email || '')) payload.email = email || null;
            if (role !== userData.role && !isSelf) payload.role = role;
            if (isActive !== userData.is_active && !isSelf) payload.is_active = isActive;

            if (Object.keys(payload).length === 0) {
                setSaving(false);
                return;
            }

            const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
                method: 'PUT',
                headers: authHeaders,
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                setAlert({ type: 'success', title: 'สำเร็จ', message: 'อัปเดตข้อมูลเรียบร้อยแล้ว' });
                fetchUser();
            } else {
                const err = await res.json();
                setError(err.detail || 'เกิดข้อผิดพลาด');
            }
        } catch {
            setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
        } finally {
            setSaving(false);
        }
    };

    const handleChangePassword = async () => {
        if (newPassword.length < 8) {
            setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
            return;
        }
        setPasswordSaving(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
                method: 'PUT',
                headers: authHeaders,
                body: JSON.stringify({ password: newPassword }),
            });
            if (res.ok) {
                setNewPassword('');
                setAlert({ type: 'success', title: 'สำเร็จ', message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' });
            } else {
                const err = await res.json();
                setError(err.detail || 'เกิดข้อผิดพลาด');
            }
        } catch {
            setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
        } finally {
            setPasswordSaving(false);
        }
    };

    const handleResetPassword = async () => {
        if (resetPw.length < 8) {
            setResetError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
            return;
        }
        setResetLoading(true);
        setResetError('');
        try {
            const res = await fetch(`${API_BASE}/admin/users/${userId}/reset-password`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ new_password: resetPw }),
            });
            if (res.ok) {
                setShowReset(false);
                setResetPw('');
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

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                    <span className="text-text-secondary text-sm">กำลังโหลด...</span>
                </div>
            </div>
        );
    }

    if (!userData) {
        return (
            <div className="max-w-4xl mx-auto text-center">
                <p className="text-text-secondary">{error || 'ไม่พบผู้ใช้'}</p>
                <Button variant="outline" className="mt-4" onClick={() => router.push('/admin/users')}>
                    กลับไปหน้ารายการ
                </Button>
            </div>
        );
    }

    const badge = ROLE_BADGE[userData.role] || ROLE_BADGE.USER;

    return (
        <div className="max-w-4xl mx-auto thai-text space-y-6 animate-fade-in-up">
            {/* Back */}
            <Button
                variant="ghost"
                size="sm"
                leftIcon={<ArrowLeft className="w-4 h-4" />}
                onClick={() => router.push('/admin/users')}
            >
                กลับรายชื่อผู้ใช้
            </Button>

            {/* Profile Header */}
            <div className="bg-surface rounded-2xl border border-border-default p-6 shadow-sm">
                <div className="flex items-start gap-5">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                        {userData.picture_url ? (
                            <Image src={userData.picture_url} alt={userData.display_name || 'User avatar'} width={64} height={64} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-text-tertiary">
                                <User className="w-8 h-8" />
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-xl font-bold text-text-primary truncate">{userData.display_name || 'Unknown'}</h1>
                            <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
                            {!userData.is_active && (
                                <Badge variant="danger" size="sm">ปิดใช้งาน</Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-text-secondary flex-wrap">
                            {userData.username && (
                                <span className="font-mono">@{userData.username}</span>
                            )}
                            {userData.email && (
                                <span className="flex items-center gap-1">
                                    <Mail className="w-4 h-4" /> {userData.email}
                                </span>
                            )}
                            {userData.created_at && (
                                <span className="flex items-center gap-1">
                                    <Calendar className="w-4 h-4" />
                                    สร้างเมื่อ {new Date(userData.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
                                </span>
                            )}
                        </div>
                        {userData.line_user_id && (
                            <p className="text-xs text-text-tertiary font-mono mt-1">LINE: {userData.line_user_id}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Edit Form */}
            <div className="bg-surface rounded-2xl border border-border-default p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-text-primary mb-4">แก้ไขข้อมูล</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-1.5">ชื่อที่แสดง</label>
                        <Input
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-1.5">อีเมล</label>
                        <Input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-1.5">บทบาท</label>
                        <Select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            options={ROLE_OPTIONS}
                            disabled={isSelf}
                        />
                        {isSelf && (
                            <p className="text-xs text-text-tertiary mt-1">ไม่สามารถเปลี่ยนบทบาทของตัวเองได้</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-1.5">สถานะ</label>
                        <button
                            onClick={() => !isSelf && setIsActive(v => !v)}
                            disabled={isSelf}
                            className="flex items-center gap-2 text-sm h-10"
                        >
                            {isActive ? (
                                <ToggleRight className="w-8 h-8 text-green-500" />
                            ) : (
                                <ToggleLeft className="w-8 h-8 text-gray-400" />
                            )}
                            <span className={isActive ? 'text-green-600 font-medium' : 'text-text-tertiary'}>
                                {isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                            </span>
                        </button>
                    </div>
                </div>

                {error && (
                    <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 mt-4">{error}</p>
                )}

                <div className="flex gap-3 mt-6">
                    <Button
                        variant="primary"
                        leftIcon={<Save className="w-4 h-4" />}
                        onClick={handleSave}
                        isLoading={saving}
                    >
                        บันทึก
                    </Button>
                    {currentUser?.role === 'SUPER_ADMIN' && !isSelf && userData.username && (
                        <Button
                            variant="warning"
                            leftIcon={<Key className="w-4 h-4" />}
                            onClick={() => { setShowReset(true); setResetPw(''); setResetError(''); }}
                        >
                            รีเซ็ตรหัสผ่าน
                        </Button>
                    )}
                </div>
            </div>

            {/* Change Password Section */}
            {userData.username && (
                <div className="bg-surface rounded-2xl border border-border-default p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-text-primary mb-4">เปลี่ยนรหัสผ่าน</h2>
                    <div className="max-w-md">
                        <div>
                            <label className="block text-sm font-medium text-text-primary mb-1.5">รหัสผ่านใหม่</label>
                            <Input
                                type="password"
                                placeholder="อย่างน้อย 8 ตัวอักษร"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                            {newPassword && (
                                <div className="mt-2">
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${passwordStrength(newPassword).color}`}
                                                style={{ width: `${passwordStrength(newPassword).level * 25}%` }}
                                            />
                                        </div>
                                        <span className="text-xs text-text-secondary">{passwordStrength(newPassword).label}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <Button
                            variant="secondary"
                            className="mt-4"
                            onClick={handleChangePassword}
                            isLoading={passwordSaving}
                            disabled={!newPassword}
                        >
                            เปลี่ยนรหัสผ่าน
                        </Button>
                    </div>
                </div>
            )}

            {/* Account Info */}
            <div className="bg-surface rounded-2xl border border-border-default p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-text-primary mb-4">ข้อมูลบัญชี</h2>
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                        <dt className="text-text-tertiary">ID</dt>
                        <dd className="text-text-primary font-mono mt-0.5">{userData.id}</dd>
                    </div>
                    <div>
                        <dt className="text-text-tertiary">Username</dt>
                        <dd className="text-text-primary font-mono mt-0.5">{userData.username || '-'}</dd>
                    </div>
                    <div>
                        <dt className="text-text-tertiary">สร้างเมื่อ</dt>
                        <dd className="text-text-primary mt-0.5">
                            {userData.created_at ? new Date(userData.created_at).toLocaleString('th-TH') : '-'}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-text-tertiary">อัปเดตล่าสุด</dt>
                        <dd className="text-text-primary mt-0.5">
                            {userData.updated_at ? new Date(userData.updated_at).toLocaleString('th-TH') : '-'}
                        </dd>
                    </div>
                    {userData.line_user_id && (
                        <div className="md:col-span-2">
                            <dt className="text-text-tertiary">LINE User ID</dt>
                            <dd className="text-text-primary font-mono mt-0.5">{userData.line_user_id}</dd>
                        </div>
                    )}
                </dl>
            </div>

            {/* Reset Password Modal */}
            <Modal
                isOpen={showReset}
                onClose={() => setShowReset(false)}
                title="รีเซ็ตรหัสผ่าน"
                description={userData.display_name || userData.username || ''}
                maxWidth="sm"
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-1.5">รหัสผ่านใหม่ *</label>
                        <Input
                            type="password"
                            placeholder="อย่างน้อย 8 ตัวอักษร"
                            value={resetPw}
                            onChange={(e) => setResetPw(e.target.value)}
                        />
                        {resetPw && (
                            <div className="mt-2">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${passwordStrength(resetPw).color}`}
                                            style={{ width: `${passwordStrength(resetPw).level * 25}%` }}
                                        />
                                    </div>
                                    <span className="text-xs text-text-secondary">{passwordStrength(resetPw).label}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {resetError && (
                        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{resetError}</p>
                    )}

                    <div className="flex gap-3 pt-2">
                        <Button variant="ghost" className="flex-1" onClick={() => setShowReset(false)} disabled={resetLoading}>
                            เปลี่ยนรหัสผ่าน
                        </Button>
                        <Button variant="warning" className="flex-1" onClick={handleResetPassword} isLoading={resetLoading}>
                            รีเซ็ตรหัสผ่าน
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Alert */}
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
