'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
    User,
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
    Activity,
    Inbox,
    ShieldCheck,
    XCircle,
    Play,
    MoreVertical,
    RotateCcw,
    Undo2,
    UserX,
    Forward,
} from 'lucide-react';
import { AssignModal } from '@/components/admin/AssignModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EscalationDialog } from '@/components/ui/EscalationDialog';
import { Button } from '@/components/ui/Button';
import CalendarPickerTH from '@/components/ui/CalendarPickerTH';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui/DropdownMenu';
import { useToast } from '@/components/ui/Toast';
import {
    type RequestStatus,
    getStatusLabelForRequest,
} from '@/lib/constants/request-status';
import { usePermissions } from '@/lib/permissions';
import { useAuth } from '@/contexts/AuthContext';
import { useGuardedUpdate } from '@/hooks/useGuardedUpdate';
import { logger } from '@/lib/logger';

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
    // Backend RequestStatus enum (UPPERCASE). Nullable for legacy rows.
    status: RequestStatus | null;
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
    const [unassignDialogOpen, setUnassignDialogOpen] = useState(false);
    const [escalationDialogOpen, setEscalationDialogOpen] = useState(false);
    // PRD B: revert-from-COMPLETED flow. Both kebab items share one
    // dialog — `target` records which status to revert to so the
    // ConfirmDialog body can interpolate the right label.
    const [revertConfirm, setRevertConfirm] = useState<{
        open: boolean
        target: 'AWAITING_APPROVAL' | 'IN_PROGRESS' | null
        notes: string
    }>({ open: false, target: null, notes: '' });

    // Permission state for workflow button visibility.
    // - userId: numeric form of the logged-in user's id (AuthContext stores as string)
    // - isAssignee: this user is the one the request is assigned to
    // - canApprove / canAssign: this user is a supervisor who can approve/reject/reassign
    const permissions = usePermissions();
    const { user } = useAuth();
    const userId = user?.id ? Number(user.id) : null;

    const API_BASE = '/api/v1';

    // --- API Fetching ---
    const fetchDetail = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/requests/${params.id}`);
            if (!res.ok) throw new Error('Failed to fetch request detail');
            const data = await res.json();
            setRequest(data);
            // Initialize local form state. Coerce nullable status -> '' so
            // the manage form (string-typed) stays well-typed.
            setManageFormData(prev => ({
                ...prev,
                status: data.status ?? '',
                priority: data.priority,
                due_date: data.due_date ? data.due_date.split('T')[0] : '',
                comment: '' // Reset comment on reload
            }));
        } catch (err: unknown) {
            logger.error(getErrorMessage(err));
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
            logger.error(err);
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
    // Stable reference so the calendar's dayCells useMemo doesn't invalidate every render.
    const handleDueDateChange = useCallback((iso: string | null) => {
        if (!iso) {
            setManageFormData(prev => ({ ...prev, due_date: '' }));
            return;
        }
        const d = new Date(iso);
        const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        setManageFormData(prev => ({ ...prev, due_date: ymd }));
    }, []);

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
            throw err; // Re-throw so handleSaveManage can stop the bulk-save flow
        }
    };

    // In-flight guard for one-shot workflow buttons -- see useGuardedUpdate
    // for behavior contract (drops concurrent calls, catches rejections).
    const [submitting, guardedUpdate] = useGuardedUpdate(handleUpdateField);

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
        // Revert to original request data. Coerce nullable status -> '' so
        // the form (which expects string) stays well-typed.
        setManageFormData({
            status: request.status ?? '',
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

    const handleUnassign = async () => {
        await handleUpdateField({ unassign: true });
        setUnassignDialogOpen(false);
    };

    const handleEscalate = async (agency: string, reason: string) => {
        await handleUpdateField({
            details: {
                escalated_to: agency,
                escalation_reason: reason,
                escalated_at: new Date().toISOString(),
            }
        });
        setEscalationDialogOpen(false);
        toast({
            title: 'ส่งต่อสำเร็จ',
            description: `ส่งต่อคำร้องไปยัง ${agency} เรียบร้อยแล้ว`,
            variant: 'success',
        });
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

    // Derived authorisation state -- must be after the null check on `request`.
    // - isAssignee: user is the one this request is assigned to (drives the
    //   "รับเรื่อง" / "เริ่มดำเนินการ" / "ส่งอนุมัติ" buttons on the assignee path)
    // - canApprove: user has supervisor-tier permissions (drives "อนุมัติ" /
    //   "ปฏิเสธ" / "มอบหมาย" buttons on the supervisor path)
    const isAssignee = userId !== null && request.assigned_agent_id === userId;
    const canApprove = permissions?.can_assign ?? false;
    const canRevertApproval = permissions?.can_revert_approval ?? false;

    return (
        <div className="p-4 md:p-8 text-text-primary animate-in fade-in duration-500">
            <div className="max-w-5xl mx-auto">

                {/* "กลับ" text button -- replaces icon-only chevron, more discoverable on mobile */}
                <div className="mb-4">
                    <Link href="/admin/requests">
                        <Button variant="outline" size="sm" leftIcon={<ChevronLeft size={16} />}>
                            กลับ
                        </Button>
                    </Link>
                </div>

                {/* PRD B: Merged card layout. The hero (title row + subcategory caption),
                    tab navigation, and tab content live inside ONE outer card with internal
                    border-t dividers between sections. PR #53's Linear-inspired single-row
                    hero layout is preserved verbatim — only the OUTER chrome was previously
                    three separate cards, which user feedback described as "fragmented".

                    Why one outer card: the prior 3-card stack (hero / tab-nav / tab-content)
                    used 3 borders and 2 gap rows for what reads naturally as a single
                    document. Merging keeps Linear-style hero density while restoring the
                    "one page = one unit" feel.

                    Why explicit `border-t` dividers vs `:nth-child` magic: the dividers are
                    auditable from JSX and survive accidental content reordering. */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-default mb-6">

                    {/* Hero section -- Linear-inspired single-row layout. Title + badges +
                        actions live on one flex row that wraps gracefully on narrow viewports.
                        `ml-auto` pushes the action group to the right edge on desktop; on
                        mobile the buttons drop to their own line below the badges. */}
                    <div className="p-4 md:p-5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <h1 className="text-lg sm:text-xl font-bold text-text-primary tracking-tight thai-no-break">
                            {request.topic_category}
                        </h1>

                        {/* Status + priority badges -- inline with title. Shared shape:
                            h-7 (28px), text-[11px], ring-1 ring-inset. Status carries
                            visual weight (dot + label), priority is plain chip. */}
                        <span className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-bold ring-1 ring-inset shrink-0 ${
                            request.status === 'PENDING' ? (request.assigned_agent_id ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-bg text-text-secondary ring-border-default') :
                            request.status === 'ACKNOWLEDGED' ? 'bg-orange-50 text-orange-700 ring-orange-200' :
                            request.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700 ring-blue-200' :
                            request.status === 'AWAITING_APPROVAL' ? 'bg-violet-50 text-violet-700 ring-violet-200' :
                            request.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
                            request.status === 'REJECTED' ? 'bg-rose-50 text-rose-700 ring-rose-200' :
                            'bg-bg text-text-secondary ring-border-default'
                        }`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                request.status === 'PENDING' ? (request.assigned_agent_id ? 'bg-amber-500' : 'bg-text-tertiary') :
                                request.status === 'ACKNOWLEDGED' ? 'bg-orange-500' :
                                request.status === 'IN_PROGRESS' ? 'bg-blue-500' :
                                request.status === 'AWAITING_APPROVAL' ? 'bg-violet-500' :
                                request.status === 'COMPLETED' ? 'bg-emerald-500' :
                                request.status === 'REJECTED' ? 'bg-rose-500' :
                                'bg-text-tertiary'
                            }`}></span>
                            {getStatusLabelForRequest(request)}
                        </span>

                        <span className={`inline-flex items-center h-7 px-2.5 rounded-lg text-[11px] font-bold ring-1 ring-inset shrink-0 transition-all ${
                            request.priority === 'URGENT' ? 'bg-rose-50 text-rose-700 ring-rose-200' :
                            request.priority === 'HIGH' ? 'bg-orange-50 text-orange-700 ring-orange-200' :
                            request.priority === 'MEDIUM' ? 'bg-yellow-50 text-yellow-700 ring-yellow-200' :
                            request.priority === 'LOW' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
                            'bg-bg text-text-secondary ring-border-default'
                        }`}>
                            {request.priority === 'URGENT' ? 'ด่วนที่สุด' :
                                request.priority === 'HIGH' ? 'ด่วนมาก' :
                                    request.priority === 'MEDIUM' ? 'ด่วน' :
                                        request.priority === 'LOW' ? 'ปกติ' : 'ไม่ระบุ'}
                        </span>

                        {/* Action group: pushed to the right via ml-auto on flex parent.
                            Permission tiers:
                            - Primary advance: assignee OR supervisor (canApprove)
                            - Approval / reject / reopen: supervisor only
                            - Override kebab: supervisor only, surfaces force-complete + revert-to-pending */}
                        <div className="flex flex-wrap items-center gap-2 ml-auto">
                        {/* "มอบหมาย" / "เปลี่ยนผู้รับผิดชอบ": supervisor only, open states */}
                        {canApprove && request.status !== 'COMPLETED' && request.status !== 'REJECTED' && (
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => setAssignModalOpen(true)}
                                leftIcon={<UserPlus size={18} />}
                            >
                                {request.assigned_agent_id ? 'เปลี่ยนผู้รับผิดชอบ' : 'มอบหมาย'}
                            </Button>
                        )}

                        {/* "ส่งต่อหน่วยงานเฉพาะทาง": supervisor only, drug category only */}
                        {canApprove && request.topic_category === 'แจ้งเบาะแสยาเสพติด' && request.status !== 'COMPLETED' && request.status !== 'REJECTED' && (
                            <Button
                                variant="warning"
                                size="sm"
                                onClick={() => setEscalationDialogOpen(true)}
                                leftIcon={<Forward size={18} />}
                            >
                                ส่งต่อหน่วยงานเฉพาะทาง
                            </Button>
                        )}

                        {/* "รับเรื่อง": assignee OR supervisor — supervisor can advance on assignee's behalf */}
                        {request.status === 'PENDING' && (isAssignee || canApprove) && (
                            <Button
                                variant="warning"
                                size="sm"
                                disabled={submitting}
                                onClick={() => { void guardedUpdate({ status: 'ACKNOWLEDGED' }); }}
                                leftIcon={<Inbox size={18} />}
                            >
                                รับเรื่อง
                            </Button>
                        )}

                        {/* "เริ่มดำเนินการ": assignee OR supervisor */}
                        {request.status === 'ACKNOWLEDGED' && (isAssignee || canApprove) && (
                            <Button
                                variant="primary"
                                size="sm"
                                disabled={submitting}
                                onClick={() => { void guardedUpdate({ status: 'IN_PROGRESS' }); }}
                                leftIcon={<Play size={18} />}
                            >
                                เริ่มดำเนินการ
                            </Button>
                        )}

                        {/* "ส่งอนุมัติ": assignee OR supervisor */}
                        {request.status === 'IN_PROGRESS' && (isAssignee || canApprove) && (
                            <Button
                                variant="primary"
                                size="sm"
                                disabled={submitting}
                                onClick={() => { void guardedUpdate({ status: 'AWAITING_APPROVAL' }); }}
                                leftIcon={<ShieldCheck size={18} />}
                            >
                                ส่งอนุมัติ
                            </Button>
                        )}

                        {/* "อนุมัติ": supervisor only — closes out an AWAITING_APPROVAL request */}
                        {request.status === 'AWAITING_APPROVAL' && canApprove && (
                            <Button
                                variant="success"
                                size="sm"
                                disabled={submitting}
                                onClick={() => { void guardedUpdate({ status: 'COMPLETED' }); }}
                                leftIcon={<CheckCircle2 size={18} />}
                            >
                                อนุมัติ
                            </Button>
                        )}

                        {/* "ปฏิเสธ": supervisor only, open states */}
                        {canApprove && request.status !== 'COMPLETED' && request.status !== 'REJECTED' && (
                            <Button
                                variant="danger"
                                size="sm"
                                disabled={submitting}
                                onClick={() => { void guardedUpdate({ status: 'REJECTED' }); }}
                                leftIcon={<XCircle size={18} />}
                            >
                                ปฏิเสธ
                            </Button>
                        )}

                        {/* "เปิดเรื่องใหม่": supervisor only, REJECTED -> PENDING. Backend has no
                            ALLOWED_TRANSITIONS guard, so revert is a simple PATCH. */}
                        {canApprove && request.status === 'REJECTED' && (
                            <Button
                                variant="primary"
                                size="sm"
                                disabled={submitting}
                                onClick={() => { void guardedUpdate({ status: 'PENDING', assigned_agent_id: null }); }}
                                leftIcon={<RotateCcw size={18} />}
                            >
                                เปิดเรื่องใหม่
                            </Button>
                        )}

                        {/* Override kebab: supervisor-only escape hatches outside the linear workflow.
                            Visible whenever the request is NOT in the REJECTED terminal state (PRD B
                            opened COMPLETED to revert flows). Each inner item self-gates by status. */}
                        {(canApprove || canRevertApproval) && request.status !== 'REJECTED' && (
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    aria-label="การจัดการพิเศษ"
                                    className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border-default bg-surface text-text-secondary hover:bg-bg hover:text-text-primary transition-colors cursor-pointer"
                                >
                                    <MoreVertical size={18} />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-[12rem]">
                                    <DropdownMenuLabel>การจัดการพิเศษ</DropdownMenuLabel>
                                    <DropdownMenuSeparator />

                                    {/* "บังคับเสร็จสิ้น": skip approval flow when assignee is unavailable.
                                        Now self-gates against COMPLETED (used to rely on outer guard). */}
                                    {request.status !== 'COMPLETED' && (
                                        <DropdownMenuItem
                                            disabled={submitting}
                                            onClick={() => { void guardedUpdate({ status: 'COMPLETED' }); }}
                                        >
                                            <CheckCircle2 size={16} className="text-emerald-600" />
                                            บังคับเสร็จสิ้น
                                        </DropdownMenuItem>
                                    )}

                                    {/* "ย้อนกลับ รอรับเรื่อง": revert mid-flow records that were advanced by mistake.
                                        Hidden on PENDING (already there) AND on COMPLETED (use the
                                        dedicated revert items below for that case). */}
                                    {request.status !== 'PENDING' && request.status !== 'COMPLETED' && (
                                        <DropdownMenuItem
                                            disabled={submitting}
                                            onClick={() => { void guardedUpdate({ status: 'PENDING' }); }}
                                        >
                                            <Undo2 size={16} className="text-amber-600" />
                                            ย้อนกลับ รอรับเรื่อง
                                        </DropdownMenuItem>
                                    )}

                                    {/* PRD B: revert-from-COMPLETED. Two explicit targets — admin picks
                                        whichever previous stage matches the recovery they need. Both
                                        funnel through a ConfirmDialog (rendered near the AssignModal
                                        below) which writes an audit_log entry via the backend handler. */}
                                    {request.status === 'COMPLETED' && canRevertApproval && (
                                        <>
                                            <DropdownMenuItem
                                                disabled={submitting}
                                                onClick={() => setRevertConfirm({ open: true, target: 'AWAITING_APPROVAL', notes: '' })}
                                            >
                                                <Undo2 size={16} className="text-amber-600" />
                                                ยกเลิกอนุมัติ → รออนุมัติ
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                disabled={submitting}
                                                onClick={() => setRevertConfirm({ open: true, target: 'IN_PROGRESS', notes: '' })}
                                            >
                                                <Undo2 size={16} className="text-amber-600" />
                                                ยกเลิกอนุมัติ → กำลังดำเนินการ
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        </div>
                    </div>
                    {/* Subcategory sits below the title row as a quiet caption.
                        Pulled out of the hero's main flex row so it doesn't
                        compete with badges or actions for horizontal space. */}
                    {request.topic_subcategory && (
                        <p className="text-sm text-text-tertiary thai-no-break mt-2">
                            {request.topic_subcategory}
                        </p>
                    )}
                </div>

                    {/* PRD B: internal divider — separates hero section from tab nav. */}
                    <div className="border-t border-border-default" />

                    {/* Tab Navigation -- the outer card owns the border/background now,
                        so this just keeps the layout primitives (horizontal scroll, centering). */}
                    <div className="px-2 flex justify-center overflow-x-auto no-scrollbar">
                        {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-3 text-xs font-bold transition-all border-b-2 whitespace-nowrap outline-none cursor-pointer ${activeTab === tab.id
                                ? 'border-primary text-primary'
                                : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-default'
                                }`}
                        >
                            <tab.icon size={16} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* PRD B: internal divider — separates tab nav from tab content. */}
                <div className="border-t border-border-default" />

                {/* Tab Content Area -- outer merged card owns the border/background now. */}
                <div className="p-4 sm:p-6 md:p-8 min-h-[400px]">

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
                                        <Button
                                            variant="primary"
                                            size="md"
                                            onClick={handleAddComment}
                                            disabled={!newComment.trim() || submittingComment}
                                            isLoading={submittingComment}
                                            leftIcon={<Send size={16} />}
                                            title="Save Comment"
                                        >
                                            บันทึกข้อมูล
                                        </Button>
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
                                {/* Compact chip pills -- inline-flex with intrinsic width.
                                    Each chip sizes to its label + padding so "ปกติ" (3 char)
                                    is visibly smaller than "ด่วนที่สุด" (8 char). Linear/Notion
                                    style: chips read as a single tier and the rhythm matches
                                    the hero badges (h-7 px-3 text-[11px]).

                                    Removed: flex-1 (which stretched all chips to equal width),
                                    grid (which forced equal cells), whitespace-nowrap (no longer
                                    needed -- chips never wrap their own labels), truncate
                                    (chips never narrow enough to need ellipsis). */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Status chips (6 options) */}
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { value: 'PENDING',           label: 'รอรับเรื่อง',    activeClass: 'bg-amber-50 text-amber-700 border-amber-400',     dotClass: 'bg-amber-500' },
                                            { value: 'ACKNOWLEDGED',      label: 'รอดำเนินการ',   activeClass: 'bg-orange-50 text-orange-700 border-orange-400', dotClass: 'bg-orange-500' },
                                            { value: 'IN_PROGRESS',       label: 'กำลังดำเนินการ', activeClass: 'bg-blue-50 text-blue-700 border-blue-400',       dotClass: 'bg-blue-500' },
                                            { value: 'AWAITING_APPROVAL', label: 'รออนุมัติ',      activeClass: 'bg-violet-50 text-violet-700 border-violet-400', dotClass: 'bg-violet-500' },
                                            { value: 'COMPLETED',         label: 'เสร็จสิ้น',      activeClass: 'bg-emerald-50 text-emerald-700 border-emerald-400', dotClass: 'bg-emerald-500' },
                                            { value: 'REJECTED',          label: 'ปฏิเสธ',         activeClass: 'bg-rose-50 text-rose-700 border-rose-400',       dotClass: 'bg-rose-500' },
                                        ].map((s) => (
                                            <button
                                                key={s.value}
                                                // Update Local State Only
                                                onClick={() => setManageFormData(prev => ({ ...prev, status: s.value }))}
                                                className={`inline-flex items-center gap-1.5 h-7 px-3 text-[11px] font-bold rounded-lg transition-all cursor-pointer border ${manageFormData.status === s.value
                                                    ? s.activeClass
                                                    : 'bg-surface text-text-tertiary border-border-default hover:border-text-tertiary hover:bg-bg'
                                                    }`}
                                            >
                                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${manageFormData.status === s.value ? s.dotClass : 'bg-text-tertiary'}`}></span>
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                    {/* Priority chips (4 options) */}
                                    <div className="flex flex-wrap gap-2">
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
                                                className={`inline-flex items-center h-7 px-3 text-[11px] font-bold rounded-lg transition-all cursor-pointer border ${manageFormData.priority === p.value
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
                                    <div className="flex gap-2">
                                        <div
                                            onClick={() => setAssignModalOpen(true)}
                                            className={`flex-1 px-4 py-2.5 bg-bg border border-border-default rounded-lg text-sm cursor-pointer hover:bg-bg transition-colors flex justify-between items-center ${
                                                request.assignee_name ? 'font-bold text-text-primary' : 'font-medium text-text-tertiary'
                                            }`}
                                        >
                                            <span>{request.assignee_name || "ยังไม่ได้มอบหมาย"}</span>
                                            <Settings2 size={16} className="text-text-tertiary" />
                                        </div>
                                        {canApprove && request.assigned_agent_id && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-auto px-3 border-danger/30 text-danger hover:bg-danger/5 hover:text-danger"
                                                onClick={() => setUnassignDialogOpen(true)}
                                                title="ถอนการมอบหมาย"
                                            >
                                                <UserX size={16} />
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider flex items-center gap-2">
                                        <Calendar size={14} className="text-amber-500" /> กำหนดเสร็จ
                                    </label>
                                    {/* TZ-safe adapter: backend stores YYYY-MM-DD; CalendarPickerTH talks ISO.
                                        Parsing 'YYYY-MM-DDT00:00:00' (no Z) yields LOCAL midnight, which the
                                        picker then re-renders via .getFullYear/.getMonth/.getDate — so the
                                        displayed date matches what was saved regardless of timezone. */}
                                    <CalendarPickerTH
                                        value={manageFormData.due_date ? new Date(`${manageFormData.due_date}T00:00:00`).toISOString() : null}
                                        onChange={handleDueDateChange}
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
                                <Button variant="outline" size="md" onClick={handleCancelManage}>
                                    ยกเลิก
                                </Button>
                                <Button
                                    variant="primary"
                                    size="md"
                                    onClick={handleSaveManage}
                                    leftIcon={<CheckCircle2 size={18} />}
                                >
                                    บันทึก
                                </Button>
                            </div>
                        </div>
                    )}

                </div>
                </div>{/* closes merged card (hero + tab nav + tab content) */}

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

            <ConfirmDialog
                isOpen={unassignDialogOpen}
                onClose={() => setUnassignDialogOpen(false)}
                onConfirm={handleUnassign}
                title="ถอนการมอบหมาย"
                description={`ถอนการมอบหมายงานจาก ${request.assignee_name || 'ผู้รับผิดชอบ'}?`}
                confirmText="ถอนการมอบหมาย"
                cancelText="ยกเลิก"
                variant="warning"
            />

            <EscalationDialog
                isOpen={escalationDialogOpen}
                onClose={() => setEscalationDialogOpen(false)}
                onConfirm={handleEscalate}
                isLoading={submitting}
            />

            {/* PRD B: revert-from-COMPLETED confirmation. Shared between the
                two kebab items (AWAITING_APPROVAL / IN_PROGRESS) via the
                `revertConfirm.target` discriminator. Backend handler writes
                an audit_log row on confirm. */}
            <ConfirmDialog
                isOpen={revertConfirm.open}
                onClose={() => setRevertConfirm({ open: false, target: null, notes: '' })}
                onConfirm={() => {
                    if (revertConfirm.target) {
                        void guardedUpdate({ status: revertConfirm.target, notes: revertConfirm.notes || undefined });
                    }
                    setRevertConfirm({ open: false, target: null, notes: '' });
                }}
                title="ยืนยันยกเลิกการอนุมัติ"
                description={
                    <>
                        คำร้องจะกลับไปสถานะ{' '}
                        <b>
                            {revertConfirm.target === 'AWAITING_APPROVAL'
                                ? 'รออนุมัติ'
                                : revertConfirm.target === 'IN_PROGRESS'
                                    ? 'กำลังดำเนินการ'
                                    : ''}
                        </b>
                        <br />
                        <textarea
                            className="mt-3 w-full rounded-md border border-border-default bg-bg-primary p-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary"
                            rows={3}
                            placeholder="หมายเหตุ (ไม่บังคับ)"
                            value={revertConfirm.notes}
                            onChange={(e) => setRevertConfirm(prev => ({ ...prev, notes: e.target.value }))}
                        />
                        <span className="text-xs text-amber-600 mt-2 block">
                            การกระทำนี้จะถูกบันทึกในประวัติ
                        </span>
                    </>
                }
                confirmText="ยืนยัน"
                cancelText="ยกเลิก"
                variant="warning"
            />
        </div>
    );
}
