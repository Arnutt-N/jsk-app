'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Search, User as UserIcon } from 'lucide-react';

interface Agent {
    id: number;
    display_name: string;
    role: string;
    active_tasks: number;
    pending_tasks: number;
    in_progress_tasks: number;
}

interface AssignModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAssign: (agentId: number, agentName: string) => Promise<void>;
    currentAssigneeId?: number;
}

export const AssignModal: React.FC<AssignModalProps> = ({
    isOpen,
    onClose,
    onAssign,
    currentAssigneeId
}) => {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [assigningId, setAssigningId] = useState<number | null>(null);

    const API_BASE = '/api/v1';

    const fetchAgents = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/users/workload?role=AGENT`);
            if (!res.ok) throw new Error('Failed to fetch agents');
            const data = await res.json();
            setAgents(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [API_BASE]);

    useEffect(() => {
        if (isOpen) {
            fetchAgents();
        }
    }, [fetchAgents, isOpen]);

    const handleAssign = async (agent: Agent) => {
        setAssigningId(agent.id);
        await onAssign(agent.id, agent.display_name);
        setAssigningId(null);
        onClose();
    };

    const getWorkloadColor = (count: number) => {
        if (count === 0) return 'text-success-text bg-success/5 border-success/30';
        if (count < 5) return 'text-info-text bg-info/5 border-info/30';
        if (count < 10) return 'text-warning-text bg-warning/5 border-warning/30';
        return 'text-danger-text bg-danger/5 border-danger/30';
    };

    const filteredAgents = agents.filter(a =>
        a.display_name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="มอบหมายงาน (Assign Request)" maxWidth="md">
            <div className="space-y-4">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                    <input
                        type="text"
                        placeholder="ค้นหาเจ้าหน้าที่..."
                        className="w-full pl-10 pr-4 py-2 bg-bg border border-border-default rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                {/* Agents List */}
                <div className="max-h-[400px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                    ) : filteredAgents.length === 0 ? (
                        <div className="text-center py-8 text-text-tertiary">
                            <UserIcon className="w-12 h-12 mx-auto opacity-20 mb-2" />
                            <p className="text-sm">ไม่พบรายชื่อเจ้าหน้าที่</p>
                        </div>
                    ) : (
                        filteredAgents.map(agent => (
                            <div
                                key={agent.id}
                                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${currentAssigneeId === agent.id
                                    ? 'bg-brand-50 border-brand-200 ring-1 ring-brand-200'
                                    : 'bg-surface border-border-default hover:border-brand-200 hover:shadow-sm'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${currentAssigneeId === agent.id ? 'bg-brand-500 text-white' : 'bg-muted text-text-tertiary'
                                        }`}>
                                        {agent.display_name[0]}
                                    </div>
                                    <div>
                                        <p className={`text-sm font-bold ${currentAssigneeId === agent.id ? 'text-brand-700' : 'text-text-primary'}`}>
                                            {agent.display_name}
                                            {currentAssigneeId === agent.id && <span className="ml-2 text-[10px] bg-brand-200 text-brand-700 px-1.5 py-0.5 rounded-full">Current</span>}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className={`text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${getWorkloadColor(agent.active_tasks)}`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${agent.active_tasks > 8 ? 'bg-danger' : 'bg-current'}`}></div>
                                                Workload: {agent.active_tasks} tasks
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    variant={currentAssigneeId === agent.id ? "outline" : "primary"}
                                    disabled={currentAssigneeId === agent.id || assigningId !== null}
                                    onClick={() => handleAssign(agent)}
                                    isLoading={assigningId === agent.id}
                                    className={currentAssigneeId === agent.id ? "border-brand-200 text-brand-600 bg-brand-50" : ""}
                                >
                                    {currentAssigneeId === agent.id ? 'มอบหมายอยู่' : 'เลือก'}
                                </Button>
                            </div>
                        ))
                    )}
                </div>

                <div className="flex justify-between items-center pt-2 text-xs text-text-tertiary">
                    <p>* Active Tasks = Pending + In Progress</p>
                    <Button variant="ghost" size="sm" onClick={onClose}>ปิดหน้าต่าง</Button>
                </div>
            </div>
        </Modal>
    );
};
