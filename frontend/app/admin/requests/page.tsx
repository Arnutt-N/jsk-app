'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
    Search,
    Eye,
    UserPlus,
    Clock,
    CheckCircle2,
    AlertCircle,
    Calendar,
    ChevronLeft,
    ChevronRight,
    SquarePen,
    Trash2,
    Plus,
    RefreshCw,
    Hourglass,
    Inbox,
    ShieldCheck,
    HelpCircle,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { AssignModal } from '@/components/admin/AssignModal';
import { ActionIconButton } from '@/components/ui/ActionIconButton';
import PageHeader from '@/app/admin/components/PageHeader';
import { StaggerContainer, StaggerItem } from '@/components/ui/PageTransition';
import {
    type RequestStatus,
    STATUS_OPTIONS,
    getStatusLabelForRequest,
    getStatusVariantForRequest,
    getStatusIconForRequest,
} from '@/lib/constants/request-status';
import { usePermissions } from '@/lib/permissions';

// Bridge between shared module (icons stored as string names) and the
// lucide-react components actually rendered. Centralised so swapping an
// icon only requires one map update.
const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    Clock,
    Hourglass,
    Inbox,
    Eye,
    ShieldCheck,
    CheckCircle2,
    AlertCircle,
    HelpCircle,
};

function StatusIcon({ name, className }: { name: string; className?: string }) {
    const Icon = STATUS_ICONS[name] ?? HelpCircle;
    return <Icon className={className} />;
}

interface ServiceRequest {
    id: string;
    firstname: string;
    lastname: string;
    // Backend RequestStatus enum (UPPERCASE). Nullable for legacy rows.
    status: RequestStatus | null;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    due_date?: string;
    topic_category: string;
    topic_subcategory: string;
    created_at: string;
    agency: string;
    province: string;
    district: string;
    assigned_agent_id?: number;
    assignee_name?: string;
}


export default function AdminRequestList() {
    const [requests, setRequests] = useState<ServiceRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [filter, setFilter] = useState({ status: '', category: '' });
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');


    const API_BASE = '/api/v1';

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const query = new URLSearchParams();
            // The "AWAITING_ASSIGNMENT" pseudo-status maps to PENDING with
            // no assignee. The backend doesn't expose that as an enum, so
            // we fetch all PENDING and filter unassigned client-side below.
            const isAwaitingAssignmentFilter = filter.status === 'AWAITING_ASSIGNMENT';
            if (filter.status && !isAwaitingAssignmentFilter) {
                query.append('status', filter.status);
            } else if (isAwaitingAssignmentFilter) {
                query.append('status', 'PENDING');
            }
            if (filter.category) query.append('category', filter.category);
            if (debouncedSearch) query.append('search', debouncedSearch);

            const res = await fetch(`${API_BASE}/admin/requests?${query.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch requests');
            let data: ServiceRequest[] = await res.json();

            if (isAwaitingAssignmentFilter) {
                data = data.filter((r) => !r.assigned_agent_id);
            } else if (filter.status === 'PENDING') {
                // The bare PENDING filter on the dropdown means "assigned but
                // not yet acknowledged" -- exclude unassigned so each filter
                // option shows a distinct subset.
                data = data.filter((r) => Boolean(r.assigned_agent_id));
            }

            setRequests(data);
        } catch (err: unknown) {
            console.error('[requests] โหลดข้อมูลคำร้องล้มเหลว:', err);
            setFetchError('ไม่สามารถโหลดข้อมูลคำร้องได้ กรุณาลองใหม่');
        } finally {
            setLoading(false);
        }
    }, [API_BASE, debouncedSearch, filter.category, filter.status]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        void fetchRequests();
    }, [fetchRequests]);

    // Effective permissions for the logged-in admin -- decides whether
    // the assign button is rendered. Returns null while loading; we
    // fall back to "no permissions" until the fetch resolves.
    const permissions = usePermissions();
    const canAssignWork = permissions?.can_assign ?? false;

    const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
    const [viewModalOpen, setViewModalOpen] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [assigningRequest, setAssigningRequest] = useState<ServiceRequest | null>(null);

    const handleAssign = (req: ServiceRequest) => {
        setAssigningRequest(req);
        setAssignModalOpen(true);
    };

    const confirmAssign = async (agentId: number) => {
        if (!assigningRequest) return;
        try {
            // Assigning a request only sets the assignee. Status stays at
            // PENDING (now displayed as "รอรับเรื่อง") until the assignee
            // clicks "รับเรื่อง" on the detail page, which advances it to
            // ACKNOWLEDGED. This separation is what gives us a real
            // "supervisor handed off but worker has not seen it yet" state.
            const res = await fetch(`${API_BASE}/admin/requests/${assigningRequest.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assigned_agent_id: agentId }),
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody?.detail || 'Failed to assign agent');
            }

            fetchRequests();
            setAssignModalOpen(false);
            setAssigningRequest(null);
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'มอบหมายงานไม่สำเร็จ');
        }
    };

    const handleView = (req: ServiceRequest) => {
        setSelectedRequest(req);
        setViewModalOpen(true);
    };

    const handleDelete = (req: ServiceRequest) => {
        setSelectedRequest(req);
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!selectedRequest) return;

        try {
            const res = await fetch(`${API_BASE}/admin/requests/${selectedRequest.id}`, {
                method: 'DELETE'
            });

            if (!res.ok) throw new Error('Failed to delete request');

            // Remove from local state on success
            setRequests(prev => prev.filter(r => r.id !== selectedRequest.id));
            setDeleteModalOpen(false);
            setSelectedRequest(null);
        } catch (err) {
            console.error(err);
            alert('Failed to delete request');
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 thai-text">
            {/* Page Header */}
            <PageHeader title="รายการคำร้องขอรับบริการ" subtitle="จัดการและติดตามสถานะคำร้องจากประชาชนผ่าน LINE OA">
                <Button asChild variant="primary" size="sm">
                    <Link href="/admin/requests/create">
                        <Plus className="w-4 h-4 mr-1" /> สร้างคำร้อง
                    </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={() => fetchRequests()}>
                    <RefreshCw className="w-4 h-4" />
                </Button>
            </PageHeader>

            {/* Filters & Search */}
            <StaggerContainer className="grid grid-cols-1 gap-5">
                <StaggerItem>
                    <Card glass className="border-none shadow-sm">
                        <CardContent className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="col-span-1 md:col-span-2">
                                    <Input
                                        type="text"
                                        placeholder="ค้นหาชื่อ, เบอร์โทรศัพท์ หรือรายละเอียด..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        leftIcon={<Search className="w-4 h-4" />}
                                    />
                                </div>

                                <Select
                                    value={filter.status}
                                    onChange={(e) => setFilter(prev => ({ ...prev, status: e.target.value }))}
                                    options={STATUS_OPTIONS}
                                />
                                <Select
                                    value={filter.category}
                                    onChange={(e) => setFilter(prev => ({ ...prev, category: e.target.value }))}
                                    options={[
                                        { value: '', label: 'ทุกหมวดหมู่' },
                                        { value: 'กองทุนยุติธรรม', label: 'กองทุนยุติธรรม' },
                                        { value: 'รับเรื่องราวร้องทุกข์', label: 'รับเรื่องราวร้องทุกข์' },
                                        { value: 'เงินเยียวยาเหยื่ออาชญากรรม', label: 'เงินเยียวยาเหยื่ออาชญากรรม' },
                                    ]}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </StaggerItem>
            </StaggerContainer>

            {/* แสดง error เมื่อโหลดข้อมูลล้มเหลว */}
            {fetchError && (
                <div className="flex items-center gap-3 p-4 mb-4 bg-danger/10 text-danger-text rounded-xl text-sm">
                    <AlertCircle size={18} className="shrink-0" />
                    <span className="flex-1">{fetchError}</span>
                    <Button variant="outline" size="xs" onClick={() => fetchRequests()}>
                        ลองใหม่
                    </Button>
                </div>
            )}

            {/* ตารางคำร้อง */}
            <Card glass className="border-none shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-bg/50 border-b border-border-default text-xs font-bold text-text-tertiary uppercase tracking-wider">
                                <th className="px-6 py-4">ข้อมูลผู้ยื่น / หัวข้อ</th>
                                <th className="px-6 py-4">หน่วยงาน / พื้นที่</th>
                                <th className="px-6 py-4">วันที่ยื่น</th>
                                <th className="px-6 py-4">สถานะ</th>
                                <th className="px-6 py-4">เจ้าหน้าที่</th>
                                <th className="px-6 py-4 text-right">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-default bg-surface/40">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={6} className="px-6 py-8">
                                            <div className="h-4 bg-muted rounded-full w-3/4 mb-3"></div>
                                            <div className="h-3 bg-muted/50 rounded-full w-1/2"></div>
                                        </td>
                                    </tr>
                                ))
                            ) : requests.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center">
                                        <div className="flex flex-col items-center gap-3 text-text-tertiary">
                                            <AlertCircle className="w-12 h-12 opacity-20" />
                                            <p className="text-sm">ไม่พบข้อมูลคำร้อง</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : requests.map((req) => (
                                <tr key={req.id} className="hover:bg-bg/50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-start gap-3">
                                            <div className="w-10 h-10 bg-brand-500/10 text-brand-600 rounded-lg flex items-center justify-center font-bold text-lg shrink-0 dark:bg-brand-500/20 dark:text-brand-400">
                                                {req.firstname?.[0] || '?'}
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-text-secondary">{req.firstname || 'ไม่ระบุชื่อ'} {req.lastname || ''}</div>
                                                <div className="text-xs text-text-tertiary mt-0.5 font-medium">{req.topic_category}</div>
                                                <div className="text-[10px] text-text-tertiary uppercase tracking-tight">{req.topic_subcategory}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-[11px] font-bold text-text-secondary">{req.agency}</div>
                                        <div className="text-[10px] text-text-tertiary mt-0.5">{req.province} › {req.district}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 text-xs text-text-secondary font-medium">
                                            <Calendar className="w-3.5 h-3.5 text-text-tertiary" />
                                            {new Date(req.created_at).toLocaleDateString('th-TH', {
                                                day: '2-digit',
                                                month: 'short',
                                                year: '2-digit',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <Badge variant={getStatusVariantForRequest(req)} className="gap-1.5 py-1 px-2.5">
                                            <StatusIcon name={getStatusIconForRequest(req)} className="w-3 h-3" />
                                            {getStatusLabelForRequest(req)}
                                        </Badge>
                                    </td>
                                    <td className="px-6 py-4">
                                        {req.assignee_name ? (
                                            canAssignWork ? (
                                                <div
                                                    className="flex items-center gap-2 cursor-pointer hover:bg-muted p-1.5 rounded-lg -ml-1.5 transition-colors group/agent"
                                                    onClick={() => handleAssign(req)}
                                                    title="คลิกเพื่อเปลี่ยนผู้รับผิดชอบ"
                                                >
                                                    <div className="w-6 h-6 bg-brand-100 rounded-full flex items-center justify-center text-[10px] font-bold text-brand-600 group-hover/agent:bg-brand-200 transition-colors dark:bg-brand-500/20 dark:text-brand-400">
                                                        {req.assignee_name[0]}
                                                    </div>
                                                    <span className="text-xs font-medium text-text-secondary group-hover/agent:text-brand-700">{req.assignee_name}</span>
                                                </div>
                                            ) : (
                                                // Read-only: AGENT/USER see the assignee but cannot reassign
                                                <div className="flex items-center gap-2 p-1.5 -ml-1.5">
                                                    <div className="w-6 h-6 bg-brand-100 rounded-full flex items-center justify-center text-[10px] font-bold text-brand-600 dark:bg-brand-500/20 dark:text-brand-400">
                                                        {req.assignee_name[0]}
                                                    </div>
                                                    <span className="text-xs font-medium text-text-secondary">{req.assignee_name}</span>
                                                </div>
                                            )
                                        ) : canAssignWork ? (
                                            <button
                                                onClick={() => handleAssign(req)}
                                                className="flex items-center gap-1.5 cursor-pointer hover:bg-bg p-1 rounded-full pr-2.5 border border-transparent hover:border-border-default transition-all whitespace-nowrap group/assign"
                                                title="มอบหมายเจ้าหน้าที่"
                                            >
                                                <div className="w-5 h-5 bg-muted rounded-full flex items-center justify-center text-text-tertiary group-hover/assign:bg-brand-500 group-hover/assign:text-white transition-colors shadow-sm">
                                                    <UserPlus className="w-4 h-4" />
                                                </div>
                                                <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider group-hover/assign:text-brand-600 transition-colors">มอบหมาย</span>
                                            </button>
                                        ) : (
                                            // No assignee + no permission to assign -- show muted placeholder
                                            <span className="text-[10px] text-text-tertiary italic">ยังไม่มอบหมาย</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <ActionIconButton
                                                icon={<Eye className="w-4 h-4" />}
                                                label="เรียกดู"
                                                variant="default"
                                                onClick={() => handleView(req)}
                                            />
                                            <Link href={`/admin/requests/${req.id}`}>
                                                <ActionIconButton
                                                    icon={<SquarePen className="w-4 h-4" />}
                                                    label="แก้ไข"
                                                    variant="warning"
                                                />
                                            </Link>
                                            <ActionIconButton
                                                icon={<Trash2 className="w-4 h-4" />}
                                                label="ลบ"
                                                variant="danger"
                                                onClick={() => handleDelete(req)}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Placeholder */}
                <div className="px-6 py-4 border-t border-border-default bg-bg/30 flex items-center justify-between">
                    <p className="text-xs text-text-tertiary font-medium">Showing {requests.length} requests</p>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled>
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled>
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </Card>

            {/* View Modal */}
            <Modal isOpen={viewModalOpen} onClose={() => setViewModalOpen(false)} title="รายละเอียดคำร้อง">
                {selectedRequest && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-text-tertiary">ชื่อ-นามสกุล</label>
                                <p className="text-sm font-bold text-text-primary">{selectedRequest.firstname} {selectedRequest.lastname}</p>
                            </div>
                            <div>
                                <label className="text-xs text-text-tertiary">หมวดหมู่</label>
                                <p className="text-sm font-medium text-text-secondary">{selectedRequest.topic_category}</p>
                            </div>
                            <div>
                                <label className="text-xs text-text-tertiary">สถานะ</label>
                                <div className="mt-1">
                                    <Badge variant={getStatusVariantForRequest(selectedRequest)}>
                                        {getStatusLabelForRequest(selectedRequest)}
                                    </Badge>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-text-tertiary">วันที่ยื่น</label>
                                <p className="text-sm font-medium text-text-secondary">
                                    {new Date(selectedRequest.created_at).toLocaleDateString('th-TH')}
                                </p>
                            </div>
                            <div className="col-span-2">
                                <label className="text-xs text-text-tertiary">หน่วยงาน</label>
                                <p className="text-sm text-text-secondary">{selectedRequest.agency}</p>
                                <p className="text-xs text-text-tertiary">{selectedRequest.province} › {selectedRequest.district}</p>
                            </div>
                        </div>
                        <div className="pt-4 border-t border-border-default flex justify-end">
                            <Link href={`/admin/requests/${selectedRequest.id}`}>
                                <Button className="gap-2">
                                    ดูรายละเอียดเต็ม <ChevronRight className="w-4 h-4" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Delete Modal */}
            <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="ยืนยันการลบ" maxWidth="sm">
                <div className="space-y-4">
                    <p className="text-sm text-text-secondary">
                        คุณต้องการลบคำร้องของ <b>{selectedRequest?.firstname} {selectedRequest?.lastname}</b> ใช่หรือไม่?
                        <br /><span className="text-xs text-red-500 mt-2 block">* การกระทำนี้ไม่สามารถย้อนกลับได้</span>
                    </p>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={() => setDeleteModalOpen(false)}>ยกเลิก</Button>
                        <Button variant="danger" onClick={confirmDelete}>ยืนยันลบ</Button>
                    </div>
                </div>
            </Modal>

            {/* Assign Modal */}
            <AssignModal
                isOpen={assignModalOpen}
                onClose={() => setAssignModalOpen(false)}
                onAssign={confirmAssign}
                currentAssigneeId={assigningRequest?.assigned_agent_id}
            />
        </div>
    );
}
