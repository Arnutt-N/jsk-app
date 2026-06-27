'use client'

import { useCallback, useEffect, useRef } from 'react'
import Image from 'next/image'
import { X, MessageSquare, Bell } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useLiveChatStore } from '../_store/liveChatStore'

const TOAST_DURATION_MS = 5000

interface NotificationToastProps {
  // Called when a clickable ('message') toast body is activated — opens that room.
  onSelect?: (lineUserId: string) => void
}

export function NotificationToast({ onSelect }: NotificationToastProps) {
  const notifications = useLiveChatStore((s) => s.notifications)
  const removeNotification = useLiveChatStore((s) => s.removeNotification)

  const timerRefs = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const clearTimer = useCallback((id: string) => {
    const timer = timerRefs.current.get(id)
    if (!timer) return
    clearTimeout(timer)
    timerRefs.current.delete(id)
  }, [])

  const dismissToast = useCallback((id: string) => {
    clearTimer(id)
    removeNotification(id)
  }, [clearTimer, removeNotification])

  useEffect(() => {
    notifications.forEach((notif) => {
      if (!timerRefs.current.has(notif.id)) {
        const elapsedMs = Math.max(0, Date.now() - notif.timestamp)
        const remainingMs = Math.max(0, TOAST_DURATION_MS - elapsedMs)
        const timer = setTimeout(() => {
          dismissToast(notif.id)
        }, remainingMs)
        timerRefs.current.set(notif.id, timer)
      }
    })

    timerRefs.current.forEach((timer, id) => {
      if (!notifications.find(n => n.id === id)) {
        clearTimeout(timer)
        timerRefs.current.delete(id)
      }
    })
  }, [dismissToast, notifications])

  useEffect(() => {
    const timers = timerRefs.current
    return () => {
      timers.forEach(timer => clearTimeout(timer))
      timers.clear()
    }
  }, [])

  const reduced = useReducedMotion()

  // Render the aria-live container unconditionally (even when idle) so the live
  // region pre-exists in the DOM. If it were mounted together with the first
  // toast, screen readers (NVDA/JAWS/VoiceOver) drop that announcement (WCAG 4.1.3).
  return (
    <div className="fixed right-4 top-4 z-[var(--z-toast)] flex flex-col gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
      {notifications.map((toast) => {
        // Only 'message' toasts carrying a lineUserId are clickable; system
        // toasts (no lineUserId) render as a static row.
        const isClickable = Boolean(toast.lineUserId && onSelect)
        const content = (
          <>
            {toast.avatar ? (
              <Image src={toast.avatar} alt="User avatar" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full bg-gray-100" />
            ) : (
              <div className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                toast.type === 'system' ? "bg-warning/15 text-warning" : "bg-brand-500/15 text-brand-500"
              )}>
                {toast.type === 'system' ? <Bell className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
              </div>
            )}
            <div className="min-w-0 flex-1 pr-6">
              <p className="text-sm font-semibold text-text-primary">{toast.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{toast.message}</p>
            </div>
          </>
        )
        return (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, x: reduced ? 0 : 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduced ? 0 : 32 }}
            transition={{ duration: reduced ? 0 : 0.2, ease: [0, 0, 0.2, 1] }}
            className="relative w-80 overflow-hidden rounded-xl border border-border-default bg-surface shadow-xl"
          >
            {isClickable ? (
              <button
                type="button"
                onClick={() => toast.lineUserId && onSelect?.(toast.lineUserId)}
                aria-label={`เปิดห้องสนทนากับ ${toast.title}`}
                className="flex w-full items-start gap-3 rounded-xl p-4 text-left transition-colors cursor-pointer hover:bg-muted focus-ring thai-text"
              >
                {content}
              </button>
            ) : (
              <div className="flex w-full items-start gap-3 p-4">
                {content}
              </div>
            )}
            <button
              aria-label="ปิดการแจ้งเตือน"
              onClick={() => dismissToast(toast.id)}
              className="absolute right-2 top-2 rounded-md p-1.5 text-text-tertiary hover:text-text-primary focus-ring"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </motion.div>
        )
      })}
      </AnimatePresence>
    </div>
  )
}
