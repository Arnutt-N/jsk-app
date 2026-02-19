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
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { AssignModal } from '@/components/admin/AssignModal';
import { ActionIconButton } from '@/components/ui/ActionIconButton';
import PageHeader from '@/app/admin/components/PageHeader';

interface ServiceRequest {
    id: string;
    firstname: string;
    lastname: string;
    status: 'pending' | 'in_progress' | 'completed' | 'rejected';
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
    const [filter, setFilter] = useState({ status: '', category: '' });
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');


    const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        try {
            const query = new URLSearchParams();
            if (filter.status) query.append('status', filter.status);
            if (filter.category) query.append('category', filter.category);
            if (debouncedSearch) query.append('search', debouncedSearch);

            const res = await fetch(`${API_BASE}/admin/requests?${query.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch requests');
            const data = await res.json();
            setRequests(data);
        } catch (err: unknown) {
            console.error(err);
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


    const getStatusStyles = (status: string) => {
        switch (status) {
            case 'pending': return { variant: 'warning' as const, label: 'รอรับเรื่อง', icon: <Clock className="w-3 h-3" /> };
            case 'in_progress': return { variant: 'info' as const, label: 'กำลังดำเนินการ', icon: <Eye className="w-3 h-3" /> };
            case 'completed': return { variant: 'success' as const, label: 'ดำเนินการแล้ว', icon: <CheckCircle2 className="w-3 h-3" /> };
            case 'rejected': return { variant: 'danger' as const, label: 'ปฏิเสธ', icon: <AlertCircle className="w-3 h-3" /> };
            // Handle NULL/Undefined as "New"
            case null:
            case undefined:
            case '':
                return { variant: 'warning' as const, label: 'มาใหม่ (รอรับงาน)', icon: <Clock className="w-3 h-3" /> };
            default: return { variant: 'gray' as const, label: status || 'Unknown', icon: null };
        }
    };

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
            const res = await fetch(`${API_BASE}/admin/requests/${assigningRequest.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assigned_agent_id: agentId, status: assigningRequest.status === 'pending' ? 'in_progress' : undefined })
            });
            if (!res.ok) throw new Error('Failed to assign agent');

            // Optimistic update or refresh
            fetchRequests();
            setAssignModalOpen(false);
            setAssigningRequest(null);
        } catch (err) {
            console.error(err);
            alert('Failed to assign agent');
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
                <Button variant="outline" size="sm" onClick={() => fetchRequests()}>
                    Refresh
                </Button>
            </PageHeader>

            {/* Filters & Search */}
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
                            options={[
                                { value: '', label: 'ทุกสถานะ' },
                                { value: 'pending', label: 'รอรับเรื่อง' },
                                { value: 'in_progress', label: 'กำลังดำเนินการ' },
                                { value: 'completed', label: 'ดำเนินการแล้ว' },
                                { value: 'rejected', label: 'ปฏิเสธ' },
                            ]}
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

            {/* Request Table */}
            <Card glass className="border-none shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-400">
                                <th className="px-6 py-4">ข้อมูลผู้ยื่น / หัวข้อ</th>
                                <th className="px-6 py-4">หน่วยงาน / พื้นที่</th>
                                <th className="px-6 py-4">วันที่ยื่น</th>
                                <th className="px-6 py-4">สถานะ</th>
                                <th className="px-6 py-4">เจ้าหน้าที่</th>
                                <th className="px-6 py-4 text-right">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white/40 dark:divide-gray-700 dark:bg-transparent">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={6} className="px-6 py-8">
                                            <div className="h-4 bg-gray-100 rounded-full w-3/4 mb-3 dark:bg-gray-700"></div>
                                            <div className="h-3 bg-gray-50 rounded-full w-1/2 dark:bg-gray-700/50"></div>
                                        </td>
                                    </tr>
                                ))
                            ) : requests.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center">
                                        <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
                                            <AlertCircle className="w-12 h-12 opacity-20" />
                                            <p className="text-sm">ไม่พบข้อมูลคำร้อง</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : requests.map((req) => (
                                <tr key={req.id} className="hover:bg-gray-50/50 transition-colors group dark:hover:bg-gray-700/30">
                                    <td className="px-6 py-4">
                                        <div className="flex items-start gap-3">
                                            <div className="w-10 h-10 bg-brand-500/10 text-brand-600 rounded-lg flex items-center justify-center font-bold text-lg shrink-0 dark:bg-brand-500/20 dark:text-brand-400">
                                                {req.firstname?.[0] || '?'}
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-gray-700 dark:text-gray-200">{req.firstname || 'ไม่ระบุชื่อ'} {req.lastname || ''}</div>
                                                <div className="text-xs text-gray-500 mt-0.5 font-medium dark:text-gray-400">{req.topic_category}</div>
                                                <div className="text-[10px] text-gray-400 uppercase tracking-tight dark:text-gray-500">{req.topic_subcategory}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-[11px] font-bold text-gray-600 dark:text-gray-300">{req.agency}</div>
                                        <div className="text-[10px] text-gray-500 mt-0.5 dark:text-gray-400">{req.province} › {req.district}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 text-xs text-gray-600 font-medium dark:text-gray-300">
                                            <Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
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
                                        <Badge variant={getStatusStyles(req.status).variant} className="gap-1.5 py-1 px-2.5">
                                            {getStatusStyles(req.status).icon}
                                            {getStatusStyles(req.status).label}
                                        </Badge>
                                    </td>
                                    <td className="px-6 py-4">
                                        {req.assignee_name ? (
                                            <div
                                                className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-1.5 rounded-lg -ml-1.5 transition-colors group/agent dark:hover:bg-gray-700"
                                                onClick={() => handleAssign(req)}
                                                title="คลิกเพื่อเปลี่ยนผู้รับผิดชอบ"
                                            >
                                                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-[10px] font-bold text-blue-600 group-hover/agent:bg-blue-200 transition-colors dark:bg-blue-500/20 dark:text-blue-400">
                                                    {req.assignee_name[0]}
                                                </div>
                                                <span className="text-xs font-medium text-gray-600 group-hover/agent:text-blue-700 dark:text-gray-300">{req.assignee_name}</span>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handleAssign(req)}
                                                className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 p-1 rounded-full pr-2.5 border border-transparent hover:border-gray-200 transition-all group/assign dark:hover:bg-gray-700 dark:hover:border-gray-600"
                                                title="มอบหมายเจ้าหน้าที่"
                                            >
                                                <div className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 group-hover/assign:bg-brand-500 group-hover/assign:text-white transition-colors shadow-sm dark:bg-gray-700">
                                                    <UserPlus className="w-3 h-3" />
                                                </div>
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider group-hover/assign:text-brand-600 transition-colors dark:text-gray-500 dark:group-hover/assign:text-brand-400">Assign</span>
                                            </button>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <ActionIconButton
                                                icon={<Eye size={16} />}
                                                label="เรียกดู"
                                                variant="default"
                                                onClick={() => handleView(req)}
                                            />
                                            <Link href={`/admin/requests/${req.id}`}>
                                                <ActionIconButton
                                                    icon={<SquarePen size={16} />}
                                                    label="แก้ไข"
                                                    variant="warning"
                                                />
                                            </Link>
                                            <ActionIconButton
                                                icon={<Trash2 size={16} />}
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
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/30 flex items-center justify-between dark:border-gray-700 dark:bg-gray-800/30">
                    <p className="text-xs text-gray-500 font-medium dark:text-gray-400">Showing {requests.length} requests</p>
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
                                <label className="text-xs text-gray-500 dark:text-gray-400">ชื่อ-นามสกุล</label>
                                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{selectedRequest.firstname} {selectedRequest.lastname}</p>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400">หมวดหมู่</label>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{selectedRequest.topic_category}</p>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400">สถานะ</label>
                                <div className="mt-1">
                                    <Badge variant={getStatusStyles(selectedRequest.status).variant}>
                                        {getStatusStyles(selectedRequest.status).label}
                                    </Badge>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400">วันที่ยื่น</label>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {new Date(selectedRequest.created_at).toLocaleDateString('th-TH')}
                                </p>
                            </div>
                            <div className="col-span-2">
                                <label className="text-xs text-gray-500 dark:text-gray-400">หน่วยงาน</label>
                                <p className="text-sm text-gray-700 dark:text-gray-300">{selectedRequest.agency}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{selectedRequest.province} › {selectedRequest.district}</p>
                            </div>
                        </div>
                        <div className="pt-4 border-t border-gray-100 flex justify-end dark:border-gray-700">
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
                    <p className="text-sm text-gray-600 dark:text-gray-400">
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
