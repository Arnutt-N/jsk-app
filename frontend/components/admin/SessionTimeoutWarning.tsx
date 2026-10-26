'use client';

import { Modal } from '@/components/ui/Modal';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { useAuth } from '@/contexts/AuthContext';
import { AlertCircle } from 'lucide-react';

/**
 * Only the two explicit buttons act. Escape, a backdrop tap, and the X would
 * each renew an idle admin session over citizen data, so they are blocked:
 * the clock must move on a deliberate choice, not on a stray tap.
 */
export function SessionTimeoutWarning() {
  const { logout } = useAuth();
  const { showWarning, remainingTime, extendSession } = useSessionTimeout(logout);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Modal
      isOpen={showWarning}
      onClose={extendSession}
      title="Session Expiring Soon"
      maxWidth="md"
      dismissDisabled
      showCloseButton={false}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-warning/12 flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-warning" />
        </div>
        <p className="text-slate-600">
          Your session will expire in{' '}
          <span className="font-semibold text-danger">{formatTime(remainingTime)}</span> due to
          inactivity. Click below to stay logged in.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={extendSession}
          autoFocus
          className="flex-1 bg-gradient-to-br from-primary to-primary-dark text-white py-2 px-4 rounded-xl hover:shadow-lg transition-all font-medium active:scale-[0.97] cursor-pointer"
        >
          Stay Logged In
        </button>
        <button
          onClick={logout}
          className="flex-1 bg-slate-100 text-slate-700 py-2 px-4 rounded-xl hover:bg-slate-200 transition-all font-medium cursor-pointer"
        >
          Logout
        </button>
      </div>
    </Modal>
  );
}
