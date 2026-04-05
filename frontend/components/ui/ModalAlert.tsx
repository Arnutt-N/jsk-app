'use client';

import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';

export type AlertType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

interface ModalAlertProps {
    isOpen: boolean;
    onClose: () => void;
    type?: AlertType;
    title: string;
    message: React.ReactNode;
    onConfirm?: () => void;
    confirmText?: string;
    cancelText?: string;
    isLoading?: boolean;
}

export const ModalAlert: React.FC<ModalAlertProps> = ({
    isOpen,
    onClose,
    type = 'info',
    title,
    message,
    onConfirm,
    confirmText = 'OK',
    cancelText = 'Cancel',
    isLoading = false
}) => {

    const getIcon = () => {
        switch (type) {
            case 'success': return <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-4"><CheckCircle2 size={24} /></div>;
            case 'error': return <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 mb-4"><AlertCircle size={24} /></div>;
            case 'warning':
            case 'confirm': return <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-4"><AlertTriangle size={24} /></div>;
            default: return <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 mb-4"><Info size={24} /></div>;
        }
    };

    const getPrimaryButtonVariant = () => {
        switch (type) {
            case 'success': return 'success';
            case 'error': return 'danger';
            case 'warning': return 'warning';
            case 'confirm': return 'primary';
            default: return 'primary';
        }
    };

    const handleConfirm = () => {
        if (onConfirm) {
            onConfirm();
        } else {
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={isLoading ? () => { } : onClose} title="" maxWidth="sm">
            <div className="flex flex-col items-center text-center pt-2 pb-4">
                {getIcon()}
                <h3 className="text-xl font-bold text-slate-800 mb-2">{title}</h3>
                <div className="text-slate-500 mb-8 text-sm leading-relaxed max-w-xs break-words">
                    {message}
                </div>

                <div className="flex gap-3 w-full">
                    {(type === 'confirm' || (type === 'warning' && onConfirm)) && (
                        <Button
                            variant="ghost"
                            onClick={onClose}
                            disabled={isLoading}
                            className="flex-1"
                        >
                            {cancelText}
                        </Button>
                    )}
                    <Button
                        variant={getPrimaryButtonVariant()}
                        onClick={handleConfirm}
                        isLoading={isLoading}
                        className="flex-1 shadow-md"
                    >
                        {confirmText}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
