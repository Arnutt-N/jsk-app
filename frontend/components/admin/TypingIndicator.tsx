'use client';

import React from 'react';

interface TypingIndicatorProps {
    isTyping: boolean;
    label?: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
    isTyping,
    label = 'typing'
}) => {
    if (!isTyping) return null;

    return (
        <div className="flex items-center gap-2 px-4 py-2 text-slate-500 text-sm">
            <div className="flex gap-1">
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse [animation-delay:-0.3s]" />
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse [animation-delay:-0.15s]" />
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse" />
            </div>
            <span className="text-xs">{label}...</span>
        </div>
    );
};
