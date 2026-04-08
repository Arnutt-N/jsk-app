'use client';
// Client Component required: useAuth() reads JWT from localStorage for API calls.
// To convert to RSC, auth must migrate to httpOnly cookies.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
    Search,
    MessageCircle,
    ChevronLeft,
    ChevronRight,
    AlertCircle,
    RefreshCw,
    User,
} from 'lucide-react';
import Image from 'next/image';
import PageHeader from '@/app/admin/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';

/* ---------- Types ---------- */

interface LastMessage {
    content: string;
    created_at: string;
}

interface ConversationSummary {
    line_user_id: string;
    display_name: string | null;
    picture_url: string | null;
    friend_status: string;
    chat_mode: 'BOT' | 'HUMAN';
    last_message: LastMessage | null;
    unread_count: number;
}

interface ConversationsResponse {
    conversations: ConversationSummary[];
    total: number;
    waiting_count: number;
    active_count: number;
}

interface SearchResultItem {
    id: number;
    line_user_id: string;
    display_name: string | null;
    content: string;
    direction: string;
    sender_role: string;
    created_at: string | null;
}

/* ---------- Helpers ---------- */

const ITEMS_PER_PAGE = 20;

/** แปลง ISO timestamp เป็นข้อความ relative เช่น "2 นาทีที่แล้ว" */
function relativeTime(isoString: string): string {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffSec = Math.max(0, Math.floor((now - then) / 1000));

    if (diffSec < 60) return 'เมื่อสักครู่';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} ชั่วโมงที่แล้ว`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 30) return `${diffDay} วันที่แล้ว`;
    const diffMonth = Math.floor(diffDay / 30);
    if (diffMonth < 12) return `${diffMonth} เดือนที่แล้ว`;
    return `${Math.floor(diffMonth / 12)} ปีที่แล้ว`;
}

function truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return text.slice(0, max) + '...';
}

/* ---------- Component ---------- */

export default function ChatHistoriesPage() {
    const { token } = useAuth();
    const router = useRouter();

    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [page, setPage] = useState(0);

    const API_BASE = '/api/v1';

    const authHeaders = useMemo(() => {
        if (!token) return {} as Record<string, string>;
        return { Authorization: `Bearer ${token}` };
    }, [token]);

    /* ---- Debounce search ---- */
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(0);
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    /* ---- Fetch conversations ---- */
    const fetchConversations = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const res = await fetch(`${API_BASE}/admin/live-chat/conversations`, {
                headers: authHeaders,
            });
            if (!res.ok) throw new Error('Failed to fetch conversations');
            const data: ConversationsResponse = await res.json();
            setConversations(data.conversations);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.error('[chat-histories] โหลดข้อมูลสนทนาล้มเหลว:', message);
            setFetchError('ไม่สามารถโหลดข้อมูลสนทนาได้ กรุณาลองใหม่');
        } finally {
            setLoading(false);
        }
    }, [API_BASE, authHeaders]);

    /* ---- Fetch search results ---- */
    const fetchSearchResults = useCallback(async (q: string) => {
        setLoading(true);
        setFetchError(null);
        try {
            const params = new URLSearchParams({ q, limit: '50' });
            const res = await fetch(
                `${API_BASE}/admin/live-chat/messages/search?${params.toString()}`,
                { headers: authHeaders },
            );
            if (!res.ok) throw new Error('Search failed');
            const data = await res.json();
            setSearchResults(data.items ?? []);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.error('[chat-histories] ค้นหาล้มเหลว:', message);
            setFetchError('ค้นหาล้มเหลว กรุณาลองใหม่');
        } finally {
            setLoading(false);
        }
    }, [API_BASE, authHeaders]);

    /* ---- Effect: fetch or search ---- */
    useEffect(() => {
        if (debouncedSearch.trim()) {
            void fetchSearchResults(debouncedSearch.trim());
        } else {
            void fetchConversations();
        }
    }, [debouncedSearch, fetchConversations, fetchSearchResults]);

    /* ---- Derived: paginated conversation list ---- */
    const isSearching = debouncedSearch.trim().length > 0;

    const paginatedConversations = useMemo(() => {
        const start = page * ITEMS_PER_PAGE;
        return conversations.slice(start, start + ITEMS_PER_PAGE);
    }, [conversations, page]);

    const totalPages = Math.max(1, Math.ceil(conversations.length / ITEMS_PER_PAGE));

    /* ---- Deduplicated search results grouped by user ---- */
    const searchGrouped = useMemo(() => {
        const map = new Map<string, SearchResultItem[]>();
        for (const item of searchResults) {
            const existing = map.get(item.line_user_id) ?? [];
            map.set(item.line_user_id, [...existing, item]);
        }
        return Array.from(map.entries());
    }, [searchResults]);

    /* ---- Navigate to detail ---- */
    const goToDetail = (lineUserId: string) => {
        router.push(`/admin/chat-histories/${lineUserId}`);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 thai-text">
            {/* Header */}
            <PageHeader title="ประวัติแชท" subtitle="ประวัติการสนทนาทั้งหมด">
                <Button variant="outline" size="sm" onClick={() => fetchConversations()}>
                    <RefreshCw className="w-4 h-4" />
                </Button>
            </PageHeader>

            {/* Search */}
            <Card glass className="border-none shadow-sm">
                <CardContent className="p-4">
                    <Input
                        type="text"
                        placeholder="ค้นหาข้อความในสนทนา..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        leftIcon={<Search className="w-4 h-4" />}
                    />
                </CardContent>
            </Card>

            {/* Error */}
            {fetchError && (
                <div className="flex items-center gap-3 p-4 bg-danger/10 text-danger-text rounded-xl text-sm">
                    <AlertCircle size={18} className="shrink-0" />
                    <span className="flex-1">{fetchError}</span>
                    <Button variant="outline" size="xs" onClick={() => fetchConversations()}>
                        ลองใหม่
                    </Button>
                </div>
            )}

            {/* Conversation Table */}
            <Card glass className="border-none shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-bg/50 border-b border-border-default text-xs font-bold text-text-tertiary uppercase tracking-wider">
                                <th className="px-6 py-4">ผู้ใช้</th>
                                <th className="px-6 py-4">ข้อความล่าสุด</th>
                                <th className="px-6 py-4">เวลา</th>
                                <th className="px-6 py-4">โหมดแชท</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-default bg-surface/40">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={4} className="px-6 py-8">
                                            <div className="h-4 bg-muted rounded-full w-3/4 mb-3" />
                                            <div className="h-3 bg-muted/50 rounded-full w-1/2" />
                                        </td>
                                    </tr>
                                ))
                            ) : isSearching ? (
                                /* ---- Search results ---- */
                                searchGrouped.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center">
                                            <div className="flex flex-col items-center gap-3 text-text-tertiary">
                                                <Search className="w-12 h-12 opacity-20" />
                                                <p className="text-sm">ไม่พบผลลัพธ์สำหรับ &quot;{debouncedSearch}&quot;</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    searchGrouped.map(([lineUserId, items]) => {
                                        const first = items[0];
                                        const name = first.display_name || lineUserId.substring(0, 12);
                                        return (
                                            <tr
                                                key={lineUserId}
                                                className="hover:bg-bg/50 transition-colors cursor-pointer"
                                                onClick={() => goToDetail(lineUserId)}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => { if (e.key === 'Enter') goToDetail(lineUserId); }}
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-surface-secondary overflow-hidden shrink-0">
                                                            <div className="w-full h-full flex items-center justify-center text-text-secondary">
                                                                <User className="w-5 h-5" />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-bold text-text-secondary">{name}</div>
                                                            <div className="text-[10px] text-text-tertiary font-mono">{lineUserId.substring(0, 8)}...</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm text-text-secondary">
                                                        {truncate(first.content || '-', 50)}
                                                    </div>
                                                    <div className="text-[10px] text-text-tertiary mt-0.5">
                                                        พบ {items.length} ผลลัพธ์
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-xs text-text-tertiary whitespace-nowrap">
                                                    {first.created_at ? relativeTime(first.created_at) : '-'}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Badge variant="gray" size="sm">{first.sender_role || '-'}</Badge>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )
                            ) : (
                                /* ---- Normal conversation list ---- */
                                paginatedConversations.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center">
                                            <div className="flex flex-col items-center gap-3 text-text-tertiary">
                                                <MessageCircle className="w-12 h-12 opacity-20" />
                                                <p className="text-sm">ยังไม่มีประวัติการสนทนา</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedConversations.map((conv) => {
                                        const name = conv.display_name || conv.line_user_id.substring(0, 12);
                                        return (
                                            <tr
                                                key={conv.line_user_id}
                                                className="hover:bg-bg/50 transition-colors cursor-pointer"
                                                onClick={() => goToDetail(conv.line_user_id)}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => { if (e.key === 'Enter') goToDetail(conv.line_user_id); }}
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-surface-secondary overflow-hidden shrink-0">
                                                            {conv.picture_url ? (
                                                                <Image src={conv.picture_url} alt={name} width={40} height={40} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-text-secondary">
                                                                    <User className="w-5 h-5" />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-bold text-text-secondary">{name}</div>
                                                            <div className="text-[10px] text-text-tertiary font-mono">
                                                                {conv.line_user_id.substring(0, 8)}...
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm text-text-secondary line-clamp-1">
                                                        {conv.last_message
                                                            ? truncate(conv.last_message.content, 50)
                                                            : <span className="italic text-text-tertiary">ยังไม่มีข้อความ</span>}
                                                    </p>
                                                </td>
                                                <td className="px-6 py-4 text-xs text-text-tertiary whitespace-nowrap">
                                                    {conv.last_message?.created_at
                                                        ? relativeTime(conv.last_message.created_at)
                                                        : '-'}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Badge
                                                        variant={conv.chat_mode === 'HUMAN' ? 'success' : 'gray'}
                                                        size="sm"
                                                    >
                                                        {conv.chat_mode}
                                                    </Badge>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {!isSearching && (
                    <div className="px-6 py-4 border-t border-border-default bg-bg/30 flex items-center justify-between">
                        <p className="text-xs text-text-tertiary font-medium">
                            {conversations.length} สนทนา (หน้า {page + 1}/{totalPages})
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 w-8 p-0"
                                disabled={page === 0}
                                onClick={() => setPage((p) => Math.max(0, p - 1))}
                                aria-label="หน้าก่อนหน้า"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 w-8 p-0"
                                disabled={page >= totalPages - 1}
                                onClick={() => setPage((p) => p + 1)}
                                aria-label="หน้าถัดไป"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
}
