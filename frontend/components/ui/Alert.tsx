import React from 'react';
import { AlertCircle, CheckCircle, Info, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'primary' | 'success' | 'danger' | 'warning' | 'info';
    title?: string;
    closable?: boolean;
    onClose?: () => void;
}

export const Alert: React.FC<AlertProps> = ({
    children,
    className = '',
    variant = 'primary',
    title,
    closable = false,
    onClose,
    ...props
}) => {
    const variants = {
        primary: 'bg-brand-500/10 text-brand-text dark:text-brand-300 border-l-4 border-l-brand-500',
        success: 'bg-success/10 text-success-text dark:text-success-light border-l-4 border-l-success',
        danger:  'bg-danger/10 text-danger-text dark:text-danger-light border-l-4 border-l-danger',
        warning: 'bg-warning/10 text-warning-text dark:text-warning-light border-l-4 border-l-warning',
        info:    'bg-info/10 text-info-text dark:text-info-light border-l-4 border-l-info',
    };

    const icons = {
        primary: <Info className="w-5 h-5" />,
        success: <CheckCircle className="w-5 h-5" />,
        danger: <XCircle className="w-5 h-5" />,
        warning: <AlertCircle className="w-5 h-5" />,
        info: <Info className="w-5 h-5" />,
    };

    return (
        <div
            className={cn('relative p-4 rounded-xl flex items-start gap-3', variants[variant], className)}
            role="alert"
            {...props}
        >
            <div className="flex-shrink-0 mt-0.5">{icons[variant]}</div>
            <div className="flex-1 pr-6">
                {title && <h5 className="font-semibold mb-1 leading-tight">{title}</h5>}
                <div className="text-sm opacity-90">{children}</div>
            </div>
            {closable && (
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    aria-label="Close"
                >
                    <X className="w-4 h-4" />
                </button>
            )}
        </div>
    );
};
