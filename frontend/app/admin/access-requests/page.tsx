'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, ShieldCheck, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ModalAlert } from '@/components/ui/ModalAlert';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PasswordStrengthMeter } from '@/components/ui/PasswordStrengthMeter';
import { apiFetch } from '@/lib/api-error';
import { getRoleOptionLabel } from '@/lib/constants/roles';
import PageHeader from '../components/PageHeader';

interface AccessRequest {
  id: number;
  display_name: string | null;
  username: string | null;
  email: string | null;
  phone_number: string | null;
  requested_role: string;
  reason: string | null;
  status: string;
  created_at: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'รอพิจารณา',
  APPROVED: 'อนุมัติแล้ว',
  REJECTED: 'ปฏิเสธแล้ว',
};

export default function AccessRequestsPage() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [filter, setFilter] = useState('PENDING');
  const [loading, setLoading] = useState(true);
  const [approveReq, setApproveReq] = useState<AccessRequest | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveError, setApproveError] = useState('');
  const [rejectReq, setRejectReq] = useState<AccessRequest | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set('status', filter);
    const result = await apiFetch<AccessRequest[]>(`/admin/access-requests?${params}`);
    if (result.ok) {
      setRequests(result.data);
    } else {
      setAlert({ type: 'error', title: 'ไม่สำเร็จ', message: result.message });
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    void (async () => { await fetchRequests(); })();
  }, [fetchRequests]);

  const handleApprove = async () => {
    if (!approveReq) return;
    setApproveError('');
    if (password.length < 8) {
      setApproveError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      return;
    }
    if (password !== confirmPassword) {
      setApproveError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setApproveLoading(true);
    const result = await apiFetch(`/admin/access-requests/${approveReq.id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    if (result.ok) {
      setApproveReq(null);
      setPassword('');
      setConfirmPassword('');
      setAlert({ type: 'success', title: 'สำเร็จ', message: `อนุมัติ ${approveReq.display_name || approveReq.username} แล้ว เข้าสู่ระบบได้ทันที` });
      try {
        await fetchRequests();
      } catch {
        setAlert({ type: 'error', title: 'ไม่สำเร็จ', message: 'อนุมัติแล้ว แต่โหลดรายการใหม่ไม่สำเร็จ กรุณารีเฟรชหน้า' });
      }
    } else {
      setApproveError(result.message);
    }
    setApproveLoading(false);
  };

  const handleReject = async () => {
    if (!rejectReq) return;
    setRejectLoading(true);
    const result = await apiFetch(`/admin/access-requests/${rejectReq.id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note: rejectNote || null }),
    });
    if (result.ok) {
      setRejectReq(null);
      setRejectNote('');
      setAlert({ type: 'success', title: 'สำเร็จ', message: 'ปฏิเสธคำขอแล้ว' });
      try {
        await fetchRequests();
      } catch {
        setAlert({ type: 'error', title: 'ไม่สำเร็จ', message: 'ปฏิเสธแล้ว แต่โหลดรายการใหม่ไม่สำเร็จ กรุณารีเฟรชหน้า' });
      }
    } else {
      setRejectReq(null);
      setAlert({ type: 'error', title: 'ไม่สำเร็จ', message: result.message });
    }
    setRejectLoading(false);
  };

  return (
    <div className="max-w-7xl mx-auto thai-text space-y-6 animate-fade-in-up">
      <PageHeader title="คำขอใช้งานระบบ" subtitle="อนุมัติหรือปฏิเสธบัญชีพนักงานใหม่">
        <div className="flex gap-2">
          {['PENDING', 'APPROVED', 'REJECTED', ''].map((s) => (
            <Button
              key={s}
              variant={filter === s ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setFilter(s)}
            >
              {s ? STATUS_LABEL[s] : 'ทั้งหมด'}
            </Button>
          ))}
        </div>
      </PageHeader>

      <div className="bg-surface rounded-2xl shadow-sm border border-border-default overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-gray-800 border-b border-border-default">
              <tr className="text-xs font-semibold text-text-secondary tracking-wider">
                <th className="px-6 py-3 text-left">ผู้ขอ</th>
                <th className="px-6 py-3 text-left">ชื่อผู้ใช้ที่ขอ</th>
                <th className="px-6 py-3 text-left">ตำแหน่งที่ขอ</th>
                <th className="px-6 py-3 text-left">เหตุผล</th>
                <th className="px-6 py-3 text-left">วันที่ขอ</th>
                <th className="px-6 py-3 text-left">สถานะ</th>
                <th className="px-6 py-3 text-right">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <LoadingSpinner size="sm" label="กำลังโหลด..." fullPage={false} />
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-text-secondary">
                    <ShieldCheck className="w-12 h-12 mx-auto mb-2 text-text-tertiary" />
                    <p>ไม่มีคำขอ</p>
                  </td>
                </tr>
              ) : (
                requests.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-text-primary">{r.display_name || '-'}</div>
                      {r.email && <div className="text-xs text-text-tertiary">{r.email}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary font-mono">{r.username}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="info" size="sm">{getRoleOptionLabel(r.requested_role)}</Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary max-w-55 truncate" title={r.reason || ''}>{r.reason || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">{r.created_at ? new Date(r.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{STATUS_LABEL[r.status] || r.status}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {r.status === 'PENDING' && (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            leftIcon={<Check className="w-4 h-4" />}
                            onClick={() => { setApproveReq(r); setPassword(''); setConfirmPassword(''); setApproveError(''); }}
                          >
                            อนุมัติ
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<X className="w-4 h-4" />}
                            onClick={() => { setRejectReq(r); setRejectNote(''); }}
                          >
                            ปฏิเสธ
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={!!approveReq}
        onClose={() => setApproveReq(null)}
        title="อนุมัติคำขอ"
        description={`สร้างบัญชี ${approveReq?.display_name || approveReq?.username} (${approveReq ? getRoleOptionLabel(approveReq.requested_role) : ''})`}
        maxWidth="sm"
      >
        {approveReq && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary flex items-start gap-2">
              <UserPlus className="w-4 h-4 mt-0.5 shrink-0" />
              ตั้งรหัสผ่านเริ่มต้นให้พนักงาน แล้วแจ้งให้เขาเปลี่ยนหลังล็อกอินครั้งแรก
            </p>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">รหัสผ่านเริ่มต้น *</label>
              <Input
                type="password"
                placeholder="อย่างน้อย 8 ตัวอักษร"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {password && <PasswordStrengthMeter password={password} />}
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">ยืนยันรหัสผ่าน *</label>
              <Input
                type="password"
                placeholder="พิมพ์รหัสผ่านอีกครั้ง"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {approveError && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{approveError}</p>
            )}
            <div className="flex gap-3 pt-2">
              <Button variant="ghost" className="flex-1" onClick={() => setApproveReq(null)} disabled={approveLoading}>
                ยกเลิก
              </Button>
              <Button variant="primary" className="flex-1" onClick={handleApprove} isLoading={approveLoading}>
                อนุมัติและสร้างบัญชี
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!rejectReq}
        onClose={() => setRejectReq(null)}
        title="ปฏิเสธคำขอ"
        description={rejectReq?.display_name || rejectReq?.username || ''}
        maxWidth="sm"
      >
        {rejectReq && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">เหตุผล (ถ้ามี)</label>
              <Input
                placeholder="เช่น ตำแหน่งเต็มแล้ว"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="ghost" className="flex-1" onClick={() => setRejectReq(null)} disabled={rejectLoading}>
                ยกเลิก
              </Button>
              <Button variant="outline" className="flex-1" onClick={handleReject} isLoading={rejectLoading}>
                ปฏิเสธคำขอ
              </Button>
            </div>
          </div>
        )}
      </Modal>

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
