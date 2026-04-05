'use client'

import { useCallback, useEffect, useRef } from 'react'
import Image from 'next/image'
import { X, MessageSquare, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLiveChatStore } from '../_store/liveChatStore'

const TOAST_DURATION_MS = 5000

export function NotificationToast() {
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

  if (notifications.length === 0) return null

  return (
    <div className="fixed right-4 top-4 z-[var(--z-toast)] flex flex-col gap-2" aria-live="polite">
      {notifications.map((toast) => (
        <div
          key={toast.id}
          className="toast-slide relative flex w-80 items-start gap-3 rounded-xl border border-border-default bg-surface p-4 shadow-xl"
        >
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
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-text-primary">{toast.title}</p>
              <button
                aria-label="Dismiss notification"
                onClick={() => dismissToast(toast.id)}
                className="shrink-0 rounded-md p-0.5 text-text-tertiary hover:text-text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{toast.message}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
