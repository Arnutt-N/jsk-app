'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { HelpCircle, Search, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/Sheet'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/Accordion'
import { Badge } from '@/components/ui/Badge'
import {
  HELP_ENTRIES,
  HELP_CATEGORIES,
  type HelpEntry,
} from '@/lib/help-content'

/**
 * Slide-in help panel accessible via `?` key or the header button.
 *
 * Features:
 * - Search (filters entries across all categories)
 * - Accordion categories
 * - Deep-link from CommandPalette (scroll to specific entry)
 * - Keyboard shortcut reference at the bottom
 */

const SHORTCUTS = [
  { keys: ['⌘K', 'Ctrl+K'], description: 'เปิด Command Palette' },
  { keys: ['?'], description: 'เปิดระบบช่วยเหลือ' },
  { keys: ['⌘1', 'Ctrl+1'], description: 'ไปที่ Dashboard' },
  { keys: ['⌘2', 'Ctrl+2'], description: 'ไปที่คำร้อง' },
  { keys: ['⌘3', 'Ctrl+3'], description: 'ไปที่แชทสด' },
  { keys: ['⌘Z', 'Ctrl+Z'], description: 'Undo (ในแบบฟอร์ม)' },
  { keys: ['⌘⇧Z', 'Ctrl+Shift+Z'], description: 'Redo (ในแบบฟอร์ม)' },
  { keys: ['Esc'], description: 'ปิด dialog/dropdown' },
]

export function HelpSheet() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [focusEntryId, setFocusEntryId] = useState<string | null>(null)

  // Listen for custom event to open with a specific entry
  useEffect(() => {
    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { entryId?: string } | undefined
      setOpen(true)
      setSearch('')
      if (detail?.entryId) {
        setFocusEntryId(detail.entryId)
      }
    }
    const handleClose = () => {
      setOpen(false)
      setSearch('')
      setFocusEntryId(null)
    }
    window.addEventListener('jsk:open-help', handleOpen as EventListener)
    window.addEventListener('jsk:close-help', handleClose as EventListener)
    return () => {
      window.removeEventListener('jsk:open-help', handleOpen as EventListener)
      window.removeEventListener('jsk:close-help', handleClose as EventListener)
    }
  }, [])

  // Keyboard shortcut: ?
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Auto-scroll to focused entry when opened via CommandPalette
  useEffect(() => {
    if (open && focusEntryId) {
      // Small delay to let the accordion render
      const timer = setTimeout(() => {
        const el = document.getElementById(`help-entry-${focusEntryId}`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [open, focusEntryId])

  const filteredEntries = useMemo(() => {
    if (!search.trim()) return HELP_ENTRIES
    const q = search.toLowerCase()
    return HELP_ENTRIES.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.titleEn.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        e.keywords.some((k) => k.toLowerCase().includes(q)),
    )
  }, [search])

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, HelpEntry[]>()
    for (const entry of filteredEntries) {
      const key = entry.categoryEn
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(entry)
    }
    return groups
  }, [filteredEntries])

  // Determine which accordion items should be open
  const defaultOpenCategories = useMemo(() => {
    if (focusEntryId) {
      const entry = HELP_ENTRIES.find((e) => e.id === focusEntryId)
      if (entry) return [entry.categoryEn]
    }
    if (search.trim()) {
      return Array.from(groupedEntries.keys())
    }
    return []
  }, [focusEntryId, search, groupedEntries])

  const handleClose = useCallback(() => {
    setOpen(false)
    setSearch('')
    setFocusEntryId(null)
  }, [])

  return (
    <Sheet open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-brand-600" />
            ช่วยเหลือ
          </SheetTitle>
        </SheetHeader>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
          <input
            type="text"
            aria-label="ค้นหาวิธีใช้"
            placeholder="ค้นหาวิธีใช้..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border-default bg-surface pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
            autoFocus={false}
          />
        </div>

        {/* Help entries by category */}
        {filteredEntries.length === 0 ? (
          <div className="py-12 text-center text-text-secondary">
            <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">ไม่พบผลลัพธ์สำหรับ &ldquo;{search}&rdquo;</p>
          </div>
        ) : (
          <Accordion type="multiple" defaultValue={defaultOpenCategories}>
            {HELP_CATEGORIES.map((cat) => {
              const entries = groupedEntries.get(cat.labelEn)
              if (!entries || entries.length === 0) return null
              return (
                <AccordionItem key={cat.id} value={cat.labelEn}>
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {entries.length}
                      </Badge>
                      <span>{cat.label}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      {entries.map((entry) => (
                        <HelpEntryCard
                          key={entry.id}
                          entry={entry}
                          isFocused={entry.id === focusEntryId}
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        )}

        {/* Keyboard shortcuts quick reference */}
        <div className="mt-6 pt-4 border-t border-border-default">
          <h3 className="text-sm font-semibold text-text-primary mb-3">
            แป้นพิมพ์ลัด
          </h3>
          <div className="space-y-1.5">
            {SHORTCUTS.map((s) => (
              <div key={s.description} className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">{s.description}</span>
                <div className="flex gap-1">
                  {s.keys.map((k) => (
                    <kbd
                      key={k}
                      className="inline-block rounded border border-border-default bg-surface-secondary px-1.5 py-0.5 font-mono text-[10px] text-text-secondary"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── Entry Card ───────────────────────────────────────────────────────

function HelpEntryCard({
  entry,
  isFocused,
}: {
  entry: HelpEntry
  isFocused: boolean
}) {
  const paragraphs = entry.content.split('\n\n')

  return (
    <div
      id={`help-entry-${entry.id}`}
      className={`rounded-lg border p-3 transition-colors ${
        isFocused
          ? 'border-brand-400 bg-brand-50/50 dark:bg-brand-950/20'
          : 'border-border-default bg-surface'
      }`}
    >
      <div className="flex items-start gap-2 mb-2">
        <entry.icon className="h-4 w-4 mt-0.5 text-brand-600 shrink-0" />
        <h4 className="text-sm font-medium text-text-primary">{entry.title}</h4>
      </div>
      <div className="ml-6 space-y-2">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-xs leading-relaxed text-text-secondary whitespace-pre-line">
            {p}
          </p>
        ))}
        {entry.relatedPages && entry.relatedPages.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {entry.relatedPages.map((path) => (
              <Link
                key={path}
                href={path}
                onClick={() => {
                  // Close help sheet when navigating
                  window.dispatchEvent(new CustomEvent('jsk:close-help'))
                }}
                className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 hover:underline"
              >
                <ChevronRight className="h-3 w-3" />
                {path.replace('/admin/', '').replace('/', ' → ') || 'Dashboard'}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default HelpSheet
