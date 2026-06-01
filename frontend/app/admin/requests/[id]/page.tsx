'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
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
    getStatusLabel,
    getStatusLabelForRequest,
    STATUS_CHIP_COLORS,
    PRIORITY_CHIP_COLORS,
} from '@/lib/constants/request-status';
import { usePermissions } from '@/lib/permissions';
import { useAuth } from '@/contexts/AuthContext';
import { useGuardedUpdate } from '@/hooks/useGuardedUpdate';
import { logger } from '@/lib/logger';

const CalendarPickerTH = dynamic(() => import('@/components/ui/CalendarPickerTH'));

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

// ------------------------------------------------------------------
// Module-level constants: static arrays extracted from JSX to avoid
// re-creating references on every render.
// ------------------------------------------------------------------
const ALL_STATUSES: RequestStatus[] = [
    'PENDING',
    'ACKNOWLEDGED',
    'IN_PROGRESS',
    'AWAITING_APPROVAL',
    'COMPLETED',
    'REJECTED',
];

const PRIORITY_OPTIONS = [
    { value: 'LOW', label: 'ปกติ' },
    { value: 'MEDIUM', label: 'ด่วน' },
    { value: 'HIGH', label: 'ด่วนมาก' },
    { value: 'URGENT', label: 'ด่วนที่สุด' },
];

// ------------------------------------------------------------------
// Sub-component: isolated comment-input state to prevent full-page
// re-renders on every keystroke in the textarea.
// ------------------------------------------------------------------
function CommentInputSection({ requestId, onSuccess }: {
    requestId: string | string[];
    onSuccess: () => void;
}) {
    const [newComment, setNewComment] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);
    const { toast } = useToast();
    const API_BASE = '/api/v1';

    const handleAddComment = async () => {
        if (!newComment.trim()) return;
        setSubmittingComment(true);
        try {
            const res = await fetch(`${API_BASE}/admin/requests/${requestId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newComment })
            });
            if (!res.ok) throw new Error('Failed to post comment');
            setNewComment('');
            onSuccess();
        } catch (err: unknown) {
            toast({ title: 'ผิดพลาด', description: getErrorMessage(err), variant: 'error' });
        } finally {
            setSubmittingComment(false);
        }
    };

    return (
        <div className="bg-bg rounded-2xl border border-border-default p-6">
            <h4 className="text-sm font-bold text-text-secondary mb-4">เพิ่มความเห็น</h4>
            <div className="space-y-4">
                <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="พิมพ์ความเห็นหรือบันทึกการดำเนินงาน..."
                    aria-label="เพิ่มความเห็นหรือบันทึกการดำเนินงาน"
                    className="w-full p-4 bg-bg border border-border-default rounded-xl text-sm outline-none focus:border-primary/40 focus:bg-surface focus:ring-4 focus:ring-primary/10 transition-all resize-none min-h-[120px]"
                ></textarea>
                <div className="flex justify-end">
                    <Button
                        variant="primary"
                        size="md"
                        onClick={handleAddComment}
                        disabled={!newComment.trim() || submittingComment}
                        isLoading={submittingComment}
                        leftIcon={<Send size={16} />}
                        aria-label="บันทึกความเห็น"
                    >
                        บันทึกข้อมูล
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ------------------------------------------------------------------
// Sub-component: memoized comment date formatting to avoid re-parsing
// Date objects on every parent render.
// ------------------------------------------------------------------
function CommentDate({ dateStr }: { dateStr: string }) {
    const formatted = useMemo(() => {
        const d = new Date(dateStr);
        const date = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
        const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        return `${date}, ${time}`;
    }, [dateStr]);
    return <span className="text-[10px] font-bold text-text-tertiary">{formatted}</span>;
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
    const [loading, setLoading] = useState(true);
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [unassignDialogOpen, setUnassignDialogOpen] = useState(false);
    const [escalationDialogOpen, setEscalationDialogOpen] = useState(false);
    // PRD B: revert-from-COMPLETED flow
    const [revertConfirm, setRevertConfirm] = useState<{
        open: boolean
        target: 'AWAITING_APPROVAL' | 'IN_PROGRESS' | null
        notes: string
    }>({ open: false, target: null, notes: '' });
    // P0: destructive-action confirmations
    const [rejectConfirm, setRejectConfirm] = useState<{ open: boolean; reason: string }>({ open: false, reason: '' });
    const [forceCompleteConfirm, setForceCompleteConfirm] = useState(false);
    // P1: manage-tab dirty-state tracking
    const [pendingTab, setPendingTab] = useState<string | null>(null);

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
        } catch (err: unknown) {
            logger.error(getErrorMessage(err));
        }
    }, [API_BASE, params.id]);

    useEffect(() => {
        if (params.id) {
            void fetchDetail();
            void fetchComments();
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

    const handleReject = async () => {
        await handleUpdateField({ status: 'REJECTED', reason: rejectConfirm.reason || undefined });
        setRejectConfirm({ open: false, reason: '' });
    };

    const handleForceComplete = async () => {
        await handleUpdateField({ status: 'COMPLETED' });
        setForceCompleteConfirm(false);
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

    // --- Memoized formatted dates (avoid re-parsing on every render) ---
    const formattedCreatedAt = useMemo(() => {
        if (!request) return '';
        return new Date(request.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
    }, [request?.created_at]);

    const formattedDueDate = useMemo(() => {
        if (!request?.due_date) return null;
        return new Date(request.due_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
    }, [request?.due_date]);

    const formattedFooterDate = useMemo(() => {
        if (!request) return '';
        return new Date(request.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }, [request?.created_at]);

    // --- UI Helpers ---
    const tabs = [
        { id: 'details', label: 'รายละเอียดคำร้อง', icon: FileText },
        { id: 'contact', label: 'ข้อมูลผู้ติดต่อ', icon: User },
        { id: 'comments', label: 'การดำเนินงาน/ความเห็น', icon: MessageSquare },
        { id: 'manage', label: 'จัดการคำร้อง', icon: Settings2 },
    ];

    if (loading) return <LoadingSpinner label="กำลังโหลด..." />;

    if (!request) return (
        <div className="p-8 md:p-16 text-center flex flex-col items-center gap-4 text-text-tertiary">
            <FileText className="w-16 h-16 opacity-20" aria-hidden="true" />
            <p className="text-lg font-bold text-text-secondary">ไม่พบข้อมูลคำร้อง</p>
            <p className="text-sm">คำร้องนี้อาจถูกลบหรือไม่มีอยู่ในระบบ</p>
            <Link href="/admin/requests">
                <Button variant="outline" size="sm" leftIcon={<ChevronLeft size={16} />}>
                    กลับไปหน้ารายการ
                </Button>
            </Link>
        </div>
    );

    // Derived authorisation state -- must be after the null check on `request`.
    const isAssignee = userId !== null && request.assigned_agent_id === userId;
    const canApprove = permissions?.can_assign ?? false;
    const canRevertApproval = permissions?.can_revert_approval ?? false;

    // P1: dirty-state tracker for manage tab
    const isManageDirty = useMemo(() => {
        if (!request) return false;
        const currentDue = request.due_date ? request.due_date.split('T')[0] : '';
        return manageFormData.status !== (request.status ?? '')
            || manageFormData.priority !== request.priority
            || manageFormData.due_date !== currentDue
            || manageFormData.comment.trim().length > 0;
    }, [request, manageFormData]);

    // P1: intercept tab switch when manage tab has unsaved changes
    const handleTabClick = (tabId: string) => {
        if (activeTab === 'manage' && isManageDirty && tabId !== 'manage') {
            setPendingTab(tabId);
            return;
        }
        setActiveTab(tabId);
    };

    const confirmTabSwitch = () => {
        if (pendingTab) {
            setActiveTab(pendingTab);
            setPendingTab(null);
        }
    };

    return (
        <div className="p-4 md:p-8 text-text-primary">
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
                    <div className="p-5 md:p-6">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <h1 className="text-xl sm:text-2xl font-extrabold text-text-primary tracking-tight thai-no-break">
                            {request.topic_category}
                        </h1>

                        {/* Status + priority badges -- inline with title. Shared shape:
                            h-8 (32px), text-xs, ring-1 ring-inset. Status carries
                            visual weight (dot + label), priority is plain chip. */}
                        {request.status && request.status in STATUS_CHIP_COLORS ? (
                            <span className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold ring-1 ring-inset shrink-0 ${STATUS_CHIP_COLORS[request.status].bg} ${STATUS_CHIP_COLORS[request.status].text} ${STATUS_CHIP_COLORS[request.status].ring}`}>
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_CHIP_COLORS[request.status].dot}`}></span>
                                {getStatusLabelForRequest(request)}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold ring-1 ring-inset shrink-0 bg-bg text-text-secondary ring-border-default">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-text-tertiary"></span>
                                {getStatusLabelForRequest(request)}
                            </span>
                        )}

                        {request.priority in PRIORITY_CHIP_COLORS ? (
                            <span className={`inline-flex items-center h-8 px-3 rounded-lg text-xs font-bold ring-1 ring-inset shrink-0 transition-all ${PRIORITY_CHIP_COLORS[request.priority].bg} ${PRIORITY_CHIP_COLORS[request.priority].text} ${PRIORITY_CHIP_COLORS[request.priority].ring}`}>
                                {request.priority === 'URGENT' ? 'ด่วนที่สุด' :
                                    request.priority === 'HIGH' ? 'ด่วนมาก' :
                                        request.priority === 'MEDIUM' ? 'ด่วน' :
                                            request.priority === 'LOW' ? 'ปกติ' : 'ไม่ระบุ'}
                            </span>
                        ) : (
                            <span className="inline-flex items-center h-8 px-3 rounded-lg text-xs font-bold ring-1 ring-inset shrink-0 bg-bg text-text-secondary ring-border-default">
                                ไม่ระบุ
                            </span>
                        )}

                        {/* P1: Adaptive primary CTA — shows ONLY the next logical workflow step.
                            Secondary actions (assign, escalate, reject, reopen, overrides) move to
                            the secondary toolbar row below the hero. */}
                        <div className="flex flex-wrap items-center gap-2 ml-auto">
                            {/* Next-step CTA */}
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
                        </div>
                    </div>
                    {/* Subcategory sits below the title row as a quiet caption. */}
                    {request.topic_subcategory && (
                        <p className="text-sm text-text-tertiary thai-no-break mt-2">
                            {request.topic_subcategory}
                        </p>
                    )}

                    {/* P1: Secondary toolbar — assignment, escalation, destructive actions,
                        and override kebab. Smaller, left-aligned, below the primary CTA. */}
                    <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border-subtle">
                        {canApprove && request.status !== 'COMPLETED' && request.status !== 'REJECTED' && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setAssignModalOpen(true)}
                                leftIcon={<UserPlus size={16} />}
                            >
                                {request.assigned_agent_id ? 'เปลี่ยนผู้รับผิดชอบ' : 'มอบหมาย'}
                            </Button>
                        )}
                        {canApprove && request.topic_category === 'แจ้งเบาะแสยาเสพติด' && request.status !== 'COMPLETED' && request.status !== 'REJECTED' && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEscalationDialogOpen(true)}
                                leftIcon={<Forward size={16} />}
                            >
                                ส่งต่อหน่วยงานเฉพาะทาง
                            </Button>
                        )}
                        {canApprove && request.status !== 'COMPLETED' && request.status !== 'REJECTED' && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="border-danger/30 text-danger hover:bg-danger/5 hover:text-danger"
                                disabled={submitting}
                                onClick={() => setRejectConfirm({ open: true, reason: '' })}
                                leftIcon={<XCircle size={16} />}
                            >
                                ปฏิเสธ
                            </Button>
                        )}
                        {canApprove && request.status === 'REJECTED' && (
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={submitting}
                                onClick={() => { void guardedUpdate({ status: 'PENDING', assigned_agent_id: null }); }}
                                leftIcon={<RotateCcw size={16} />}
                            >
                                เปิดเรื่องใหม่
                            </Button>
                        )}
                        {(canApprove || canRevertApproval) && request.status !== 'REJECTED' && (
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    aria-label="ตัวเลือกเพิ่มเติม"
                                    className="inline-flex items-center justify-center h-11 w-11 sm:h-8 sm:w-8 rounded-lg border border-border-default bg-surface text-text-secondary hover:bg-bg hover:text-text-primary transition-colors cursor-pointer"
                                >
                                    <MoreVertical size={16} />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-[12rem]">
                                    <DropdownMenuLabel>ตัวเลือกเพิ่มเติม</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {request.status !== 'COMPLETED' && (
                                        <DropdownMenuItem
                                            disabled={submitting}
                                            onClick={() => setForceCompleteConfirm(true)}
                                        >
                                            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                                            บังคับเสร็จสิ้น
                                        </DropdownMenuItem>
                                    )}
                                    {request.status !== 'PENDING' && request.status !== 'COMPLETED' && (
                                        <DropdownMenuItem
                                            disabled={submitting}
                                            onClick={() => { void guardedUpdate({ status: 'PENDING' }); }}
                                        >
                                            <Undo2 size={16} className="text-amber-600 dark:text-amber-400" aria-hidden="true" />
                                            ย้อนกลับ รอรับเรื่อง
                                        </DropdownMenuItem>
                                    )}
                                    {request.status === 'COMPLETED' && canRevertApproval && (
                                        <>
                                            <DropdownMenuItem
                                                disabled={submitting}
                                                onClick={() => setRevertConfirm({ open: true, target: 'AWAITING_APPROVAL', notes: '' })}
                                            >
                                                <Undo2 size={16} className="text-amber-600 dark:text-amber-400" aria-hidden="true" />
                                                ยกเลิกอนุมัติ → รออนุมัติ
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                disabled={submitting}
                                                onClick={() => setRevertConfirm({ open: true, target: 'IN_PROGRESS', notes: '' })}
                                            >
                                                <Undo2 size={16} className="text-amber-600 dark:text-amber-400" aria-hidden="true" />
                                                ยกเลิกอนุมัติ → กำลังดำเนินการ
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                </div>

                    {/* PRD B: internal divider — separates hero section from tab nav. */}
                    <div className="border-t border-border-default" />

                    {/* Tab Navigation -- the outer card owns the border/background now,
                        so this just keeps the layout primitives (horizontal scroll, centering). */}
                    <div role="tablist" aria-label="รายละเอียดคำร้อง" className="px-2 flex justify-center overflow-x-auto relative">
                        {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            id={`tab-${tab.id}`}
                            role="tab"
                            aria-selected={activeTab === tab.id}
                            aria-controls={`panel-${tab.id}`}
                            onClick={() => handleTabClick(tab.id)}
                            className={`flex items-center gap-2 px-4 py-3.5 text-sm font-bold transition-all border-b-[3px] whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset rounded-t-md ${activeTab === tab.id
                                ? 'border-primary text-primary'
                                : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-default'
                                }`}
                        >
                            <tab.icon size={16} aria-hidden="true" />
                            {tab.label}
                            {tab.id === 'manage' && isManageDirty && (
                                <>
                                    <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />
                                    <span className="sr-only">มีการเปลี่ยนแปลงที่ยังไม่บันทึก</span>
                                </>
                            )}
                        </button>
                    ))}
                </div>

                {/* PRD B: internal divider — separates tab nav from tab content. */}
                <div className="border-t border-border-default" />

                {/* Tab Content Area -- outer merged card owns the border/background now. */}
                <div className="p-4 sm:p-6 md:p-8 min-h-[300px] sm:min-h-[400px]">

                    {/* 1. รายละเอียดคำร้อง */}
                    {activeTab === 'details' && (
                        <div id="panel-details" role="tabpanel" aria-labelledby="tab-details" className="space-y-8">
                            {/* Category + Subcategory — clean text hierarchy, no decorative icon */}
                            <div className="pb-8 border-b border-border-default">
                                <div className="flex items-center gap-6">
                                    <div className="flex flex-col justify-center">
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">หมวดหมู่</span>
                                        <span className="text-lg font-bold text-text-primary">{request.topic_category}</span>
                                    </div>
                                    <div className="w-px h-8 bg-border-default"></div>
                                    <div className="flex flex-col justify-center">
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">ประเภท</span>
                                        <span className="text-lg font-bold text-text-primary">{request.topic_subcategory || "-"}</span>
                                    </div>
                                </div>
                            </div>

                            {/* 4-Item Info Grid - Equal Widths */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 py-6">
                                <div className="space-y-2">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">วันที่ยื่นคำร้อง</span>
                                    <div className="text-base font-semibold text-text-primary">
                                        {formattedCreatedAt}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">ระดับความสำคัญ</span>
                                    <div>
                                        {request.priority in PRIORITY_CHIP_COLORS ? (
                                            <span className={`px-3 py-1 rounded-lg text-xs font-bold border inline-block text-center min-w-[80px] ${PRIORITY_CHIP_COLORS[request.priority].bg} ${PRIORITY_CHIP_COLORS[request.priority].border} ${PRIORITY_CHIP_COLORS[request.priority].text}`}>
                                                {request.priority === 'URGENT' ? 'ด่วนที่สุด' :
                                                    request.priority === 'HIGH' ? 'ด่วนมาก' :
                                                        request.priority === 'MEDIUM' ? 'ด่วน' :
                                                            'ปกติ'}
                                            </span>
                                        ) : (
                                            <span className="px-3 py-1 rounded-lg text-xs font-bold border inline-block text-center min-w-[80px] bg-bg border-border-default text-text-secondary">
                                                ไม่ระบุ
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">กำหนดแล้วเสร็จ</span>
                                    <div className={`text-base font-semibold ${request.due_date ? 'text-text-primary' : 'text-text-tertiary italic'}`}>
                                        {formattedDueDate ?? 'ไม่ได้กำหนด'}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">ผู้รับผิดชอบ</span>
                                    <div className={`text-base font-semibold ${request.assignee_name ? 'text-text-primary' : 'text-text-tertiary italic'}`}>
                                        {request.assignee_name || "ยังไม่ได้มอบหมาย"}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">รายละเอียดเพิ่มเติม</span>
                                <div className="w-full px-4 py-3 bg-bg border border-border-default rounded-xl text-sm leading-relaxed whitespace-pre-wrap min-h-[100px]">
                                    {request.description || "ไม่มีรายละเอียดเพิ่มเติม"}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">ไฟล์แนบ ({request.attachments?.length || 0})</span>
                                <div className="flex flex-wrap gap-2">
                                    {request.attachments?.map((file, idx) => (
                                        <a key={idx} href={file.url} target="_blank" rel="noopener noreferrer" aria-label={`เปิดไฟล์ ${file.name} ในแท็บใหม่`} className="flex items-center gap-2 px-3 py-2 bg-surface border border-border-default rounded-lg text-xs font-semibold text-text-secondary hover:border-primary/40 hover:text-primary hover:bg-primary/8 transition-all cursor-pointer">
                                            <Paperclip size={14} className="text-primary" aria-hidden="true" /> {file.name}
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
                        <div id="panel-contact" role="tabpanel" aria-labelledby="tab-contact" className="space-y-8">
                            <div className="flex flex-col items-center p-6 bg-bg rounded-2xl border border-border-default">
                                <div className="w-24 h-24 rounded-full border-2 border-border-default mb-4 bg-bg flex items-center justify-center text-text-secondary text-3xl font-bold">
                                    {request.firstname ? request.firstname[0] : '?'}
                                </div>
                                <h3 className="text-lg font-bold text-text-primary">{request.prefix}{request.firstname} {request.lastname}</h3>
                                <p className="text-sm text-primary font-bold">{request.agency}</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 border border-border-default rounded-xl flex items-center gap-4">
                                    <div className="w-10 h-10 bg-surface border border-border-default text-text-secondary rounded-full flex items-center justify-center shrink-0"><Building2 size={20} aria-hidden="true" /></div>
                                    <div className="overflow-hidden">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">หน่วยงาน / ที่อยู่</p>
                                        <p className="text-sm font-bold truncate">{request.sub_district}, {request.district}, {request.province}</p>
                                    </div>
                                </div>
                                <div className="p-4 border border-border-default rounded-xl flex items-center gap-4">
                                    <div className="w-10 h-10 bg-surface border border-border-default text-text-secondary rounded-full flex items-center justify-center shrink-0"><Phone size={20} aria-hidden="true" /></div>
                                    <div>
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">หมายเลขโทรศัพท์</p>
                                        <p className="text-sm font-bold">{request.phone_number}</p>
                                    </div>
                                </div>
                                <div className="p-4 border border-border-default rounded-xl flex items-center gap-4 md:col-span-2">
                                    <div className="w-10 h-10 bg-surface border border-border-default text-text-secondary rounded-full flex items-center justify-center shrink-0"><Mail size={20} aria-hidden="true" /></div>
                                    <div>
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">อีเมล</p>
                                        <p className="text-sm font-bold">{request.email || "-"}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 3. การดำเนินงาน/ความเห็น */}
                    {activeTab === 'comments' && (
                        <div id="panel-comments" role="tabpanel" aria-labelledby="tab-comments" className="space-y-8">
                            {/* Timeline History */}
                            <div className="relative pl-6 sm:pl-8 border-l-2 border-border-default space-y-8 ml-3">
                                {comments.length === 0 ? (
                                    <div className="text-center py-10 text-text-secondary text-xs italic pl-4">ยังไม่มีประวัติการดำเนินงาน</div>
                                ) : comments.map((comment, i) => {
                                    // Determine styling based on user role/name
                                    const isSystem = comment.display_name?.toUpperCase() === 'SYSTEM';
                                    const isAdmin = comment.display_name?.toUpperCase().includes('ADMIN');

                                    const bubbleTint = isSystem
                                        ? 'bg-amber-50/60 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
                                        : isAdmin
                                            ? 'bg-brand-50/60 dark:bg-brand-900/10 border-brand-200 dark:border-brand-800'
                                            : 'bg-bg border-border-default';

                                    const dotColor = isSystem ? 'bg-amber-400 dark:bg-amber-500 shadow-amber-100 dark:shadow-amber-900/20' :
                                        isAdmin ? 'bg-primary shadow-primary/10' :
                                            'bg-text-tertiary shadow-border-default';

                                    return (
                                        <div key={i} className="relative group">
                                            {/* Timeline Dot */}
                                            <div className={`absolute -left-[41px] top-0 w-6 h-6 rounded-full border-[5px] border-surface shadow-md ${dotColor}`}></div>

                                            {/* Header */}
                                            <div className="flex items-center justify-between mb-2">
                                                <span className={`text-xs font-bold ${isSystem ? 'text-amber-500 dark:text-amber-400' : isAdmin ? 'text-primary' : 'text-text-secondary'}`}>
                                                    {comment.display_name}
                                                </span>
                                                <CommentDate dateStr={comment.created_at} />
                                            </div>

                                            {/* Content Bubble — tinted by role for instant scannability */}
                                            <div className={`${bubbleTint} rounded-2xl rounded-tl-sm p-4 text-sm text-text-secondary leading-relaxed shadow-sm`}>
                                                {comment.content}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <CommentInputSection requestId={params.id ?? ''} onSuccess={fetchComments} />
                        </div>
                    )}

                    {/* 4. จัดการคำร้อง */}
                    {activeTab === 'manage' && (
                        <div id="panel-manage" role="tabpanel" aria-labelledby="tab-manage" className="space-y-8">
                            {/* Row 1: Status + Priority */}
                            <div className="space-y-4">
                                {/* Labels Row */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary flex items-center gap-2">
                                        <Activity size={14} className="text-cyan-500 dark:text-cyan-400" aria-hidden="true" /> สถานะคำร้อง
                                    </span>
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary flex items-center gap-2">
                                        <Flag size={14} className="text-amber-500 dark:text-amber-400" aria-hidden="true" /> ระดับความสำคัญ
                                    </span>
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
                                        {ALL_STATUSES.map((s) => {
                                            const colors = STATUS_CHIP_COLORS[s];
                                            const label = getStatusLabel(s);
                                            const active = manageFormData.status === s;
                                            return (
                                                <button
                                                    key={s}
                                                    onClick={() => setManageFormData(prev => ({ ...prev, status: s }))}
                                                    className={`inline-flex items-center gap-1.5 h-8 px-3.5 text-xs font-bold rounded-lg transition-all cursor-pointer border ${active
                                                        ? `${colors.bg} ${colors.text} ${colors.border}`
                                                        : 'bg-surface text-text-tertiary border-border-default hover:border-text-tertiary hover:bg-bg'
                                                        }`}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? colors.dot : 'bg-text-tertiary'}`}></span>
                                                    {label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {/* Priority chips (4 options) */}
                                    <div className="flex flex-wrap gap-2">
                                        {PRIORITY_OPTIONS.map((p) => {
                                            const colors = PRIORITY_CHIP_COLORS[p.value];
                                            const active = manageFormData.priority === p.value;
                                            return (
                                                <button
                                                    key={p.value}
                                                    onClick={() => setManageFormData(prev => ({ ...prev, priority: p.value }))}
                                                    className={`inline-flex items-center h-8 px-3.5 text-xs font-bold rounded-lg transition-all cursor-pointer border ${active && colors
                                                        ? `${colors.bg} ${colors.text} ${colors.border}`
                                                        : 'bg-surface text-text-tertiary border-border-default hover:border-text-tertiary hover:bg-bg'
                                                        }`}
                                                >
                                                    {p.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Row 2: Assignment + Due Date */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                                <div className="space-y-4">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary flex items-center gap-2">
                                        <UserPlus size={14} className="text-primary" aria-hidden="true" /> มอบหมายงานให้
                                    </span>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setAssignModalOpen(true)}
                                            className={`flex-1 px-4 py-2.5 bg-bg border border-border-default rounded-lg text-sm cursor-pointer hover:bg-bg transition-colors flex justify-between items-center text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                                                request.assignee_name ? 'font-bold text-text-primary' : 'font-medium text-text-tertiary'
                                            }`}
                                        >
                                            <span>{request.assignee_name || "ยังไม่ได้มอบหมาย"}</span>
                                            <Settings2 size={16} className="text-text-tertiary" aria-hidden="true" />
                                        </button>
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

                                <div className="space-y-4">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary flex items-center gap-2">
                                        <Calendar size={14} className="text-amber-500 dark:text-amber-400" aria-hidden="true" /> กำหนดเสร็จ
                                    </span>
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
                            <div className="space-y-4">
                                <label htmlFor="manage-comment" className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary flex items-center gap-2">
                                    <MessageSquare size={14} className="text-text-tertiary" aria-hidden="true" /> บันทึกช่วยจำ / เหตุผลการดำเนินการ
                                </label>
                                <textarea
                                    id="manage-comment"
                                    value={manageFormData.comment}
                                    onChange={(e) => setManageFormData(prev => ({ ...prev, comment: e.target.value }))}
                                    placeholder="ระบุรายละเอียดการดำเนินการ, เหตุผลการยกเลิก, หรือข้อความถึงผู้เกี่ยวข้อง..."
                                    className="w-full p-4 bg-bg border border-border-default rounded-xl text-sm outline-none focus:border-primary/40 focus:bg-surface focus:ring-4 focus:ring-primary/10 transition-all resize-none min-h-[100px]"
                                ></textarea>
                            </div>

                            {/* Action Buttons */}
                            <div className="pt-8 border-t border-border-default flex justify-end gap-3">
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

                {/* P3: Subtle metadata footer */}
                <div className="mt-6 px-4 flex justify-between items-center text-xs text-text-tertiary">
                    <p>คำร้อง #{request.id}</p>
                    <p>{formattedFooterDate}</p>
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

            {/* P1: dirty-state tab-switch confirmation */}
            <ConfirmDialog
                isOpen={pendingTab !== null}
                onClose={() => setPendingTab(null)}
                onConfirm={confirmTabSwitch}
                title="ยังไม่ได้บันทึกการเปลี่ยนแปลง"
                description="มีการแก้ไขในหน้าจัดการคำร้องที่ยังไม่ได้บันทึก หากเปลี่ยนแท็บ ข้อมูลที่แก้ไขจะสูญหาย"
                confirmText="เปลี่ยนแท็บ"
                cancelText="อยู่ที่หน้านี้"
                variant="warning"
            />

            {/* P0: reject confirmation with mandatory reason */}
            <ConfirmDialog
                isOpen={rejectConfirm.open}
                onClose={() => setRejectConfirm({ open: false, reason: '' })}
                onConfirm={handleReject}
                title="ยืนยันปฏิเสธคำร้อง"
                description={
                    <>
                        คำร้องจะถูกเปลี่ยนสถานะเป็น <b>ปฏิเสธ</b> และไม่สามารถแก้ไขได้ในภายหลัง
                        <textarea
                            id="reject-reason"
                            aria-label="เหตุผลการปฏิเสธ"
                            className="mt-3 w-full rounded-md border border-border-default bg-bg p-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary"
                            rows={3}
                            placeholder="เหตุผลการปฏิเสธ *"
                            value={rejectConfirm.reason}
                            onChange={(e) => setRejectConfirm(prev => ({ ...prev, reason: e.target.value }))}
                        />
                        <span className="text-xs text-amber-600 dark:text-amber-400 mt-2 block">
                            การกระทำนี้จะถูกบันทึกในประวัติ
                        </span>
                    </>
                }
                confirmText="ปฏิเสธคำร้อง"
                cancelText="ยกเลิก"
                variant="danger"
                isLoading={submitting}
            />

            {/* P0: force-complete confirmation */}
            <ConfirmDialog
                isOpen={forceCompleteConfirm}
                onClose={() => setForceCompleteConfirm(false)}
                onConfirm={handleForceComplete}
                title="บังคับเสร็จสิ้น"
                description="การดำเนินการนี้จะข้ามขั้นตอนการอนุมัติและปิดคำร้องทันที ใช้กรณีที่ไม่สามารถรอการอนุมัติได้"
                confirmText="บังคับเสร็จสิ้น"
                cancelText="ยกเลิก"
                variant="warning"
                isLoading={submitting}
            />

            {/* PRD B: revert-from-COMPLETED confirmation */}
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
                            id="revert-notes"
                            aria-label="หมายเหตุการยกเลิกอนุมัติ"
                            className="mt-3 w-full rounded-md border border-border-default bg-bg p-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary"
                            rows={3}
                            placeholder="หมายเหตุ (ไม่บังคับ)"
                            value={revertConfirm.notes}
                            onChange={(e) => setRevertConfirm(prev => ({ ...prev, notes: e.target.value }))}
                        />
                        <span className="text-xs text-amber-600 dark:text-amber-400 mt-2 block">
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
