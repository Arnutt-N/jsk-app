'use client';
// Client Component required: useAuth() reads JWT from localStorage for API calls.
// To convert to RSC, auth must migrate to httpOnly cookies.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, UserCheck, UserX, RefreshCw, ShieldBan } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Timeline, type TimelineItem } from '@/components/ui/Timeline';
import { useAuth } from '@/contexts/AuthContext';

// ข้อมูลเพื่อนจาก API
interface FriendInfo {
    line_user_id: string;
    display_name: string;
    picture_url?: string;
    friend_status: string;
    friend_since?: string;
    refollow_count?: number;
}

// เหตุการณ์ของเพื่อนจาก API
interface FriendEvent {
    id: number;
    event_type: string;
    refollow_count?: number;
    timestamp: string;
    created_at?: string;
}

// แปลง status เป็น Badge variant
function getStatusBadgeVariant(status: string): 'success' | 'danger' | 'warning' {
    switch (status) {
        case 'ACTIVE': return 'success';
        case 'BLOCKED': return 'danger';
        case 'UNFOLLOWED': return 'warning';
        default: return 'warning';
    }
}

// แปลง status เป็นข้อความภาษาไทย
function getStatusLabel(status: string): string {
    switch (status) {
        case 'ACTIVE': return 'กำลังติดตาม';
        case 'BLOCKED': return 'ถูกบล็อค';
        case 'UNFOLLOWED': return 'เลิกติดตาม';
        default: return status;
    }
}

// คำนวณระยะเวลาห่างระหว่างสองวันที่ เป็นข้อความภาษาไทย
function getDurationBetween(from: Date, to: Date): string {
    const diffMs = to.getTime() - from.getTime();
    if (diffMs < 0) return '';

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHours === 0) {
            const diffMinutes = Math.floor(diffMs / (1000 * 60));
            return `${diffMinutes} นาทีหลังจากเหตุการณ์ก่อนหน้า`;
        }
        return `${diffHours} ชั่วโมงหลังจากเหตุการณ์ก่อนหน้า`;
    }
    if (diffDays < 30) {
        return `${diffDays} วันหลังจากเหตุการณ์ก่อนหน้า`;
    }
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) {
        return `${diffMonths} เดือนหลังจากเหตุการณ์ก่อนหน้า`;
    }
    const diffYears = Math.floor(diffMonths / 12);
    const remainingMonths = diffMonths % 12;
    if (remainingMonths === 0) {
        return `${diffYears} ปีหลังจากเหตุการณ์ก่อนหน้า`;
    }
    return `${diffYears} ปี ${remainingMonths} เดือนหลังจากเหตุการณ์ก่อนหน้า`;
}

// แปลง event จาก API เป็น TimelineItem
function mapEventToTimelineItem(
    event: FriendEvent,
    previousEvent: FriendEvent | null
): TimelineItem {
    const eventDate = new Date(event.timestamp || event.created_at || '');
    const formattedDate = eventDate.toLocaleString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

    let title: string;
    let type: TimelineItem['type'];
    let icon: React.ReactNode;

    switch (event.event_type) {
        case 'FOLLOW':
            type = 'follow';
            title = 'เพิ่มเพื่อน (ครั้งแรก)';
            icon = <UserCheck className="w-3.5 h-3.5" />;
            break;
        case 'UNFOLLOW':
            type = 'unfollow';
            title = 'ยกเลิกการติดตาม';
            icon = <UserX className="w-3.5 h-3.5" />;
            break;
        case 'REFOLLOW':
            type = 'refollow';
            title = `กลับมาเป็นเพื่อนอีกครั้ง (ครั้งที่ ${event.refollow_count ?? '?'})`;
            icon = <RefreshCw className="w-3.5 h-3.5" />;
            break;
        case 'BLOCK':
            type = 'block';
            title = 'บล็อคเพื่อน';
            icon = <ShieldBan className="w-3.5 h-3.5" />;
            break;
        default:
            type = 'default';
            title = event.event_type;
            icon = undefined;
    }

    // คำนวณระยะเวลาตั้งแต่เหตุการณ์ก่อนหน้า
    let description: string | undefined;
    if (previousEvent) {
        const prevDate = new Date(previousEvent.timestamp || previousEvent.created_at || '');
        if (!isNaN(prevDate.getTime()) && !isNaN(eventDate.getTime())) {
            description = getDurationBetween(prevDate, eventDate);
        }
    }

    return {
        date: formattedDate,
        title,
        description,
        type,
        icon,
    };
}

export default function FriendTimelinePage() {
    const { token } = useAuth();
    const params = useParams();
    const lineUserId = params.lineUserId as string;

    const [friendInfo, setFriendInfo] = useState<FriendInfo | null>(null);
    const [events, setEvents] = useState<FriendEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
    const authHeaders = useMemo(() => {
        if (!token) return {} as Record<string, string>;
        return { Authorization: `Bearer ${token}` };
    }, [token]);

    // ดึงข้อมูลเพื่อนและ events พร้อมกัน
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [friendsRes, eventsRes] = await Promise.all([
                fetch(`${API_BASE}/admin/friends`, { headers: authHeaders }),
                fetch(`${API_BASE}/admin/friends/${lineUserId}/events`, { headers: authHeaders }),
            ]);

            if (!friendsRes.ok) {
                throw new Error(`ไม่สามารถดึงข้อมูลเพื่อนได้ (${friendsRes.status})`);
            }
            if (!eventsRes.ok) {
                throw new Error(`ไม่สามารถดึงประวัติเหตุการณ์ได้ (${eventsRes.status})`);
            }

            const friendsData = await friendsRes.json();
            const eventsData = await eventsRes.json();

            // หาเพื่อนจาก list
            const matchedFriend = (friendsData.friends ?? []).find(
                (f: FriendInfo) => f.line_user_id === lineUserId
            );
            setFriendInfo(matchedFriend ?? null);
            setEvents(eventsData.events ?? eventsData ?? []);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [API_BASE, authHeaders, lineUserId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // คำนวณจำนวน follow ทั้งหมด (FOLLOW + REFOLLOW)
    const followCount = events.filter(
        (e) => e.event_type === 'FOLLOW' || e.event_type === 'REFOLLOW'
    ).length;

    const refollowCount = friendInfo?.refollow_count ?? events.filter(
        (e) => e.event_type === 'REFOLLOW'
    ).length;

    // แปลง events เป็น timeline items (เรียงจากใหม่ไปเก่า)
    const sortedEvents = [...events].sort(
        (a, b) => new Date(a.timestamp || a.created_at || '').getTime()
                 - new Date(b.timestamp || b.created_at || '').getTime()
    );

    const timelineItems: TimelineItem[] = sortedEvents.map((event, index) => {
        const previousEvent = index > 0 ? sortedEvents[index - 1] : null;
        return mapEventToTimelineItem(event, previousEvent);
    }).reverse();

    // หน้า Loading
    if (loading) {
        return (
            <div className="p-6 max-w-4xl mx-auto thai-text">
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
                    <span className="ml-3 text-text-secondary">กำลังโหลดข้อมูล...</span>
                </div>
            </div>
        );
    }

    // หน้า Error
    if (error) {
        return (
            <div className="p-6 max-w-4xl mx-auto thai-text">
                <Link
                    href="/admin/friends"
                    className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-brand-500 transition-colors mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span>ประวัติเพื่อน</span>
                </Link>
                <Card variant="outlined" padding="lg">
                    <CardContent>
                        <p className="text-danger text-center">{error}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl mx-auto thai-text">
            {/* ปุ่มกลับ */}
            <Link
                href="/admin/friends"
                className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-brand-500 transition-colors mb-6"
            >
                <ArrowLeft className="w-4 h-4" />
                <span>ประวัติเพื่อน</span>
            </Link>

            {/* ส่วนหัว — ชื่อผู้ใช้ */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-text-primary tracking-tight">
                    {friendInfo?.display_name ?? 'ไม่ทราบชื่อ'}
                </h1>
                <p className="text-sm text-text-secondary font-mono mt-1">
                    {lineUserId}
                </p>
            </div>

            {/* สรุป 3 การ์ด */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                {/* การ์ด 1: สถานะ */}
                <Card variant="default" padding="lg">
                    <CardContent>
                        <p className="text-xs text-text-secondary font-medium uppercase tracking-wider mb-2">
                            สถานะ
                        </p>
                        <Badge
                            variant={getStatusBadgeVariant(friendInfo?.friend_status ?? '')}
                            size="lg"
                        >
                            {getStatusLabel(friendInfo?.friend_status ?? 'UNKNOWN')}
                        </Badge>
                    </CardContent>
                </Card>

                {/* การ์ด 2: ครั้งที่ Follow */}
                <Card variant="default" padding="lg">
                    <CardContent>
                        <p className="text-xs text-text-secondary font-medium uppercase tracking-wider mb-2">
                            ครั้งที่ Follow
                        </p>
                        <p className="text-3xl font-bold text-text-primary">
                            {followCount}
                        </p>
                    </CardContent>
                </Card>

                {/* การ์ด 3: ครั้งที่ Refollow */}
                <Card variant="default" padding="lg">
                    <CardContent>
                        <p className="text-xs text-text-secondary font-medium uppercase tracking-wider mb-2">
                            ครั้งที่ Refollow
                        </p>
                        <p className="text-3xl font-bold text-text-primary">
                            {refollowCount}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Timeline */}
            <div className="mb-4">
                <h2 className="text-lg font-semibold text-text-primary mb-1">
                    ไทม์ไลน์เหตุการณ์
                </h2>
                <p className="text-sm text-text-secondary mb-6">
                    ประวัติการเพิ่มเพื่อน ยกเลิก และกลับมาติดตาม
                </p>
            </div>

            {timelineItems.length === 0 ? (
                <Card variant="outlined" padding="lg">
                    <CardContent>
                        <p className="text-center text-text-secondary py-4">
                            ยังไม่มีประวัติเหตุการณ์
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <Card variant="default" padding="lg">
                    <CardContent>
                        <Timeline items={timelineItems} />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
