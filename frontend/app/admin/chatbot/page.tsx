'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Package, Tags, MessageSquare } from 'lucide-react';
import PageAccessGuard from '@/components/admin/PageAccessGuard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import StatsCard from '../components/StatsCard';
import { StaggerContainer, StaggerItem } from '@/components/ui/PageTransition';

interface ReplyObjectSummary {
    id: number;
    object_id: string;
    name: string;
    object_type: string;
}

interface IntentCategorySummary {
    id: number;
    name: string;
    is_active: boolean;
    response_count: number;
    keyword_count: number;
}

async function getChatbotData() {
    const API_BASE = '/api/v1';

    try {
        const [objRes, intentRes] = await Promise.all([
            fetch(`${API_BASE}/admin/reply-objects`, { cache: 'no-store' }),
            fetch(`${API_BASE}/admin/intents/categories`, { cache: 'no-store' })
        ]);

        return {
            replyObjects: objRes.ok ? (await objRes.json()) as ReplyObjectSummary[] : [],
            intentCategories: intentRes.ok ? (await intentRes.json()) as IntentCategorySummary[] : [],
            error: null
        };
    } catch (error) {
        console.error('Chatbot Dashboard Fetch Error:', error);
        return {
            replyObjects: [],
            intentCategories: [],
            error: 'Failed to load chatbot data'
        };
    }
}

export default function ChatbotDashboard() {
    const [replyObjects, setReplyObjects] = useState<ReplyObjectSummary[]>([]);
    const [intentCategories, setIntentCategories] = useState<IntentCategorySummary[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchChatbotData = useCallback(async () => {
        setLoading(true);
        const data = await getChatbotData();
        setReplyObjects(data.replyObjects);
        setIntentCategories(data.intentCategories);
        setError(data.error);
        setLoading(false);
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => { void fetchChatbotData(); }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchChatbotData]);

    if (loading) {
        return (
            <PageAccessGuard allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
                <LoadingSpinner />
            </PageAccessGuard>
        );
    }

    const content = error ? (
            <div className="p-8 text-center bg-danger/8 text-danger rounded-2xl border border-danger/15">
                <h2 className="text-lg font-bold mb-2">Connection Error</h2>
                <p className="text-sm opacity-80">Could not connect to the chatbot services. Please check backend connection.</p>
            </div>
    ) : (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center bg-white p-5 rounded-2xl shadow-sm border border-gray-100 dark:bg-gray-800 dark:border-gray-700">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 tracking-tight dark:text-gray-100">Chatbot Overview</h1>
                    <p className="text-gray-400 text-sm mt-0.5 dark:text-gray-500">Manage LINE OA auto-replies and rich messages</p>
                </div>
                <div className="text-sm text-gray-400 dark:text-gray-500">
                    JSK Chatbot System
                </div>
            </div>

            {/* Stats Cards Row */}
            <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <StaggerItem>
                    <StatsCard
                        title="Reply Objects"
                        value={replyObjects.length}
                        icon={<Package className="w-6 h-6" />}
                        color="info"
                        link="/admin/reply-objects"
                        description="Flex Messages & Images"
                    />
                </StaggerItem>

                <StaggerItem>
                    <StatsCard
                        title="Intent Categories"
                        value={intentCategories.length}
                        icon={<Tags className="w-6 h-6" />}
                        color="navy"
                        link="/admin/auto-replies"
                        description={`${intentCategories.filter((c) => c.is_active).length} Active Categories`}
                    />
                </StaggerItem>

                <StaggerItem>
                    <StatsCard
                        title="Active Responses"
                        value={intentCategories.reduce((acc: number, curr) => acc + curr.response_count, 0)}
                        icon={<MessageSquare className="w-6 h-6" />}
                        color="success"
                        description="Total Keywords Configured"
                    />
                </StaggerItem>
            </StaggerContainer>

            {/* Recent Activity/Quick Actions Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Recent Reply Objects */}
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm dark:bg-gray-800 dark:border-gray-700">
                    <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center dark:border-gray-700">
                        <h2 className="text-base font-semibold text-gray-700 flex items-center gap-2 dark:text-gray-200">
                            <span className="w-1 h-5 bg-brand-500 rounded-full" />
                            Recent Templates
                        </h2>
                        <Link href="/admin/reply-objects" className="text-xs font-medium text-brand-600 hover:text-brand-700 uppercase tracking-wide px-2 py-1 rounded hover:bg-brand-50 transition-colors cursor-pointer dark:text-brand-400 dark:hover:bg-brand-500/10">View All</Link>
                    </div>
                    <div className="divide-y divide-gray-50 dark:divide-gray-700">
                        {replyObjects.slice(0, 5).map((obj) => (
                            <div key={obj.id} className="px-5 py-3.5 hover:bg-gray-50/50 transition-all group cursor-pointer dark:hover:bg-gray-700/30">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-brand-50 text-brand-600 rounded-lg flex items-center justify-center text-sm font-semibold dark:bg-brand-500/10 dark:text-brand-400">
                                            $
                                        </div>
                                        <div>
                                            <p className="text-gray-600 font-medium text-sm group-hover:text-brand-600 transition-colors dark:text-gray-300 dark:group-hover:text-brand-400">{obj.name}</p>
                                            <span className="text-gray-400 font-mono text-xs dark:text-gray-500">${obj.object_id}</span>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-medium uppercase tracking-wide bg-gray-100 px-2 py-0.5 rounded text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                                        {obj.object_type}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Recent Auto-Replies */}
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm dark:bg-gray-800 dark:border-gray-700">
                    <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center dark:border-gray-700">
                        <h2 className="text-base font-semibold text-gray-700 flex items-center gap-2 dark:text-gray-200">
                            <span className="w-1 h-5 bg-brand-500 rounded-full" />
                            Active Intents
                        </h2>
                        <Link href="/admin/auto-replies" className="text-xs font-medium text-brand-500 hover:text-brand-600/80 uppercase tracking-wide px-2 py-1 rounded hover:bg-brand-50 transition-colors cursor-pointer dark:text-brand-400 dark:hover:bg-brand-500/10">Manage</Link>
                    </div>
                    <div className="divide-y divide-gray-50 dark:divide-gray-700">
                        {intentCategories.slice(0, 5).map((category) => (
                            <Link
                                key={category.id}
                                href={`/admin/auto-replies/${category.id}`}
                                className="px-5 py-3.5 hover:bg-gray-50/50 transition-all group cursor-pointer block dark:hover:bg-gray-700/30"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-brand-50 text-brand-500 rounded-lg flex items-center justify-center text-sm font-semibold dark:bg-brand-500/10 dark:text-brand-400">
                                            #
                                        </div>
                                        <div>
                                            <p className="text-text-secondary font-medium text-sm group-hover:text-brand-600 transition-colors dark:group-hover:text-brand-400">{category.name}</p>
                                            <p className="text-gray-400 text-xs dark:text-gray-500">
                                                {category.keyword_count} keywords · {category.response_count} responses
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`w-2 h-2 rounded-full ${category.is_active ? 'bg-success' : 'bg-border-hover'}`} />
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <PageAccessGuard allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
            {content}
        </PageAccessGuard>
    );
}
