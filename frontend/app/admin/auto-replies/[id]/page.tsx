'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Plus, Edit2, Trash2, X, Key, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import PageHeader from '../../components/PageHeader';

interface IntentKeyword {
    id: number;
    keyword: string;
    match_type: string;
}

interface IntentResponse {
    id: number;
    reply_type: string;
    text_content?: string;
    payload?: unknown;
    is_active: boolean;
    order: number;
}

interface IntentCategory {
    id: number;
    name: string;
    description?: string;
    is_active: boolean;
    keywords: IntentKeyword[];
    responses: IntentResponse[];
}

const MATCH_TYPES = ['exact', 'contains', 'starts_with', 'regex'];
const REPLY_TYPES = ['text', 'flex', 'image', 'sticker', 'video'];

export default function CategoryDetailPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const mode = searchParams.get('mode'); // 'edit' or undefined (view)

    const [category, setCategory] = useState<IntentCategory | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(mode === 'edit');
    const [payloadError, setPayloadError] = useState<string | null>(null);

    // Forms
    const [showKeywordForm, setShowKeywordForm] = useState(false);
    const [showResponseForm, setShowResponseForm] = useState(false);
    const [keywordFormData, setKeywordFormData] = useState({ id: null as number | null, keyword: '', match_type: 'contains' });
    const [responseFormData, setResponseFormData] = useState({
        id: null as number | null,
        reply_type: 'text',
        text_content: '',
        payload: '{}', // Stringifed JSON for editing
        is_active: true
    });
    const [categoryFormData, setCategoryFormData] = useState({ name: '', description: '', is_active: true });

    const API_BASE = '/api/v1';

    useEffect(() => {
        if (category) {
            setCategoryFormData({
                name: category.name,
                description: category.description || '',
                is_active: category.is_active
            });
        }
    }, [category]);

    const fetchCategoryDetail = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/intents/categories/${params.id}`);
            if (res.ok) setCategory(await res.json());
        } catch (error) {
            console.error('Error fetching category:', error);
        } finally {
            setLoading(false);
        }
    }, [API_BASE, params.id]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void fetchCategoryDetail();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchCategoryDetail]);

    // Category Update
    const handleCategoryUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch(`${API_BASE}/admin/intents/categories/${params.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(categoryFormData)
        });
        if (res.ok) {
            await fetchCategoryDetail();
            setIsEditing(false);
        }
    };

    // Keyword Management
    const handleKeywordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const url = keywordFormData.id
            ? `${API_BASE}/admin/intents/keywords/${keywordFormData.id}`
            : `${API_BASE}/admin/intents/keywords`;
        const res = await fetch(url, {
            method: keywordFormData.id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...keywordFormData, category_id: params.id })
        });
        if (res.ok) {
            await fetchCategoryDetail();
            setShowKeywordForm(false);
            setKeywordFormData({ id: null, keyword: '', match_type: 'contains' });
        }
    };

    const handleDeleteKeyword = async (id: number) => {
        if (!confirm('เน€เธเธ…เน€เธย Keyword เน€เธยเน€เธเธ•เน€เธย?')) return;
        const res = await fetch(`${API_BASE}/admin/intents/keywords/${id}`, { method: 'DELETE' });
        if (res.ok) fetchCategoryDetail();
    };

    // Response Management
    const handleResponseSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        let payload = null;
        if (responseFormData.reply_type === 'flex' || responseFormData.reply_type === 'template') {
            try {
                payload = JSON.parse(responseFormData.payload);
                setPayloadError(null);
            } catch {
                setPayloadError('Invalid JSON format');
                return;
            }
        }

        const url = responseFormData.id
            ? `${API_BASE}/admin/intents/responses/${responseFormData.id}`
            : `${API_BASE}/admin/intents/responses`;

        const body = {
            ...responseFormData,
            payload: payload,
            category_id: params.id
        };

        const res = await fetch(url, {
            method: responseFormData.id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            await fetchCategoryDetail();
            setShowResponseForm(false);
            resetResponseForm();
        }
    };

    const resetResponseForm = () => {
        setResponseFormData({ id: null, reply_type: 'text', text_content: '', payload: '{}', is_active: true });
        setPayloadError(null);
    };

    const handleEditResponse = (resp: IntentResponse) => {
        setResponseFormData({
            id: resp.id,
            reply_type: resp.reply_type,
            text_content: resp.text_content || '',
            payload: resp.payload ? JSON.stringify(resp.payload, null, 2) : '{}',
            is_active: resp.is_active
        });
        setShowResponseForm(true);
    };

    const handleDeleteResponse = async (id: number) => {
        if (!confirm('เน€เธเธ…เน€เธย Response เน€เธยเน€เธเธ•เน€เธย?')) return;
        const res = await fetch(`${API_BASE}/admin/intents/responses/${id}`, { method: 'DELETE' });
        if (res.ok) fetchCategoryDetail();
    };

    if (loading) return <div className="p-8 text-center text-text-tertiary">เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธ…เน€เธโ€...</div>;
    if (!category) return <div className="p-8 text-center text-text-tertiary">เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ…</div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto">
            {/* Header */}
            <PageHeader
                title={category.name}
                subtitle={`${category.keywords.length} keywords \u00B7 ${category.responses.length} responses \u00B7 ${category.is_active ? 'Active' : 'Inactive'}`}
            >
                <Link href="/admin/auto-replies">
                    <Button variant="outline" size="icon" className="rounded-xl">
                        <ChevronLeft className="w-5 h-5" />
                    </Button>
                </Link>
                <Button
                    variant={isEditing ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setIsEditing(!isEditing)}
                    leftIcon={<Edit2 className="w-4 h-4" />}
                >
                    {isEditing ? 'Cancel Edit' : 'Edit Details'}
                </Button>
                {isEditing && (
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleCategoryUpdate}
                    >
                        Save Changes
                    </Button>
                )}
            </PageHeader>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Column: Details & Keywords */}
                <div className="space-y-6 lg:col-span-2">

                    {/* Description Card */}
                    {(category.description || isEditing) && (
                        <Card variant="default" padding="lg">
                            <h3 className="text-sm font-semibold text-text-primary mb-3 uppercase tracking-wider">Description</h3>
                            {isEditing ? (
                                <textarea
                                    value={categoryFormData.description}
                                    onChange={(e) => setCategoryFormData({ ...categoryFormData, description: e.target.value })}
                                    className="w-full px-3 py-2 border border-border-default rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-sm transition-all bg-surface text-text-primary placeholder:text-text-tertiary"
                                    rows={3}
                                    placeholder="Add a description..."
                                />
                            ) : (
                                <p className="text-text-secondary text-sm leading-relaxed">{category.description || 'No description provided.'}</p>
                            )}

                            {isEditing && (
                                <div className="mt-4 pt-4 border-t border-border-default">
                                    <div className="flex items-center gap-3">
                                        <label className="text-sm font-medium text-text-primary">Category Name</label>
                                        <Input
                                            type="text"
                                            value={categoryFormData.name}
                                            onChange={(e) => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
                                            className="flex-1"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 mt-3">
                                        <input
                                            type="checkbox"
                                            checked={categoryFormData.is_active}
                                            onChange={(e) => setCategoryFormData({ ...categoryFormData, is_active: e.target.checked })}
                                            className="w-4 h-4 text-primary border-border-default rounded focus:ring-brand-500/30"
                                            id="isActive"
                                        />
                                        <label htmlFor="isActive" className="text-sm text-text-secondary cursor-pointer select-none">Active Status</label>
                                    </div>
                                </div>
                            )}
                        </Card>
                    )}

                    {/* Keywords Card */}
                    <Card variant="default" padding="none" className="overflow-hidden">
                        <CardHeader divider className="px-6 py-4 flex-row justify-between items-center bg-bg">
                            <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Keywords</h3>
                            <button
                                onClick={() => setShowKeywordForm(true)}
                                className="p-2 text-primary hover:bg-primary/8 rounded-lg transition-colors"
                                title="Add Keyword"
                            >
                                <Plus className="w-5 h-5" />
                            </button>
                        </CardHeader>
                        <CardContent className="p-6">
                            {category.keywords.length === 0 ? (
                                <div className="text-center py-8">
                                    <div className="w-12 h-12 bg-bg rounded-full flex items-center justify-center mx-auto mb-3 text-text-tertiary">
                                        <Key className="w-6 h-6" />
                                    </div>
                                    <p className="text-text-tertiary text-sm">No keywords defined yet</p>
                                    <button onClick={() => setShowKeywordForm(true)} className="text-primary text-sm font-medium mt-2 hover:underline">Add one now</button>
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {category.keywords.map((kw) => (
                                        <div key={kw.id} className="group flex items-center bg-bg border border-border-default rounded-full pl-3 pr-2 py-1.5 transition-all hover:border-primary/20 hover:bg-primary/8">
                                            <span className="text-sm text-text-primary font-medium">{kw.keyword}</span>
                                            <span className="mx-2 text-[10px] text-text-tertiary uppercase tracking-wide bg-surface px-1.5 py-0.5 rounded border border-border-default">
                                                {kw.match_type === 'exact' ? '=' : kw.match_type === 'contains' ? 'abc' : '*'}
                                            </span>
                                            <button
                                                onClick={() => handleDeleteKeyword(kw.id)}
                                                className="w-5 h-5 flex items-center justify-center rounded-full text-text-tertiary hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                </div>

                {/* Right Column: Responses */}
                <div className="space-y-6">
                    <Card variant="default" padding="none" className="overflow-hidden h-full">
                        <CardHeader divider className="px-6 py-4 flex-row justify-between items-center bg-bg">
                            <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Responses</h3>
                            <button
                                onClick={() => { resetResponseForm(); setShowResponseForm(true); }}
                                className="p-2 text-primary hover:bg-primary/8 rounded-lg transition-colors"
                                title="Add Response"
                            >
                                <Plus className="w-5 h-5" />
                            </button>
                        </CardHeader>
                        <CardContent className="p-4 space-y-3">
                            {category.responses.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="w-12 h-12 bg-bg rounded-full flex items-center justify-center mx-auto mb-3 text-text-tertiary">
                                        <MessageSquare className="w-6 h-6" />
                                    </div>
                                    <p className="text-text-tertiary text-sm">No responses configured</p>
                                </div>
                            ) : (
                                category.responses.map((resp, index) => (
                                    <div key={resp.id} className="group relative bg-surface border border-border-default rounded-xl p-4 hover:shadow-md transition-all hover:border-brand-200">
                                        <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleEditResponse(resp)}
                                                className="p-1.5 text-text-tertiary hover:text-primary hover:bg-brand-50 rounded-lg"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteResponse(resp.id)}
                                                className="p-1.5 text-text-tertiary hover:text-red-600 hover:bg-red-50 rounded-lg"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>

                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="w-6 h-6 flex items-center justify-center bg-bg rounded-full text-xs font-bold text-text-tertiary">
                                                {index + 1}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide ${resp.reply_type === 'text' ? 'bg-info/10 text-info-text' :
                                                    resp.reply_type === 'flex' ? 'bg-brand-50 text-brand-600' :
                                                        resp.reply_type === 'image' ? 'bg-danger/10 text-danger-text' :
                                                            'bg-bg text-text-secondary'
                                                }`}>
                                                {resp.reply_type}
                                            </span>
                                            {!resp.is_active && (
                                                <span className="text-[10px] px-1.5 py-0.5 bg-bg text-text-tertiary rounded">Inactive</span>
                                            )}
                                        </div>

                                        <div className="text-sm text-text-primary">
                                            {resp.reply_type === 'text' ? (
                                                <p className="line-clamp-3 whitespace-pre-wrap">{resp.text_content}</p>
                                            ) : resp.payload ? (
                                                <div className="bg-bg rounded p-2 border border-border-default font-mono text-xs text-text-secondary overflow-hidden">
                                                    <div className="flex items-center gap-2 text-text-tertiary mb-1">
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>
                                                        JSON Payload
                                                    </div>
                                                    <pre className="line-clamp-3">{JSON.stringify(resp.payload, null, 2)}</pre>
                                                </div>
                                            ) : (
                                                <p className="text-text-tertiary italic">No content</p>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Keyword Form Modal */}
            {showKeywordForm && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-surface rounded-2xl p-0 max-w-sm w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-border-default bg-bg">
                            <h2 className="text-lg font-semibold text-text-primary">Add Keyword</h2>
                        </div>
                        <form onSubmit={handleKeywordSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">Keyword Phrase</label>
                                <Input
                                    type="text"
                                    value={keywordFormData.keyword}
                                    onChange={(e) => setKeywordFormData({ ...keywordFormData, keyword: e.target.value })}
                                    placeholder="e.g. hello, pricing, contact"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">Match Logic</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {MATCH_TYPES.map(type => (
                                        <label
                                            key={type}
                                            className={cn(
                                                'cursor-pointer border rounded-lg p-3 flex items-center gap-2 transition-all',
                                                keywordFormData.match_type === type
                                                    ? 'border-brand-500 bg-brand-50/50 text-brand-700'
                                                    : 'border-border-default hover:border-border-hover text-text-secondary'
                                            )}
                                        >
                                            <input
                                                type="radio"
                                                name="match_type"
                                                value={type}
                                                checked={keywordFormData.match_type === type}
                                                onChange={(e) => setKeywordFormData({ ...keywordFormData, match_type: e.target.value })}
                                                className="hidden"
                                            />
                                            <span className="text-sm font-medium capitalize">{type.replace('_', ' ')}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1 rounded-xl"
                                    onClick={() => setShowKeywordForm(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    variant="primary"
                                    className="flex-1 rounded-xl"
                                >
                                    Add Keyword
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Response Form Modal */}
            {showResponseForm && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-surface rounded-2xl p-0 max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-border-default bg-bg flex justify-between items-center">
                            <h2 className="text-lg font-semibold text-text-primary">{responseFormData.id ? 'Edit Response' : 'Add Response'}</h2>
                            <button onClick={() => setShowResponseForm(false)} className="text-text-tertiary hover:text-text-secondary">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleResponseSubmit} className="p-6 space-y-5">
                            <div>
                                <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-2">Message Type</label>
                                <div className="flex flex-wrap gap-2">
                                    {REPLY_TYPES.map(type => (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => setResponseFormData({ ...responseFormData, reply_type: type })}
                                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${responseFormData.reply_type === type
                                                    ? 'bg-gradient-to-br from-primary to-primary-dark text-white shadow-md shadow-primary/20'
                                                    : 'bg-bg text-text-secondary hover:bg-border-default'
                                                }`}
                                        >
                                            {type.charAt(0).toUpperCase() + type.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Dynamic Fields based on Reply Type */}
                            {responseFormData.reply_type === 'text' && (
                                <div>
                                    <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">Text Content</label>
                                    <textarea
                                        value={responseFormData.text_content}
                                        onChange={(e) => setResponseFormData({ ...responseFormData, text_content: e.target.value })}
                                        className="w-full px-4 py-3 border border-border-default rounded-xl focus:ring-4 focus:ring-brand-500/20 focus:border-brand-500 text-sm transition-all bg-surface text-text-primary placeholder:text-text-tertiary"
                                        rows={4}
                                        placeholder="Enter the reply message..."
                                        required
                                        autoFocus
                                    />
                                </div>
                            )}

                            {(responseFormData.reply_type === 'flex' || responseFormData.reply_type === 'template') && (
                                <div>
                                    <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">
                                        JSON Payload
                                        <span className="ml-2 text-[10px] normal-case bg-bg text-text-tertiary px-1.5 py-0.5 rounded">Required for Flex/Template</span>
                                    </label>
                                    <div className="relative">
                                        <textarea
                                            value={responseFormData.payload}
                                            onChange={(e) => {
                                                setResponseFormData({ ...responseFormData, payload: e.target.value });
                                                setPayloadError(null);
                                            }}
                                            className={`w-full px-4 py-3 border rounded-xl focus:ring-4 text-sm font-mono transition-all bg-surface text-text-primary placeholder:text-text-tertiary ${payloadError
                                                    ? 'border-red-300 focus:ring-red-100 focus:border-red-500'
                                                    : 'border-border-default focus:ring-brand-500/20 focus:border-brand-500'
                                                }`}
                                            rows={8}
                                            placeholder='{\n  "type": "flex",\n  "altText": "Start",\n  "contents": { ... }\n}'
                                        />
                                        {payloadError && (
                                            <div className="absolute bottom-3 right-3 text-xs text-red-500 font-medium bg-red-50 px-2 py-1 rounded">
                                                {payloadError}
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-xs text-text-tertiary mt-2">
                                        Tip: You can use <a href="https://developers.line.biz/flex-simulator/" target="_blank" className="text-primary hover:underline">LINE Flex Simulator</a> to generate JSON.
                                    </p>
                                </div>
                            )}

                            <div className="flex items-center gap-2 pt-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={responseFormData.is_active}
                                        onChange={(e) => setResponseFormData({ ...responseFormData, is_active: e.target.checked })}
                                        className="w-4 h-4 text-primary border-border-default rounded focus:ring-brand-500/30"
                                    />
                                    <span className="text-sm font-medium text-text-primary">Set as Active</span>
                                </label>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1 rounded-xl"
                                    onClick={() => setShowResponseForm(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    variant="primary"
                                    className="flex-1 rounded-xl"
                                >
                                    {responseFormData.id ? 'Save Changes' : 'Create Response'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
