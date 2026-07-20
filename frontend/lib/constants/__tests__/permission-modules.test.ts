import { describe, it, expect } from 'vitest'
import {
  MODULE_ORDER,
  LEVEL,
  PERMISSION_REGISTRY,
  EXPECTED_PERMISSION_KEYS,
  groupByModule,
  keysForLevel,
  availableLevels,
  levelForKeys,
} from '../permission-modules'

// The canonical key set the backend serves (app.core.permissions). If the
// backend registry changes, this test must change with it — that is the
// drift guard.
const BACKEND_KEYS = [
  'edit_request_details',
  'revert_approval',
  'assign_request',
  'self_assign_request',
  'export_chat',
  'manage_broadcast',
  'manage_auto_replies',
  'manage_rich_menus',
  'manage_reply_objects',
  'view_reports',
  'view_audit_log',
  'edit_settings',
  'image_resize',
  'manage_users',
  'manage_files',
  'edit_permission_settings',
  // P1.2a: configurable auth gates (deps.py).
  'access_admin_endpoints',
  'access_manager_endpoints',
  'access_staff_endpoints',
  // NEW-3: configurable live-chat WebSocket gate.
  'access_live_chat',
]

describe('permission-modules registry integrity', () => {
  it('contains exactly 20 keys', () => {
    expect(PERMISSION_REGISTRY).toHaveLength(20)
  })

  it('has no duplicate keys', () => {
    const keys = PERMISSION_REGISTRY.map((m) => m.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('key set matches the backend registry (drift guard)', () => {
    expect([...EXPECTED_PERMISSION_KEYS].sort()).toEqual([...BACKEND_KEYS].sort())
  })

  it('groups into the 3 known modules only', () => {
    const modules = new Set(PERMISSION_REGISTRY.map((m) => m.module))
    expect([...modules].sort()).toEqual(['chatbot', 'service_requests', 'system'])
  })

  it('tags every key with a valid non-None level (1..3)', () => {
    for (const m of PERMISSION_REGISTRY) {
      expect(m.level).toBeGreaterThanOrEqual(1)
      expect(m.level).toBeLessThanOrEqual(3)
    }
  })

  it('MODULE_ORDER covers all 3 modules', () => {
    expect([...MODULE_ORDER].sort()).toEqual(['chatbot', 'service_requests', 'system'])
  })
})

describe('groupByModule', () => {
  it('partitions keys with the expected per-module counts', () => {
    const grouped = groupByModule(PERMISSION_REGISTRY)
    expect(grouped.service_requests).toHaveLength(4)
    expect(grouped.chatbot).toHaveLength(5)
    expect(grouped.system).toHaveLength(11)
  })

  it('preserves registry order within a module', () => {
    const grouped = groupByModule(PERMISSION_REGISTRY)
    expect(grouped.system.map((m) => m.key)).toEqual([
      'view_reports',
      'view_audit_log',
      'edit_settings',
      'image_resize',
      'manage_users',
      'manage_files',
      'edit_permission_settings',
      'access_admin_endpoints',
      'access_manager_endpoints',
      'access_staff_endpoints',
      'access_live_chat',
    ])
  })
})

describe('keysForLevel', () => {
  it('returns [] for level None', () => {
    expect(keysForLevel(PERMISSION_REGISTRY, 'system', LEVEL.NONE)).toEqual([])
  })

  it('system View → the four view-level keys', () => {
    expect(keysForLevel(PERMISSION_REGISTRY, 'system', LEVEL.VIEW)).toEqual([
      'view_reports',
      'view_audit_log',
      'access_staff_endpoints',
      'access_live_chat',
    ])
  })

  it('system Manage → all 11 system keys', () => {
    expect(keysForLevel(PERMISSION_REGISTRY, 'system', LEVEL.MANAGE)).toHaveLength(11)
  })

  it('chatbot View → [] (no view-level key exists)', () => {
    expect(keysForLevel(PERMISSION_REGISTRY, 'chatbot', LEVEL.VIEW)).toEqual([])
  })

  it('chatbot Edit → only export_chat', () => {
    expect(keysForLevel(PERMISSION_REGISTRY, 'chatbot', LEVEL.EDIT)).toEqual(['export_chat'])
  })

  it('chatbot Manage → all 5 chatbot keys', () => {
    expect(keysForLevel(PERMISSION_REGISTRY, 'chatbot', LEVEL.MANAGE)).toHaveLength(5)
  })
})

describe('availableLevels', () => {
  it('system offers View, Edit, Manage', () => {
    expect(availableLevels(PERMISSION_REGISTRY, 'system')).toEqual([1, 2, 3])
  })

  it('chatbot offers Edit, Manage only', () => {
    expect(availableLevels(PERMISSION_REGISTRY, 'chatbot')).toEqual([2, 3])
  })

  it('service_requests offers Edit, Manage only', () => {
    expect(availableLevels(PERMISSION_REGISTRY, 'service_requests')).toEqual([2, 3])
  })
})

describe('levelForKeys (reverse projection)', () => {
  it('empty set → None', () => {
    expect(levelForKeys(PERMISSION_REGISTRY, 'system', [])).toBe(LEVEL.NONE)
  })

  it('exact View set → View', () => {
    expect(
      levelForKeys(PERMISSION_REGISTRY, 'system', [
        'view_reports',
        'view_audit_log',
        'access_staff_endpoints',
        'access_live_chat',
      ]),
    ).toBe(LEVEL.VIEW)
  })

  it('exact Edit set → Edit', () => {
    const editKeys = keysForLevel(PERMISSION_REGISTRY, 'system', LEVEL.EDIT)
    expect(levelForKeys(PERMISSION_REGISTRY, 'system', editKeys)).toBe(LEVEL.EDIT)
  })

  it('all system keys → Manage', () => {
    const allKeys = keysForLevel(PERMISSION_REGISTRY, 'system', LEVEL.MANAGE)
    expect(levelForKeys(PERMISSION_REGISTRY, 'system', allKeys)).toBe(LEVEL.MANAGE)
  })

  it('partial set → custom', () => {
    expect(levelForKeys(PERMISSION_REGISTRY, 'system', ['view_reports', 'manage_users'])).toBe(
      'custom',
    )
  })

  it('chatbot manage key without export → custom', () => {
    expect(levelForKeys(PERMISSION_REGISTRY, 'chatbot', ['manage_broadcast'])).toBe('custom')
  })

  it('chatbot only export_chat → Edit', () => {
    expect(levelForKeys(PERMISSION_REGISTRY, 'chatbot', ['export_chat'])).toBe(LEVEL.EDIT)
  })

  it('ignores keys from other modules', () => {
    // view_reports belongs to `system`, not chatbot — should not affect the result.
    expect(levelForKeys(PERMISSION_REGISTRY, 'chatbot', ['view_reports'])).toBe(LEVEL.NONE)
  })
})
