'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
    Clock,
    CheckCircle2,
    AlertCircle,
    Eye,
    Calendar,
    ChevronLeft,
    Search,
    AlertTriangle,
    Flag
} from 'lucide-react';
import PageHeader from '../../components/PageHeader';

interface ServiceRequest {
    id: string;
    firstname: string;
    lastname: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    due_date?: string;
    topic_category: string;
    created_at: string;
    agency: string;
}

const COLUMNS = [
    { id: 'PENDING', label: 'รอรับเรื่อง', icon: <Clock className="w-4 h-4 text-amber-500" />, color: 'bg-amber-500' },
    { id: 'IN_PROGRESS', label: 'กำลังดำเนินการ', icon: <Eye className="w-4 h-4 text-blue-500" />, color: 'bg-blue-500' },
    { id: 'COMPLETED', label: 'ดำเนินการแล้ว', icon: <CheckCircle2 className="w-4 h-4 text-green-500" />, color: 'bg-green-500' },
    { id: 'REJECTED', label: 'ปฏิเสธ', icon: <AlertCircle className="w-4 h-4 text-rose-500" />, color: 'bg-rose-500' }
];

export default function KanbanPage() {
    const [requests, setRequests] = useState<ServiceRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const API_BASE = '/api/v1';

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        try {
            const url = `${API_BASE}/admin/requests?limit=200`;
            const res = await fetch(url);
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                console.error('Fetch Error Detail:', {
                    status: res.status,
                    statusText: res.statusText,
                    error: errorData
                });
                throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
            }
            const data = await res.json();
            setRequests(data);
        } catch (err) {
            console.error('Kanban Fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [API_BASE]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void fetchRequests();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchRequests]);

    const filteredRequests = requests.filter(req =>
        (req.firstname || '').toLowerCase().includes(search.toLowerCase()) ||
        (req.lastname || '').toLowerCase().includes(search.toLowerCase()) ||
        (req.topic_category || '').toLowerCase().includes(search.toLowerCase())
    );

    const getPriorityStyle = (priority: string) => {
        switch (priority) {
            case 'URGENT': return 'text-rose-600 bg-rose-50 border-rose-100';
            case 'HIGH': return 'text-amber-600 bg-amber-50 border-amber-100';
            case 'MEDIUM': return 'text-blue-600 bg-blue-50 border-blue-100';
            case 'LOW': return 'text-text-tertiary bg-bg border-border-default';
            default: return 'text-text-tertiary bg-bg border-border-default';
        }
    };

    const isOverdue = (date?: string) => {
        if (!date) return false;
        return new Date(date) < new Date() && date !== '';
    };

    return (
        <div className="thai-text space-y-6">
            <PageHeader title="กระดานคัดกรองงาน (Kanban Board)" subtitle="บริหารจัดการสถานะงานแบบ Visual Overview">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                    <input
                        type="text"
                        placeholder="ค้นหางาน..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 pr-4 py-1.5 bg-surface border border-border-default rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 w-[240px]"
                    />
                </div>
                <Link href="/admin/requests">
                    <Button variant="outline" size="sm" className="gap-2">
                        <ChevronLeft className="w-4 h-4" /> ดูแบบรายการ
                    </Button>
                </Link>
            </PageHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 min-h-[70vh]">
                {COLUMNS.map(col => (
                    <div key={col.id} className="flex flex-col gap-4">
                        <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${col.color}`} />
                                <h3 className="font-bold text-text-secondary text-sm">{col.label}</h3>
                                <Badge variant="gray" className="py-0 px-1.5 text-[10px]">{filteredRequests.filter(r => r.status === col.id).length}</Badge>
                            </div>
                        </div>

                        <div className="bg-muted/50 rounded-2xl p-3 flex-1 space-y-3 border border-border-default/50 border-dashed">
                            {loading ? (
                                <div className="space-y-3 animate-pulse">
                                    {[1, 2].map(i => <div key={i} className="h-32 bg-white/50 rounded-xl" />)}
                                </div>
                            ) : filteredRequests.filter(r => r.status === col.id).map(req => (
                                <Link key={req.id} href={`/admin/requests/${req.id}`}>
                                    <Card className="hover:shadow-lg transition-all cursor-pointer border-none shadow-sm group bg-white">
                                        <CardContent className="p-4 space-y-3">
                                            <div className="flex justify-between items-start">
                                                <Badge className={`text-[9px] px-1.5 py-0.5 border ${getPriorityStyle(req.priority)}`}>
                                                    <Flag className="w-2.5 h-2.5 mr-1" /> {req.priority}
                                                </Badge>
                                                <span className="text-[10px] text-text-tertiary font-mono">#{req.id}</span>
                                            </div>

                                            <div>
                                                <h4 className="text-sm font-bold text-text-primary line-clamp-1 group-hover:text-primary transition-colors">
                                                    {req.firstname || 'ไม่ระบุชื่อ'} {req.lastname || ''}
                                                </h4>
                                                <p className="text-[11px] text-text-tertiary mt-1 line-clamp-2 leading-relaxed">
                                                    {req.topic_category}
                                                </p>
                                            </div>

                                            <div className="pt-2 flex flex-col gap-1.5 border-t border-border-default">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-1.5 text-[10px] text-text-tertiary">
                                                        <Clock className="w-3 h-3" />
                                                        {new Date(req.created_at).toLocaleDateString('th-TH')}
                                                    </div>
                                                    {req.due_date && (
                                                        <div className={`flex items-center gap-1 text-[10px] font-bold ${isOverdue(req.due_date) ? 'text-rose-500' : 'text-text-tertiary'}`}>
                                                            <Calendar className="w-3 h-3" />
                                                            {new Date(req.due_date).toLocaleDateString('th-TH')}
                                                            {isOverdue(req.due_date) && <AlertTriangle className="w-3 h-3" />}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-[9px] font-bold text-text-tertiary uppercase tracking-tight truncate">
                                                    {req.agency}
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
