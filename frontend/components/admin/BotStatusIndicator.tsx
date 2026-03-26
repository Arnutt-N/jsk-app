'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Bot } from 'lucide-react';

type BotStatus = 'checking' | 'online' | 'offline' | 'error';

interface BotInfo {
    displayName?: string;
    pictureUrl?: string;
    basicId?: string;
}

export const BotStatusIndicator: React.FC = () => {
    const [status, setStatus] = useState<BotStatus>('checking');
    const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
    const [lastChecked, setLastChecked] = useState<Date | null>(null);

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

    const checkStatus = useCallback(async () => {
        setStatus('checking');
        try {
            const res = await fetch(`${API_BASE}/admin/credentials/line/status`);
            if (res.ok) {
                const data = await res.json();
                setStatus(data.success ? 'online' : 'error');
                setBotInfo(data.bot_info || null);
            } else {
                setStatus('error');
            }
        } catch {
            setStatus('offline');
        }
        setLastChecked(new Date());
    }, [API_BASE]);

    useEffect(() => {
        const initial = setTimeout(() => {
            void checkStatus();
        }, 0);
        const interval = setInterval(checkStatus, 60000); // Check every minute
        return () => {
            clearTimeout(initial);
            clearInterval(interval);
        };
    }, [checkStatus]);

    const statusColors: Record<BotStatus, string> = {
        checking: 'bg-orange-500 animate-pulse',
        online: 'bg-success',
        offline: 'bg-text-tertiary',
        error: 'bg-danger'
    };

    const statusLabels: Record<BotStatus, string> = {
        checking: 'Checking...',
        online: 'Online',
        offline: 'Offline',
        error: 'Error'
    };

    return (
        <div className="relative group">
            <button
                onClick={checkStatus}
                className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-muted transition-all cursor-pointer"
                title={`LINE Bot: ${statusLabels[status]}`}
            >
                <Bot className="w-4 h-4 text-text-tertiary" />
                <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
            </button>

            {/* Tooltip */}
            <div className="absolute right-0 top-full mt-2 w-48 bg-surface rounded-lg shadow-lg border border-border-default p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="flex items-center gap-2 mb-2">
                    <div className={`w-3 h-3 rounded-full ${statusColors[status]}`} />
                    <span className="font-bold text-sm text-text-primary">{statusLabels[status]}</span>
                </div>
                {botInfo?.displayName && (
                    <p className="text-xs text-text-secondary">{botInfo.displayName}</p>
                )}
                {botInfo?.basicId && (
                    <p className="text-[10px] text-text-tertiary">@{botInfo.basicId}</p>
                )}
                {lastChecked && (
                    <p className="text-[10px] text-text-tertiary mt-1">
                        Checked {lastChecked.toLocaleTimeString()}
                    </p>
                )}
            </div>
        </div>
    );
};
