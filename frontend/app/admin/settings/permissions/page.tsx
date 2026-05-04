'use client'

/**
 * Settings > การกำหนดสิทธิ์ (/admin/settings/permissions)
 *
 * Stage 2 of the permission redesign: a matrix editor where rows are
 * permission rules and columns are user roles. SUPER_ADMIN / ADMIN can
 * toggle checkboxes; everyone else sees the same matrix as read-only.
 *
 * The lockout safeguard (cannot remove SUPER_ADMIN from
 * edit_permission_settings) is enforced both client-side (the checkbox
 * is disabled) and server-side (PATCH rejects with 400).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ShieldCheck, AlertCircle, CheckCircle2, Lock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import PageHeader from '@/app/admin/components/PageHeader'
import {
  fetchPermissionSummary,
  updatePermissions,
  usePermissions,
  type PermissionRule,
  type PermissionSummary,
} from '@/lib/permissions'

// Roles displayed as columns -- keep ordered by privilege (highest first).
const ROLE_COLUMNS = ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'HEAD', 'AGENT', 'USER'] as const
type RoleValue = (typeof ROLE_COLUMNS)[number]

const ROLE_LABELS: Record<RoleValue, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  DIRECTOR: 'ผู้อำนวยการ',
  HEAD: 'หัวหน้าฝ่าย',
  AGENT: 'เจ้าหน้าที่',
  USER: 'ผู้ใช้ทั่วไป',
}

const KEY_EDIT_SETTINGS = 'edit_permission_settings'

export default function PermissionSettingsPage() {
  const me = usePermissions()
  const canEdit = me?.can_edit_permissions ?? false

  const [rules, setRules] = useState<PermissionRule[]>([])
  const [originalRules, setOriginalRules] = useState<PermissionRule[]>([])
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
    const fetched = summary.rules ?? []
    setRules(fetched)
    setOriginalRules(fetched.map((r) => ({ ...r, allowed_roles: [...r.allowed_roles] })))
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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

  const toggleRole = (ruleKey: string, role: RoleValue) => {
    if (!canEdit) return
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.key !== ruleKey) return rule
        const has = rule.allowed_roles.includes(role)
        // Lockout safeguard: SUPER_ADMIN cannot be removed from edit_permission_settings.
        if (rule.key === KEY_EDIT_SETTINGS && role === 'SUPER_ADMIN' && has) {
          setError('ห้ามถอด SUPER_ADMIN ออกจากสิทธิ์แก้ไขการตั้งค่า')
          return rule
        }
        return {
          ...rule,
          allowed_roles: has
            ? rule.allowed_roles.filter((r) => r !== role)
            : [...rule.allowed_roles, role],
        }
      }),
    )
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    const result = await updatePermissions(rules)
    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? 'บันทึกไม่สำเร็จ')
      return
    }
    setSuccess('บันทึกการตั้งค่าสิทธิ์เรียบร้อย')
    if (result.summary?.rules) {
      const next = result.summary.rules
      setRules(next)
      setOriginalRules(next.map((r) => ({ ...r, allowed_roles: [...r.allowed_roles] })))
    }
  }

  const handleCancel = () => {
    setRules(originalRules.map((r) => ({ ...r, allowed_roles: [...r.allowed_roles] })))
    setError(null)
    setSuccess(null)
  }

  const isCellLocked = (ruleKey: string, role: RoleValue): boolean => {
    return ruleKey === KEY_EDIT_SETTINGS && role === 'SUPER_ADMIN'
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader title="การกำหนดสิทธิ์" subtitle="กำหนดว่า role ใดสามารถทำงานใดได้บ้าง">
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

      <Card glass className="border-none shadow-sm">
        <CardContent className="p-6">
          {loading ? (
            <div className="py-12">
              <LoadingSpinner label="กำลังโหลด..." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-default text-xs font-bold text-text-tertiary uppercase tracking-wider">
                    <th className="text-left px-4 py-3 min-w-[280px]">สิทธิ์ / รายละเอียด</th>
                    {ROLE_COLUMNS.map((role) => (
                      <th key={role} className="text-center px-3 py-3 whitespace-nowrap">
                        <div className="font-bold">{role}</div>
                        <div className="text-[10px] font-normal text-text-tertiary">{ROLE_LABELS[role]}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.key} className="border-b border-border-default last:border-b-0 hover:bg-bg/50">
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-2">
                          <ShieldCheck size={16} className="text-primary mt-0.5 shrink-0" />
                          <div>
                            <div className="font-bold text-text-primary">{rule.description ?? rule.key}</div>
                            <div className="text-xs text-text-tertiary mt-0.5 font-mono">{rule.key}</div>
                          </div>
                        </div>
                      </td>
                      {ROLE_COLUMNS.map((role) => {
                        const checked = rule.allowed_roles.includes(role)
                        const locked = isCellLocked(rule.key, role)
                        return (
                          <td key={role} className="px-3 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!canEdit || locked}
                              onChange={() => toggleRole(rule.key, role)}
                              className="w-5 h-5 rounded border-2 border-border-default text-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                              title={locked ? 'ห้ามถอด SUPER_ADMIN ออกจากสิทธิ์นี้' : undefined}
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

      {canEdit && !loading && (
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleCancel} disabled={!isDirty || saving}>
            ยกเลิก
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!isDirty || saving}>
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
        </div>
      )}
    </div>
  )
}
