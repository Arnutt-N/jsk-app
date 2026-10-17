'use client'

import { CheckCircle2 } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface LiffStep {
  label: string
  icon: React.ReactNode
}

interface LiffStepperProps {
  steps: LiffStep[]
  currentIndex: number
  ariaLabel: string
  className?: string
}

/** Shared LIFF wizard stepper. Pages own step derivation and pass it in. */
export default function LiffStepper({ steps, currentIndex, ariaLabel, className }: LiffStepperProps) {
  return (
    <ol className={cn('mb-8 flex items-center justify-between px-2', className)} aria-label={ariaLabel}>
      {steps.map((s, index) => {
        const done = index < currentIndex
        const state = done ? 'done' : index === currentIndex ? 'current' : 'todo'
        return (
          <li key={s.label} className="relative flex flex-1 flex-col items-center gap-2">
            <span
              className={cn(
                'z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors',
                state === 'todo'
                  ? 'bg-border-default text-text-tertiary'
                  : 'bg-brand-500 text-white shadow-md',
              )}
            >
              {done ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : index + 1}
            </span>
            <span
              className={cn(
                'flex items-center gap-1 text-[10px] font-semibold',
                state === 'todo' ? 'text-text-tertiary' : 'text-brand-text',
              )}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {s.icon}
              {s.label}
            </span>
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-[60%] top-4 h-[2px] w-full',
                  done ? 'bg-brand-500' : 'bg-border-default',
                )}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
