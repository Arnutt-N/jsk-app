import { describe, it, expect } from 'vitest'
import {
  ROLE,
  ROLE_META,
  STAFF_ROLES,
  getRoleLabel,
  getRoleLabelTh,
  getRoleOptionLabel,
  getRoleBadgeVariant,
  isStaffRole,
} from '../roles'

describe('roles constants', () => {
  describe('getRoleLabel', () => {
    it('renames AGENT to "Operator"', () => {
      expect(getRoleLabel('AGENT')).toBe('Operator')
    })

    it('normalizes lowercased raw enum values', () => {
      // Auth context sometimes surfaces the raw lowercased role.
      expect(getRoleLabel('agent')).toBe('Operator')
    })

    it('labels the privileged roles', () => {
      expect(getRoleLabel('SUPER_ADMIN')).toBe('Super Admin')
      expect(getRoleLabel('DIRECTOR')).toBe('Director')
      expect(getRoleLabel('HEAD')).toBe('Head')
    })

    it('falls back to the raw value for unknown roles', () => {
      expect(getRoleLabel('WAT')).toBe('WAT')
    })

    it('returns a dash for nullish input', () => {
      expect(getRoleLabel(null)).toBe('-')
      expect(getRoleLabel(undefined)).toBe('-')
      expect(getRoleLabel('')).toBe('-')
    })
  })

  describe('getRoleLabelTh', () => {
    it('keeps the legitimate Thai job title for AGENT', () => {
      expect(getRoleLabelTh('AGENT')).toBe('เจ้าหน้าที่')
    })

    it('labels DIRECTOR and HEAD in Thai', () => {
      expect(getRoleLabelTh('DIRECTOR')).toBe('ผู้อำนวยการ')
      expect(getRoleLabelTh('HEAD')).toBe('หัวหน้าฝ่าย')
    })
  })

  describe('getRoleOptionLabel', () => {
    it('combines English and Thai for select lists', () => {
      expect(getRoleOptionLabel('AGENT')).toBe('Operator (เจ้าหน้าที่)')
    })

    it('falls back to the raw value for unknown roles', () => {
      expect(getRoleOptionLabel('WAT')).toBe('WAT')
    })
  })

  describe('getRoleBadgeVariant', () => {
    it('maps known roles to their badge variant', () => {
      expect(getRoleBadgeVariant('AGENT')).toBe('success')
      expect(getRoleBadgeVariant('SUPER_ADMIN')).toBe('primary')
    })

    it('defaults unknown roles to gray', () => {
      expect(getRoleBadgeVariant('nope')).toBe('gray')
      expect(getRoleBadgeVariant(null)).toBe('gray')
    })
  })

  describe('isStaffRole', () => {
    it('treats internal roles as staff', () => {
      expect(isStaffRole('AGENT')).toBe(true)
      expect(isStaffRole('DIRECTOR')).toBe(true)
      expect(isStaffRole('SUPER_ADMIN')).toBe(true)
    })

    it('excludes the public USER role', () => {
      expect(isStaffRole('USER')).toBe(false)
      expect(isStaffRole(null)).toBe(false)
    })
  })

  describe('regression guards', () => {
    it('never labels a single role "Staff" (the removed mislabel)', () => {
      expect(Object.values(ROLE_META).every((m) => m.label !== 'Staff')).toBe(true)
    })

    it('defines all six roles', () => {
      expect(Object.keys(ROLE_META).sort()).toEqual(
        ['ADMIN', 'AGENT', 'DIRECTOR', 'HEAD', 'SUPER_ADMIN', 'USER'],
      )
    })

    it('STAFF_ROLES excludes USER and matches the ROLE map', () => {
      expect(STAFF_ROLES).not.toContain(ROLE.USER)
      expect(STAFF_ROLES).toHaveLength(5)
    })
  })
})
