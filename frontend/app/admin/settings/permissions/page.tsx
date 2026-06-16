'use client'

/**
 * Settings > การกำหนดสิทธิ์ (/admin/settings/permissions)
 *
 * Phase 3 — module-based matrix editor. Permission keys are grouped into 3
 * modules (Service Requests / Chatbot / System). For each (role × module)
 * cell the admin picks a level preset (None / View / Edit / Manage); the
 * preset projects onto the concrete per-key grant set via `keysForLevel`.
 * Expanding a module reveals per-key checkboxes for fine-grained override —
 * a mixed set surfaces as "กำหนดเอง" (Custom).
 *
 * The on-the-wire contract is unchanged: PATCH still sends flat per-key
 * `allowed_roles` rules; "level" exists only in this UI. SUPER_ADMIN is
 * locked into every key (mirrors the backend lockout that rejects removing
 * it from any rule). Non-editors see the same matrix read-only.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUndoableState } from '@/hooks/useUndoableState'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Lock,
  Undo2,
  Redo2,
  X,
  Save,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Tooltip } from '@/components/ui/Tooltip'
import PageHeader from '@/app/admin/components/PageHeader'
import {
  fetchPermissionSummary,
  updatePermissions,
  usePermissions,
  type PermissionRule,
} from '@/lib/permissions'
import { useAuth } from '@/contexts/AuthContext'
import { ROLE_META, type Role } from '@/lib/constants/roles'
import {
  MODULE_ORDER,
  MODULE_META,
  LEVEL,
  LEVEL_META,
  PERMISSION_REGISTRY,
  groupByModule,
  keysForLevel,
  availableLevels,
  levelForKeys,
  type Module,
  type PermissionLevel,
  type KeyLevel,
  type PermissionKeyMeta,
} from '@/lib/constants/permission-modules'

// Columns ordered by privilege, highest first.
const ROLE_COLUMNS: readonly Role[] = ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'HEAD', 'AGENT', 'USER']
const SUPER_ADMIN: Role = 'SUPER_ADMIN'

/** SUPER_ADMIN must hold every key (backend rejects otherwise) — enforce here too. */
function ensureSuperAdmin(roles: string[]): string[] {
  return roles.includes(SUPER_ADMIN) ? roles : [SUPER_ADMIN, ...roles]
}

/**
 * Build a working rule per registry key, merging persisted allowed_roles.
 * Guarantees all 16 rows exist in registry order and that SUPER_ADMIN is
 * always granted, so a partially-seeded DB still saves cleanly.
 */
function buildRules(
  loaded: PermissionRule[],
  registry: readonly PermissionKeyMeta[],
): PermissionRule[] {
  return registry.map((meta) => {
    const found = loaded.find((r) => r.key === meta.key)
    return {
      key: meta.key,
      allowed_roles: ensureSuperAdmin(found ? [...found.allowed_roles] : []),
      description: found?.description ?? meta.label,
    }
  })
}

/** Compact per-(role,module) level dropdown. Renders "กำหนดเอง" when custom. */
function LevelSelect({
  value,
  levels,
  disabled,
  onChange,
  ariaLabel,
  title,
}: {
  value: PermissionLevel | 'custom'
  levels: readonly KeyLevel[]
  disabled: boolean
  onChange: (level: PermissionLevel) => void
  ariaLabel: string
  title?: string
}) {
  const isCustom = value === 'custom'
  const accent = isCustom ? 'text-violet-600' : LEVEL_META[value].accent
  return (
    <select
      aria-label={ariaLabel}
      title={title}
      value={isCustom ? 'custom' : String(value)}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value !== 'custom') onChange(Number(e.target.value) as PermissionLevel)
      }}
      className={`w-full max-w-[120px] mx-auto block text-xs font-semibold rounded-lg border-2 border-border-default bg-bg px-2 py-1.5 ${accent} focus:ring-2 focus:ring-primary/20 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer`}
    >
      <option value={String(LEVEL.NONE)}>{LEVEL_META[LEVEL.NONE].labelTh}</option>
      {levels.map((l) => (
        <option key={l} value={String(l)}>
          {LEVEL_META[l].labelTh}
        </option>
      ))}
      {isCustom && (
        <option value="custom" disabled>
          กำหนดเอง
        </option>
      )}
    </select>
  )
}

export default function PermissionSettingsPage() {
  const me = usePermissions()
  const canEdit = me?.can_edit_permissions ?? false
  // The auth token lives in AuthContext state and is mirrored into a window
  // global by `syncAdminAuthToken(token)` so the global fetch interceptor can
  // attach it. Gate the load() effect on `token` becoming truthy to avoid a
  // 401 race (observed in CI E2E).
  const { token } = useAuth()

  // The matrix structure (module grouping, labels, level tags). Prefer the
  // live registry served by GET /permissions; fall back to the static mirror.
  const [registry, setRegistry] = useState<PermissionKeyMeta[]>([...PERMISSION_REGISTRY])

  const [rules, setRules, { undo, redo, canUndo, canRedo, reset: resetRules }] =
    useUndoableState<PermissionRule[]>([])
  const [originalRules, setOriginalRules] = useState<PermissionRule[]>([])
  const [expanded, setExpanded] = useState<Record<Module, boolean>>({
    service_requests: false,
    chatbot: false,
    system: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const summary = await fetchPermissionSummary()
    if (!summary) {
      setError('ไม่สามารถโหลดการตั้งค่าสิทธิ์ได้')
      setLoading(false)
      return
    }
    const reg =
      summary.registry && summary.registry.length ? summary.registry : [...PERMISSION_REGISTRY]
    setRegistry(reg)
    const built = buildRules(summary.rules ?? [], reg)
    resetRules(built)
    setOriginalRules(built.map((r) => ({ ...r, allowed_roles: [...r.allowed_roles] })))
    setLoading(false)
  }, [resetRules])

  useEffect(() => {
    if (!token) return
    // Mount-time fetch sets multiple pieces of local state; the React 19 lint
    // rule warns against setState in an effect, but a one-shot fetch on mount
    // is the canonical exception (same pattern as PR #38).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load, token])

  const grouped = useMemo(() => groupByModule(registry), [registry])

  const isDirty = useMemo(() => {
    if (rules.length !== originalRules.length) return true
    return rules.some((r) => {
      const orig = originalRules.find((o) => o.key === r.key)
      if (!orig) return true
      const a = [...r.allowed_roles].sort().join(',')
      const b = [...orig.allowed_roles].sort().join(',')
      return a !== b
    })
  }, [rules, originalRules])

  // Keyboard shortcuts: Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z = redo.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  const allowedRolesFor = useCallback(
    (key: string): string[] => rules.find((r) => r.key === key)?.allowed_roles ?? [],
    [rules],
  )

  const levelFor = useCallback(
    (role: Role, module: Module): PermissionLevel | 'custom' => {
      const checked = registry
        .filter((m) => m.module === module && allowedRolesFor(m.key).includes(role))
        .map((m) => m.key)
      return levelForKeys(registry, module, checked)
    },
    [registry, allowedRolesFor],
  )

  // Apply a level preset: grant exactly the keys whose level <= preset for
  // this (role, module), revoke the rest. SUPER_ADMIN is locked, never reached.
  const setLevel = (role: Role, module: Module, level: PermissionLevel) => {
    if (!canEdit || role === SUPER_ADMIN) return
    const targetKeys = new Set(keysForLevel(registry, module, level))
    const moduleKeys = new Set(registry.filter((m) => m.module === module).map((m) => m.key))
    setRules((prev) =>
      prev.map((rule) => {
        if (!moduleKeys.has(rule.key)) return rule
        const shouldHave = targetKeys.has(rule.key)
        const has = rule.allowed_roles.includes(role)
        if (shouldHave === has) return rule
        return {
          ...rule,
          allowed_roles: shouldHave
            ? [...rule.allowed_roles, role]
            : rule.allowed_roles.filter((r) => r !== role),
        }
      }),
    )
  }

  const toggleKey = (key: string, role: Role) => {
    if (!canEdit) return
    const current = rules.find((r) => r.key === key)
    if (!current) return
    const has = current.allowed_roles.includes(role)
    // Lockout safeguard: SUPER_ADMIN cannot be removed from any key. Decide
    // and surface the error BEFORE the updater so setRules stays a pure
    // function (React 19 may invoke updaters more than once).
    if (role === SUPER_ADMIN && has) {
      setError(`ห้ามถอด SUPER_ADMIN ออกจากสิทธิ์ '${key}'`)
      return
    }
    setRules((prev) =>
      prev.map((rule) =>
        rule.key === key
          ? {
              ...rule,
              allowed_roles: has
                ? rule.allowed_roles.filter((r) => r !== role)
                : [...rule.allowed_roles, role],
            }
          : rule,
      ),
    )
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    // Defense-in-depth: the backend rejects any rule missing SUPER_ADMIN, so
    // re-assert the invariant on the exact payload regardless of how `rules`
    // was edited upstream.
    const payload = rules.map((r) => ({ ...r, allowed_roles: ensureSuperAdmin(r.allowed_roles) }))
    const result = await updatePermissions(payload)
    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? 'บันทึกไม่สำเร็จ')
      return
    }
    setSuccess('บันทึกการตั้งค่าสิทธิ์เรียบร้อย')
    if (result.summary?.rules) {
      const reg =
        result.summary.registry && result.summary.registry.length
          ? result.summary.registry
          : registry
      setRegistry(reg)
      const next = buildRules(result.summary.rules, reg)
      resetRules(next)
      setOriginalRules(next.map((r) => ({ ...r, allowed_roles: [...r.allowed_roles] })))
    }
  }

  const handleCancel = useCallback(() => {
    resetRules(originalRules.map((r) => ({ ...r, allowed_roles: [...r.allowed_roles] })))
    setError(null)
    setSuccess(null)
  }, [originalRules, resetRules])

  const toggleExpand = (module: Module) =>
    setExpanded((prev) => ({ ...prev, [module]: !prev[module] }))

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader title="การกำหนดสิทธิ์" subtitle="กำหนดระดับสิทธิ์ของแต่ละบทบาทแยกตามโมดูล">
        <Link href="/admin/settings">
          <Button variant="ghost" size="icon-sm">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
      </PageHeader>

      {!canEdit && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-sm">
          <Lock size={18} className="shrink-0" />
          <span>คุณไม่มีสิทธิ์แก้ไขการตั้งค่านี้ — ดูได้อย่างเดียว (เฉพาะ Super Admin / Admin)</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-sm">
          <AlertCircle size={18} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-700 font-bold">
            ×
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-sm">
          <CheckCircle2 size={18} className="shrink-0" />
          <span className="flex-1">{success}</span>
        </div>
      )}

      {/* Level legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-secondary px-1">
        <span className="font-bold text-text-tertiary uppercase tracking-wider">ระดับสิทธิ์:</span>
        {([LEVEL.NONE, LEVEL.VIEW, LEVEL.EDIT, LEVEL.MANAGE] as PermissionLevel[]).map((lvl) => (
          <span key={lvl} className={`inline-flex items-center gap-1.5 font-semibold ${LEVEL_META[lvl].accent}`}>
            <span className="w-2 h-2 rounded-full bg-current" />
            {LEVEL_META[lvl].labelTh}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 font-semibold text-violet-600">
          <span className="w-2 h-2 rounded-full bg-current" />
          กำหนดเอง
        </span>
      </div>

      {loading ? (
        <Card glass className="border-none shadow-sm">
          <CardContent className="p-6">
            <div className="py-12">
              <LoadingSpinner label="กำลังโหลด..." />
            </div>
          </CardContent>
        </Card>
      ) : (
        MODULE_ORDER.map((module) => {
          const keys = grouped[module]
          const levels = availableLevels(registry, module)
          const isOpen = expanded[module]
          return (
            <Card key={module} glass className="border-none shadow-sm overflow-hidden">
              <CardContent className="p-0">
                {/* Module header */}
                <button
                  type="button"
                  onClick={() => toggleExpand(module)}
                  className="w-full flex items-start gap-3 px-6 py-4 text-left hover:bg-bg/50 transition-colors"
                  aria-expanded={isOpen}
                  aria-controls={`module-detail-${module}`}
                >
                  {isOpen ? (
                    <ChevronDown size={18} className="text-text-tertiary mt-1 shrink-0" />
                  ) : (
                    <ChevronRight size={18} className="text-text-tertiary mt-1 shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-text-primary text-base">{MODULE_META[module].labelTh}</span>
                      <span className="text-[11px] font-medium text-text-tertiary bg-bg px-2 py-0.5 rounded-full">
                        {keys.length} สิทธิ์
                      </span>
                    </div>
                    <p className="text-xs text-text-tertiary mt-0.5">{MODULE_META[module].descriptionTh}</p>
                  </div>
                </button>

                {/* Level preset matrix (always visible) */}
                <div className="overflow-x-auto border-t border-border-default">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs font-bold text-text-tertiary uppercase tracking-wider bg-bg/40">
                        <th className="text-left px-6 py-3 min-w-[200px]">บทบาท</th>
                        {ROLE_COLUMNS.map((role) => (
                          <th key={role} className="text-center px-3 py-3 whitespace-nowrap min-w-[130px]">
                            <div className="font-bold normal-case">{ROLE_META[role].label}</div>
                            <div className="text-[10px] font-normal text-text-tertiary">{ROLE_META[role].labelTh}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-border-default">
                        <td className="px-6 py-4 text-text-secondary">เลือกระดับสิทธิ์รวมของโมดูลนี้</td>
                        {ROLE_COLUMNS.map((role) => {
                          const lvl = levelFor(role, module)
                          const locked = role === SUPER_ADMIN
                          return (
                            <td key={role} className="px-3 py-4 text-center">
                              <LevelSelect
                                value={lvl}
                                levels={levels}
                                disabled={!canEdit || locked}
                                onChange={(next) => setLevel(role, module, next)}
                                ariaLabel={`ระดับสิทธิ์ ${MODULE_META[module].labelTh} สำหรับ ${ROLE_META[role].label}`}
                                title={locked ? 'SUPER_ADMIN มีสิทธิ์สูงสุดทุกโมดูล (ล็อกไว้)' : undefined}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Per-key override detail (expandable) */}
                {isOpen && (
                  <div
                    id={`module-detail-${module}`}
                    className="overflow-x-auto border-t border-border-default bg-bg/30"
                  >
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider">
                          <th className="text-left px-6 py-3 min-w-[200px]">สิทธิ์รายข้อ</th>
                          {ROLE_COLUMNS.map((role) => (
                            <th key={role} className="text-center px-3 py-3 min-w-[130px]">
                              {ROLE_META[role].label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {keys.map((meta) => (
                          <tr key={meta.key} className="border-t border-border-default hover:bg-bg/50">
                            <td className="px-6 py-3.5">
                              <div className="flex items-start gap-2">
                                <ShieldCheck size={15} className="text-primary mt-0.5 shrink-0" />
                                <div>
                                  <div className="font-medium text-text-primary leading-snug">{meta.label}</div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[11px] text-text-tertiary font-mono">{meta.key}</span>
                                    <span className={`text-[10px] font-bold ${LEVEL_META[meta.level].accent}`}>
                                      {LEVEL_META[meta.level].labelTh}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            {ROLE_COLUMNS.map((role) => {
                              const checked = allowedRolesFor(meta.key).includes(role)
                              const locked = role === SUPER_ADMIN
                              return (
                                <td key={role} className="px-3 py-3.5 text-center">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!canEdit || locked}
                                    onChange={() => toggleKey(meta.key, role)}
                                    aria-label={`${meta.label} สำหรับ ${ROLE_META[role].label}`}
                                    title={locked ? 'ห้ามถอด SUPER_ADMIN ออกจากสิทธิ์นี้' : undefined}
                                    className="w-5 h-5 rounded border-2 border-border-default text-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                                  />
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })
      )}

      {canEdit && !loading && (
        <div className="flex justify-end gap-3 sticky bottom-4">
          <div className="flex items-center gap-1 mr-auto">
            <Tooltip content="ย้อนกลับ (⌘Z)">
              <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo} className="h-8 w-8 p-0">
                <Undo2 className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip content="ทำซ้ำ (⌘⇧Z)">
              <Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo} className="h-8 w-8 p-0">
                <Redo2 className="h-4 w-4" />
              </Button>
            </Tooltip>
          </div>
          <Button variant="ghost" onClick={handleCancel} disabled={!isDirty || saving} leftIcon={<X className="h-4 w-4" />}>
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!isDirty || saving}
            isLoading={saving}
            loadingText="กำลังบันทึก..."
            leftIcon={<Save className="h-4 w-4" />}
          >
            บันทึก
          </Button>
        </div>
      )}
    </div>
  )
}
