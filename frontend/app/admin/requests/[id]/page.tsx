'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
    User,
    Clock,
    FileText,
    CheckCircle2,
    Calendar,
    Building2,
    Paperclip,
    Send,
    UserPlus,
    MessageSquare,
    Phone,
    Mail,
    Flag,
    Settings2,
    ChevronLeft,
    Activity
} from 'lucide-react';
import { AssignModal } from '@/components/admin/AssignModal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import PageHeader from '../../components/PageHeader';

// Interfaces for API Data
interface Comment {
    id: number;
    content: string;
    user_id: number;
    display_name: string;
    created_at: string;
}

interface ServiceRequestDetail {
    id: number;
    prefix: string;
    firstname: string;
    lastname: string;
    phone_number: string;
    email: string;
    agency: string;
    province: string;
    district: string;
    sub_district: string;
    topic_category: string;
    topic_subcategory: string;
    description: string;
    attachments: Array<{ name: string; url: string }>;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    due_date?: string;
    created_at: string;
    assigned_agent_id?: number;
    assignee_name?: string;
}

type RequestUpdatePayload = Record<string, unknown>;

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

export default function RequestDetailPage() {
    const params = useParams();
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState('details');
    const [request, setRequest] = useState<ServiceRequestDetail | null>(null);
    // Local state for Manage Tab (Bulk Save)
    const [manageFormData, setManageFormData] = useState({
        status: '',
        priority: '',
        due_date: '',
        comment: ''
    });
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [submittingComment, setSubmittingComment] = useState(false);
    const [assignModalOpen, setAssignModalOpen] = useState(false);

    const API_BASE = '/api/v1';

    // --- API Fetching ---
    const fetchDetail = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/requests/${params.id}`);
            if (!res.ok) throw new Error('Failed to fetch request detail');
            const data = await res.json();
            setRequest(data);
            // Initialize local form state
            setManageFormData(prev => ({
                ...prev,
                status: data.status,
                priority: data.priority,
                due_date: data.due_date ? data.due_date.split('T')[0] : '',
                comment: '' // Reset comment on reload
            }));
        } catch (err: unknown) {
            console.error(getErrorMessage(err));
        } finally {
            setLoading(false);
        }
    }, [API_BASE, params.id]);

    const fetchComments = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/requests/${params.id}/comments`);
            if (!res.ok) throw new Error('Failed to fetch comments');
            const data = await res.json();
            setComments(data);
        } catch (err) {
            console.error(err);
        }
    }, [API_BASE, params.id]);

    useEffect(() => {
        if (params.id) {
            const timer = window.setTimeout(() => {
                void fetchDetail();
                void fetchComments();
            }, 0);
            return () => window.clearTimeout(timer);
        }
    }, [fetchComments, fetchDetail, params.id]);

    // --- Handlers ---
    const handleUpdateField = async (fieldData: RequestUpdatePayload) => {
        try {
            const res = await fetch(`${API_BASE}/admin/requests/${params.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fieldData)
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(errorData.detail || 'Update failed');
            }
            await fetchDetail();
        } catch (err: unknown) {
            toast({ title: 'ผิดพลาด', description: getErrorMessage(err), variant: 'error' });
            throw err; // Re-throw to handle in caller
        }
    };

    // Bulk Save Handler for Manage Tab
    const handleSaveManage = async () => {
        if (!request) return;

        // 1. Prepare data for update (only if changed)
        const updates: Record<string, string | null> = {};
        if (manageFormData.status !== request.status) updates.status = manageFormData.status;
        if (manageFormData.priority !== request.priority) updates.priority = manageFormData.priority;

        // Date handling: Handle empty string vs undefined
        const currentDueDate = request.due_date ? request.due_date.split('T')[0] : '';
        if (manageFormData.due_date !== currentDueDate) {
            updates.due_date = manageFormData.due_date || null; // Send null to clear
        }

        try {
            setLoading(true); // Show global loading or local loading

            // 2. Perform Update if there are changes
            if (Object.keys(updates).length > 0) {
                await handleUpdateField(updates);
            }

            // 3. Post Comment if exists
            if (manageFormData.comment.trim()) {
                const res = await fetch(`${API_BASE}/admin/requests/${params.id}/comments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: manageFormData.comment })
                });
                if (!res.ok) throw new Error('Failed to post comment');
                await fetchComments();
            }

            // 4. Success feedback
            toast({ title: 'สำเร็จ', description: 'บันทึกเรียบร้อย', variant: 'success' });

            // Note: fetchDetail() is called inside handleUpdateField, effectively syncing state
            // But if only comment was added, we might need to manually sync or rely on the fact that request didn't change.
            // For safety, let's ensure we are synced.
            if (Object.keys(updates).length === 0) {
                // If no updates to request, fetchDetail wasn't called.
                // But we want to clear the comment field in local state.
                setManageFormData(prev => ({ ...prev, comment: '' }));
            }

        } catch (err: unknown) {
            toast({ title: 'ผิดพลาด', description: getErrorMessage(err), variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleCancelManage = () => {
        if (!request) return;
        // Revert to original request data
        setManageFormData({
            status: request.status,
            priority: request.priority,
            due_date: request.due_date ? request.due_date.split('T')[0] : '',
            comment: ''
        });
    };

    const handleAddComment = async () => {
        if (!newComment.trim()) return;

        setSubmittingComment(true);
        try {
            const res = await fetch(`${API_BASE}/admin/requests/${params.id}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newComment })
            });
            if (!res.ok) throw new Error('Failed to post comment');
            setNewComment('');
            fetchComments();
        } catch (err: unknown) {
            toast({ title: 'ผิดพลาด', description: getErrorMessage(err), variant: 'error' });
        } finally {
            setSubmittingComment(false);
        }
    };

    const handleAssignRequest = async (agentId: number) => {
        // For assignment, we update immediately as it's a specific modal action
        await handleUpdateField({
            assigned_agent_id: agentId,
            status: request?.status === 'PENDING' ? 'IN_PROGRESS' : undefined
        });
        // Also update local state to reflect the status change if it happened
        if (request?.status === 'PENDING') {
            setManageFormData(prev => ({ ...prev, status: 'IN_PROGRESS' }));
        }
    };

    // --- UI Helpers ---
    const tabs = [
        { id: 'details', label: 'รายละเอียดคำร้อง', icon: FileText },
        { id: 'contact', label: 'ข้อมูลผู้ติดต่อ', icon: User },
        { id: 'comments', label: 'การดำเนินงาน/ความเห็น', icon: MessageSquare },
        { id: 'manage', label: 'จัดการคำร้อง', icon: Settings2 },
    ];

    if (loading) return <LoadingSpinner label="กำลังโหลด..." />;

    if (!request) return <div className="p-8 text-center">ไม่พบข้อมูลคำร้อง</div>;

    return (
        <div className="p-4 md:p-8 text-text-primary animate-in fade-in duration-500">
            <div className="max-w-5xl mx-auto">

                {/* PageHeader */}
                <PageHeader title={`#${request.id} ${request.topic_category}`}>
                    <Link href="/admin/requests">
                        <Button variant="ghost" size="icon-sm">
                            <ChevronLeft className="w-5 h-5" />
                        </Button>
                    </Link>
                    <Button
                        variant="warning"
                        size="sm"
                        onClick={() => handleUpdateField({ status: 'IN_PROGRESS' })}
                        disabled={request.status === 'COMPLETED' || request.status === 'REJECTED' || request.status === 'IN_PROGRESS'}
                        leftIcon={<Clock size={18} />}
                    >
                        รับเรื่อง
                    </Button>
                    <Button
                        variant="success"
                        size="sm"
                        onClick={() => handleUpdateField({ status: 'COMPLETED' })}
                        disabled={request.status === 'COMPLETED'}
                        leftIcon={<CheckCircle2 size={18} />}
                    >
                        เสร็จสิ้น
                    </Button>
                </PageHeader>

                {/* Status & Priority Badges + Tab Card */}
                <div className="bg-surface rounded-t-2xl shadow-sm border-x border-t border-border-default p-4 md:p-6 mt-6">
                    <div className="flex flex-wrap items-center gap-3">
                                    <span className={`px-3 py-1 rounded-lg text-[10px] font-bold border transition-all ${request.priority === 'URGENT' ? 'bg-rose-50 border-rose-200 text-rose-600' :
                                        request.priority === 'HIGH' ? 'bg-orange-50 border-orange-200 text-orange-600' :
                                            request.priority === 'MEDIUM' ? 'bg-yellow-50 border-yellow-200 text-yellow-600' :
                                                'bg-emerald-50 border-emerald-200 text-emerald-600'
                                        }`}>
                                        {request.priority === 'URGENT' ? 'ด่วนที่สุด' :
                                            request.priority === 'HIGH' ? 'ด่วนมาก' :
                                                request.priority === 'MEDIUM' ? 'ด่วน' :
                                                    request.priority === 'LOW' ? 'ปกติ' : 'ไม่ระบุ'}
                                    </span>

                                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ring-1 ring-inset inline-flex items-center gap-1 ${request.status === 'PENDING' ? 'bg-amber-50 text-amber-700 ring-amber-200' :
                                        request.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700 ring-blue-200' :
                                            request.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
                                                request.status === 'REJECTED' ? 'bg-rose-50 text-rose-700 ring-rose-200' :
                                                    'bg-bg text-text-secondary ring-border-default' // Default / Null
                                        }`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${request.status === 'PENDING' ? 'bg-amber-500' :
                                            request.status === 'IN_PROGRESS' ? 'bg-blue-500' :
                                                request.status === 'COMPLETED' ? 'bg-emerald-500' :
                                                    request.status === 'REJECTED' ? 'bg-rose-500' :
                                                        'bg-text-tertiary'
                                            }`}></div>
                                        {request.status === 'PENDING' ? 'รอดำเนินการ' :
                                            request.status === 'IN_PROGRESS' ? 'กำลังดำเนินการ' :
                                                request.status === 'COMPLETED' ? 'เสร็จสิ้น' :
                                                    request.status === 'REJECTED' ? 'ยกเลิก' : 'มาใหม่'}
                                    </span>
                                </div>
                </div>

                {/* Tab Navigation */}
                <div className="bg-surface border-x border-b border-border-default px-2 flex justify-center overflow-x-auto no-scrollbar">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-3 text-xs font-bold transition-all border-b-2 whitespace-nowrap outline-none cursor-pointer ${activeTab === tab.id
                                ? 'border-primary text-primary'
                                : 'border-transparent text-text-tertiary hover:text-text-secondary'
                                }`}
                        >
                            <tab.icon size={16} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content Area */}
                <div className="bg-surface rounded-b-2xl shadow-sm border-x border-b border-border-default p-4 sm:p-6 md:p-8 min-h-[400px]">

                    {/* 1. รายละเอียดคำร้อง */}
                    {activeTab === 'details' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            {/* Card Header: Category info V2 */}
                            <div className="pb-6 border-b border-border-default flex items-start gap-4">
                                <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary-dark rounded-2xl flex items-center justify-center text-white shadow-primary/20 shadow-lg shrink-0">
                                    <CheckCircle2 size={24} />
                                </div>
                                <div className="flex items-center gap-6 h-12">
                                    <div className="flex flex-col justify-center h-full">
                                        <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">หมวดหมู่</span>
                                        <span className="text-base font-bold text-text-primary">{request.topic_category}</span>
                                    </div>
                                    <div className="w-px h-8 bg-border-default"></div>
                                    <div className="flex flex-col justify-center h-full">
                                        <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">ประเภท</span>
                                        <span className="text-base font-bold text-text-primary">{request.topic_subcategory || "-"}</span>
                                    </div>
                                </div>
                            </div>

                            {/* 4-Item Info Grid - Equal Widths */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 py-2">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider">วันที่ยื่นคำร้อง</label>
                                    <div className="text-sm font-semibold text-text-primary">
                                        {new Date(request.created_at).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider">ระดับความสำคัญ</label>
                                    <div>
                                        <span className={`px-3 py-1 rounded-lg text-xs font-bold border inline-block text-center min-w-[80px] ${request.priority === 'URGENT' ? 'bg-rose-50 border-rose-200 text-rose-600' :
                                            request.priority === 'HIGH' ? 'bg-orange-50 border-orange-200 text-orange-600' :
                                                request.priority === 'MEDIUM' ? 'bg-yellow-50 border-yellow-200 text-yellow-600' :
                                                    'bg-emerald-50 border-emerald-200 text-emerald-600'
                                            }`}>
                                            {request.priority === 'URGENT' ? 'ด่วนที่สุด' :
                                                request.priority === 'HIGH' ? 'ด่วนมาก' :
                                                    request.priority === 'MEDIUM' ? 'ด่วน' :
                                                        'ปกติ'}
                                        </span>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider">กำหนดแล้วเสร็จ</label>
                                    <div className={`text-sm font-semibold ${request.due_date ? 'text-text-primary' : 'text-text-tertiary italic'}`}>
                                        {request.due_date ? new Date(request.due_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : 'ไม่ได้กำหนด'}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider">ผู้รับผิดชอบ</label>
                                    <div className={`text-sm font-semibold ${request.assignee_name ? 'text-text-primary' : 'text-text-tertiary italic'}`}>
                                        {request.assignee_name || "ยังไม่ได้มอบหมาย"}
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-border-default"></div>


                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider">รายละเอียดเพิ่มเติม</label>
                                <div className="w-full px-4 py-3 bg-bg border border-border-default rounded-xl text-sm leading-relaxed whitespace-pre-wrap min-h-[100px]">
                                    {request.description || "ไม่มีรายละเอียดเพิ่มเติม"}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider">ไฟล์แนบ ({request.attachments?.length || 0})</label>
                                <div className="flex flex-wrap gap-2">
                                    {request.attachments?.map((file, idx) => (
                                        <a key={idx} href={file.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-surface border border-border-default rounded-lg text-xs font-semibold text-text-secondary hover:border-primary/40 hover:text-primary hover:bg-primary/8 transition-all cursor-pointer">
                                            <Paperclip size={14} className="text-primary" /> {file.name}
                                        </a>
                                    ))}
                                    {(!request.attachments || request.attachments.length === 0) && (
                                        <span className="text-xs text-text-tertiary italic">ไม่มีไฟล์แนบ</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 2. ข้อมูลผู้ติดต่อ */}
                    {activeTab === 'contact' && (
                        <div className="space-y-8 animate-in fade-in duration-300">
                            <div className="flex flex-col items-center p-6 bg-bg rounded-2xl border border-border-default">
                                <div className="w-24 h-24 rounded-full border-4 border-white shadow-md mb-4 bg-primary/12 flex items-center justify-center text-primary text-3xl font-bold">
                                    {request.firstname[0]}
                                </div>
                                <h3 className="text-lg font-bold text-text-primary">{request.prefix}{request.firstname} {request.lastname}</h3>
                                <p className="text-sm text-primary font-bold">{request.agency}</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 border border-border-default rounded-xl flex items-center gap-4">
                                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shrink-0"><Building2 size={20} /></div>
                                    <div className="overflow-hidden">
                                        <p className="text-xs font-bold text-text-tertiary uppercase">หน่วยงาน / ที่อยู่</p>
                                        <p className="text-sm font-bold truncate">{request.sub_district}, {request.district}, {request.province}</p>
                                    </div>
                                </div>
                                <div className="p-4 border border-border-default rounded-xl flex items-center gap-4">
                                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shrink-0"><Phone size={20} /></div>
                                    <div>
                                        <p className="text-xs font-bold text-text-tertiary uppercase">หมายเลขโทรศัพท์</p>
                                        <p className="text-sm font-bold">{request.phone_number}</p>
                                    </div>
                                </div>
                                <div className="p-4 border border-border-default rounded-xl flex items-center gap-4 md:col-span-2">
                                    <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center shrink-0"><Mail size={20} /></div>
                                    <div>
                                        <p className="text-xs font-bold text-text-tertiary uppercase">อีเมล</p>
                                        <p className="text-sm font-bold">{request.email || "-"}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 3. การดำเนินงาน/ความเห็น */}
                    {/* 3. การดำเนินงาน/ความเห็น */}
                    {activeTab === 'comments' && (
                        <div className="space-y-8 animate-in fade-in duration-300 px-2">
                            {/* Timeline History */}
                            <div className="relative pl-8 border-l-2 border-border-default space-y-8 ml-3">
                                {comments.length === 0 ? (
                                    <div className="text-center py-10 text-text-tertiary text-xs italic pl-4">ยังไม่มีประวัติการดำเนินงาน</div>
                                ) : comments.map((comment, i) => {
                                    // Determine styling based on user role/name
                                    const isSystem = comment.display_name?.toUpperCase() === 'SYSTEM';
                                    const isAdmin = comment.display_name?.toUpperCase().includes('ADMIN');

                                    const dotColor = isSystem ? 'bg-amber-400 shadow-amber-100' :
                                        isAdmin ? 'bg-primary shadow-primary/10' :
                                            'bg-text-tertiary shadow-border-default';

                                    return (
                                        <div key={i} className="relative group">
                                            {/* Timeline Dot */}
                                            <div className={`absolute -left-[39px] top-0 w-5 h-5 rounded-full border-4 border-white shadow-md ${dotColor}`}></div>

                                            {/* Header */}
                                            <div className="flex items-center justify-between mb-2">
                                                <span className={`text-xs font-bold uppercase tracking-wider ${isSystem ? 'text-amber-500' : isAdmin ? 'text-primary' : 'text-text-secondary'}`}>
                                                    {comment.display_name}
                                                </span>
                                                <span className="text-[10px] font-bold text-text-tertiary">
                                                    {new Date(comment.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}, {new Date(comment.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>

                                            {/* Content Bubble */}
                                            <div className="bg-bg border border-border-default rounded-2xl rounded-tl-sm p-4 text-sm text-text-secondary leading-relaxed shadow-sm group-hover:bg-surface group-hover:border-border-default group-hover:shadow-md transition-all">
                                                {comment.content}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Divider */}
                            <div className="border-t border-border-default my-8"></div>

                            {/* Comment Input */}
                            <div className="bg-surface rounded-2xl border border-border-default p-6 shadow-sm">
                                <h4 className="text-sm font-bold text-text-secondary mb-4">เพิ่มความเห็น</h4>
                                <div className="space-y-4">
                                    <textarea
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        placeholder="พิมพ์ความเห็นหรือบันทึกการดำเนินงาน..."
                                        className="w-full p-4 bg-bg border border-border-default rounded-xl text-sm outline-none focus:border-primary/40 focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all resize-none min-h-[120px]"
                                    ></textarea>
                                    <div className="flex justify-end">
                                        <button
                                            onClick={handleAddComment}
                                            disabled={!newComment.trim() || submittingComment}
                                            className={`flex items-center gap-2 px-6 py-2.5 bg-gradient-to-br from-primary to-primary-dark text-white rounded-xl text-sm font-bold hover:bg-primary-dark transition-all shadow-lg shadow-primary/20 ${!newComment.trim() || submittingComment ? 'opacity-50 shadow-none cursor-default' : 'cursor-pointer'}`}
                                            title="Save Comment"
                                        >
                                            <Send size={16} /> บันทึกข้อมูล
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 4. จัดการคำร้อง */}
                    {activeTab === 'manage' && (
                        <div className="space-y-8 animate-in fade-in duration-300">
                            {/* Row 1: Status + Priority */}
                            <div className="space-y-3">
                                {/* Labels Row */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider flex items-center gap-2">
                                        <Activity size={14} className="text-cyan-500" /> สถานะคำร้อง
                                    </label>
                                    <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider flex items-center gap-2">
                                        <Flag size={14} className="text-amber-500" /> ระดับความสำคัญ
                                    </label>
                                </div>
                                {/* Buttons Row */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Status Buttons */}
                                    <div className="flex gap-2">
                                        {[
                                            { value: 'PENDING', label: 'รอดำเนินการ', activeClass: 'bg-amber-50 text-amber-700 border-amber-400', dotClass: 'bg-amber-500' },
                                            { value: 'IN_PROGRESS', label: 'กำลังดำเนินการ', activeClass: 'bg-blue-50 text-blue-700 border-blue-400', dotClass: 'bg-blue-500' },
                                            { value: 'AWAITING_APPROVAL', label: 'รออนุมัติ', activeClass: 'bg-primary/8 text-primary border-primary/40', dotClass: 'bg-primary' },
                                            { value: 'COMPLETED', label: 'เสร็จสิ้น', activeClass: 'bg-emerald-50 text-emerald-700 border-emerald-400', dotClass: 'bg-emerald-500' }
                                        ].map((s) => (
                                            <button
                                                key={s.value}
                                                // Update Local State Only
                                                onClick={() => setManageFormData(prev => ({ ...prev, status: s.value }))}
                                                className={`flex-1 px-2 py-2.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 border whitespace-nowrap ${manageFormData.status === s.value
                                                    ? s.activeClass
                                                    : 'bg-surface text-text-tertiary border-border-default hover:border-text-tertiary hover:bg-bg'
                                                    }`}
                                            >
                                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${manageFormData.status === s.value ? s.dotClass : 'bg-text-tertiary'}`}></span>
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                    {/* Priority Buttons */}
                                    <div className="flex gap-2">
                                        {[
                                            { value: 'LOW', label: 'ปกติ' },
                                            { value: 'MEDIUM', label: 'ด่วน' },
                                            { value: 'HIGH', label: 'ด่วนมาก' },
                                            { value: 'URGENT', label: 'ด่วนที่สุด' }
                                        ].map((p) => (
                                            <button
                                                key={p.value}
                                                // Update Local State Only
                                                onClick={() => setManageFormData(prev => ({ ...prev, priority: p.value }))}
                                                className={`flex-1 px-2 py-2.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer border whitespace-nowrap ${manageFormData.priority === p.value
                                                    ? (p.value === 'URGENT' ? 'bg-rose-50 text-rose-700 border-rose-400' :
                                                        p.value === 'HIGH' ? 'bg-orange-50 text-orange-700 border-orange-400' :
                                                            p.value === 'MEDIUM' ? 'bg-yellow-50 text-yellow-700 border-yellow-400' :
                                                                'bg-emerald-50 text-emerald-700 border-emerald-400')
                                                    : 'bg-surface text-text-tertiary border-border-default hover:border-text-tertiary hover:bg-bg'
                                                    }`}
                                            >
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Row 2: Assignment + Due Date */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider flex items-center gap-2">
                                        <UserPlus size={14} className="text-primary" /> มอบหมายงานให้
                                    </label>
                                    <div
                                        onClick={() => setAssignModalOpen(true)}
                                        className="w-full px-4 py-2.5 bg-bg border border-border-default rounded-lg text-sm font-bold cursor-pointer hover:bg-bg transition-colors flex justify-between items-center"
                                    >
                                        <span>{request.assignee_name || "ยังไม่ได้มอบหมาย"}</span>
                                        <Settings2 size={16} className="text-text-tertiary" />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider flex items-center gap-2">
                                        <Calendar size={14} className="text-amber-500" /> กำหนดเสร็จ (Due Date)
                                    </label>
                                    <input
                                        type="date"
                                        className="w-full px-4 py-2.5 bg-bg border border-border-default rounded-lg text-sm font-bold outline-none cursor-pointer"
                                        // Use Local State
                                        value={manageFormData.due_date}
                                        onChange={(e) => setManageFormData(prev => ({ ...prev, due_date: e.target.value }))}
                                    />
                                </div>
                            </div>

                            {/* Row 3: Comment / Note Field */}
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider flex items-center gap-2">
                                    <MessageSquare size={14} className="text-text-tertiary" /> บันทึกช่วยจำ / เหตุผลการดำเนินการ
                                </label>
                                <textarea
                                    value={manageFormData.comment}
                                    onChange={(e) => setManageFormData(prev => ({ ...prev, comment: e.target.value }))}
                                    placeholder="ระบุรายละเอียดการดำเนินการ, เหตุผลการยกเลิก, หรือข้อความถึงผู้เกี่ยวข้อง..."
                                    className="w-full p-4 bg-bg border border-border-default rounded-xl text-sm outline-none focus:border-primary/40 focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all resize-none min-h-[100px]"
                                ></textarea>
                            </div>

                            {/* Action Buttons */}
                            <div className="pt-6 border-t border-border-default flex justify-end gap-3">
                                <button
                                    onClick={handleCancelManage}
                                    className="px-5 py-2.5 bg-muted text-text-secondary rounded-xl text-sm font-bold hover:bg-muted transition-all cursor-pointer"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    onClick={handleSaveManage}
                                    className="px-6 py-2.5 bg-gradient-to-br from-primary to-primary-dark text-white rounded-xl text-sm font-bold hover:bg-primary-dark transition-all shadow-lg shadow-primary/20 cursor-pointer flex items-center gap-2"
                                >
                                    <CheckCircle2 size={18} /> บันทึก
                                </button>
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer info */}
                <div className="mt-6 px-4 flex justify-between items-center text-[10px] text-text-tertiary font-bold uppercase tracking-widest">
                    <p>© 2026 Admin Portal</p>
                    <div className="flex gap-4">
                        <span className="cursor-pointer hover:text-primary">Manual</span>
                        <span className="cursor-pointer hover:text-primary">Support</span>
                    </div>
                </div>

            </div>

            <AssignModal
                isOpen={assignModalOpen}
                onClose={() => setAssignModalOpen(false)}
                onAssign={handleAssignRequest}
                currentAssigneeId={request.assigned_agent_id}
            />
        </div>
    );
}
