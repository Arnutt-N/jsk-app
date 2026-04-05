'use client';
// Client Component required: useAuth() reads JWT from localStorage for API calls.
// To convert to RSC, auth must migrate to httpOnly cookies.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
    ArrowLeft,
    AlertCircle,
    ChevronUp,
    Image as ImageIcon,
    Smile,
    Download,
} from 'lucide-react';
import PageHeader from '@/app/admin/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';

/* ---------- Types ---------- */

interface MessageItem {
    id: number;
    line_user_id: string | null;
    direction: 'INCOMING' | 'OUTGOING';
    message_type: string;
    content: string | null;
    payload: unknown;
    created_at: string;
    sender_role: 'USER' | 'BOT' | 'ADMIN' | null;
    operator_name: string | null;
}

interface PaginatedMessages {
    messages: MessageItem[];
    has_more: boolean;
}

interface ConversationDetail {
    line_user_id: string;
    display_name: string | null;
    picture_url: string | null;
    chat_mode: 'BOT' | 'HUMAN';
    messages: MessageItem[];
}

/* ---------- Helpers ---------- */

function formatTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString('th-TH', {
        day: '2-digit',
        month: 'short',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function senderBadgeVariant(role: string | null): 'gray' | 'primary' | 'info' {
    switch (role) {
        case 'BOT': return 'primary';
        case 'ADMIN': return 'info';
        default: return 'gray';
    }
}

function senderLabel(role: string | null, operatorName: string | null): string {
    if (role === 'ADMIN' && operatorName) return operatorName;
    if (role === 'BOT') return 'Bot';
    if (role === 'ADMIN') return 'Admin';
    return 'User';
}

/* ---------- Component ---------- */

export default function ChatHistoryDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { token } = useAuth();

    const lineUserId = params.lineUserId as string;
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const [displayName, setDisplayName] = useState<string>('');
    const [chatMode, setChatMode] = useState<'BOT' | 'HUMAN'>('BOT');
    const [messages, setMessages] = useState<MessageItem[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const API_BASE = '/api/v1';

    const authHeaders = useMemo(() => {
        if (!token) return {} as Record<string, string>;
        return { Authorization: `Bearer ${token}` };
    }, [token]);

    /* ---- Initial load: conversation detail (header info) + first page of messages ---- */
    const fetchInitial = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        try {
            // เน€เธยเน€เธเธเน€เธเธ…เน€เธโ€ conversation detail เน€เธโฌเน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธโ€เน€เธเธ–เน€เธย display_name, chat_mode
            const detailRes = await fetch(
                `${API_BASE}/admin/live-chat/conversations/${lineUserId}`,
                { headers: authHeaders },
            );
            if (!detailRes.ok) throw new Error('Failed to fetch conversation');
            const detail: ConversationDetail = await detailRes.json();
            setDisplayName(detail.display_name || lineUserId.substring(0, 12));
            setChatMode(detail.chat_mode);

            // เน€เธยเน€เธเธเน€เธเธ…เน€เธโ€เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ’เน€เธเธเน€เธยเน€เธยเน€เธย paginated
            const msgRes = await fetch(
                `${API_BASE}/admin/live-chat/conversations/${lineUserId}/messages?limit=50`,
                { headers: authHeaders },
            );
            if (!msgRes.ok) throw new Error('Failed to fetch messages');
            const msgData: PaginatedMessages = await msgRes.json();
            setMessages(msgData.messages);
            setHasMore(msgData.has_more);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.error('[chat-detail] เน€เธยเน€เธเธเน€เธเธ…เน€เธโ€เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ…เน€เธเธ…เน€เธยเน€เธเธเน€เธโฌเน€เธเธเน€เธเธ…เน€เธเธ:', message);
            setFetchError('เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ’เน€เธเธเน€เธเธ’เน€เธเธเน€เธโ€“เน€เธยเน€เธเธเน€เธเธ…เน€เธโ€เน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ‘เน€เธโ€ขเน€เธเธ”เน€เธเธเน€เธยเน€เธโ€”เน€เธยเน€เธเธ’เน€เธยเน€เธโ€เน€เธย เน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธเธ’เน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธย');
        } finally {
            setLoading(false);
        }
    }, [API_BASE, authHeaders, lineUserId]);

    useEffect(() => {
        void fetchInitial();
    }, [fetchInitial]);

    /* ---- Scroll to bottom on initial load ---- */
    useEffect(() => {
        if (!loading && messages.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [loading, messages.length]);

    /* ---- Load older messages ---- */
    const loadOlderMessages = useCallback(async () => {
        if (loadingMore || !hasMore || messages.length === 0) return;
        setLoadingMore(true);
        try {
            const oldestId = messages[0].id;
            const res = await fetch(
                `${API_BASE}/admin/live-chat/conversations/${lineUserId}/messages?before_id=${oldestId}&limit=50`,
                { headers: authHeaders },
            );
            if (!res.ok) throw new Error('Failed to load older messages');
            const data: PaginatedMessages = await res.json();
            setMessages((prev) => [...data.messages, ...prev]);
            setHasMore(data.has_more);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.error('[chat-detail] เน€เธยเน€เธเธเน€เธเธ…เน€เธโ€เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ’เน€เธเธเน€เธโฌเน€เธยเน€เธยเน€เธเธ’เน€เธเธ…เน€เธยเน€เธเธเน€เธโฌเน€เธเธเน€เธเธ…เน€เธเธ:', message);
        } finally {
            setLoadingMore(false);
        }
    }, [API_BASE, authHeaders, lineUserId, messages, hasMore, loadingMore]);

    /* ---- Export: download simple text file ---- */
    const handleExport = useCallback(() => {
        if (messages.length === 0) return;
        const lines = messages.map((msg) => {
            const time = formatTime(msg.created_at);
            const role = senderLabel(msg.sender_role, msg.operator_name);
            const text = msg.content || `[${msg.message_type}]`;
            return `[${time}] ${role}: ${text}`;
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-${lineUserId}-${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }, [messages, lineUserId]);

    /* ---- Render message content by type ---- */
    const renderMessageContent = (msg: MessageItem) => {
        switch (msg.message_type) {
            case 'image':
                return (
                    <div className="flex items-center gap-2 text-sm italic opacity-70">
                        <ImageIcon className="w-4 h-4" />
                        <span>[เน€เธเธเน€เธเธเน€เธยเน€เธย เน€เธเธ’เน€เธย]</span>
                    </div>
                );
            case 'sticker':
                return (
                    <div className="flex items-center gap-2 text-sm italic opacity-70">
                        <Smile className="w-4 h-4" />
                        <span>[เน€เธเธเน€เธโ€ขเน€เธเธ”เน€เธยเน€เธโฌเน€เธยเน€เธเธเน€เธเธเน€เธย]</span>
                    </div>
                );
            default:
                return (
                    <p className="text-sm whitespace-pre-wrap break-words">
                        {msg.content || `[${msg.message_type}]`}
                    </p>
                );
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 thai-text">
            {/* Header */}
            <PageHeader
                title={displayName || 'เน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ‘เน€เธโ€ขเน€เธเธ”เน€เธเธเน€เธยเน€เธโ€”เน€เธยเน€เธเธ’'}
                subtitle={lineUserId}
            >
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push('/admin/chat-histories')}
                    leftIcon={<ArrowLeft className="w-4 h-4" />}
                >
                    เน€เธยเน€เธเธ…เน€เธเธ‘เน€เธย
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExport}
                    disabled={messages.length === 0}
                    leftIcon={<Download className="w-4 h-4" />}
                >
                    Export
                </Button>
            </PageHeader>

            {/* Chat mode badge */}
            {!loading && (
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">เน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธยเน€เธยเน€เธโ€”:</span>
                    <Badge variant={chatMode === 'HUMAN' ? 'success' : 'gray'} size="sm">
                        {chatMode}
                    </Badge>
                </div>
            )}

            {/* Error */}
            {fetchError && (
                <div className="flex items-center gap-3 p-4 bg-danger/10 text-danger-text rounded-xl text-sm">
                    <AlertCircle size={18} className="shrink-0" />
                    <span className="flex-1">{fetchError}</span>
                    <Button variant="outline" size="xs" onClick={() => fetchInitial()}>
                        เน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธย
                    </Button>
                </div>
            )}

            {/* Chat bubbles */}
            <Card glass className="border-none shadow-sm overflow-hidden">
                <div
                    ref={scrollContainerRef}
                    className="max-h-[65vh] overflow-y-auto p-4 md:p-6 space-y-4 scrollbar-thin"
                >
                    {/* Load more button */}
                    {hasMore && (
                        <div className="flex justify-center">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={loadOlderMessages}
                                isLoading={loadingMore}
                                leftIcon={<ChevronUp className="w-4 h-4" />}
                            >
                                เน€เธยเน€เธเธเน€เธเธ…เน€เธโ€เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ’เน€เธเธเน€เธโฌเน€เธยเน€เธยเน€เธเธ’
                            </Button>
                        </div>
                    )}

                    {/* Loading skeleton */}
                    {loading ? (
                        <div className="space-y-4">
                            {Array(6).fill(0).map((_, i) => (
                                <div
                                    key={i}
                                    className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}
                                >
                                    <div className="animate-pulse">
                                        <div className={`h-12 rounded-2xl ${i % 2 === 0 ? 'w-48 bg-gray-100 dark:bg-gray-700' : 'w-56 bg-brand-100 dark:bg-brand-900/30'}`} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
                            <AlertCircle className="w-12 h-12 opacity-20 mb-3" />
                            <p className="text-sm">เน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ•เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ’เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธโ€”เน€เธยเน€เธเธ’เน€เธยเน€เธเธ•เน€เธย</p>
                        </div>
                    ) : (
                        messages.map((msg) => {
                            const isIncoming = msg.direction === 'INCOMING';
                            /* เน€เธเธเน€เธเธ•เน€เธยเน€เธเธ—เน€เธยเน€เธยเน€เธเธเน€เธเธ…เน€เธเธ‘เน€เธย bubble: incoming = gray, outgoing BOT = navy brand, outgoing ADMIN = blue */
                            const bubbleBg = isIncoming
                                ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                                : msg.sender_role === 'BOT'
                                    ? 'bg-brand-500/15 text-brand-800 dark:bg-brand-500/25 dark:text-brand-200'
                                    : 'bg-info/15 text-info-text dark:bg-info/25 dark:text-info-light';

                            return (
                                <div
                                    key={msg.id}
                                    className={`flex ${isIncoming ? 'justify-start' : 'justify-end'}`}
                                >
                                    <div className={`max-w-[75%] md:max-w-[60%] space-y-1`}>
                                        <div className={`rounded-2xl px-4 py-2.5 ${bubbleBg} ${isIncoming ? 'rounded-tl-md' : 'rounded-tr-md'}`}>
                                            {renderMessageContent(msg)}
                                        </div>
                                        <div className={`flex items-center gap-2 px-1 ${isIncoming ? 'justify-start' : 'justify-end'}`}>
                                            <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                                {formatTime(msg.created_at)}
                                            </span>
                                            <Badge
                                                variant={senderBadgeVariant(msg.sender_role)}
                                                size="xs"
                                            >
                                                {senderLabel(msg.sender_role, msg.operator_name)}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}

                    {/* Scroll anchor */}
                    <div ref={messagesEndRef} />
                </div>
            </Card>
        </div>
    );
}
