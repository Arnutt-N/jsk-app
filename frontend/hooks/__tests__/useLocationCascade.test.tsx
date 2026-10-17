// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { District } from '../../types/location'

import { useLocationCascade } from '../useLocationCascade'

vi.mock('@/lib/liff/location-cascade', () => ({
  fetchDistricts: vi.fn(),
  fetchSubDistricts: vi.fn(),
}))

import { fetchDistricts, fetchSubDistricts } from '@/lib/liff/location-cascade'

const PROVINCES = [
  { PROVINCE_ID: 1, PROVINCE_THAI: 'ก', PROVINCE_ENGLISH: 'K' },
  { PROVINCE_ID: 2, PROVINCE_THAI: 'ข', PROVINCE_ENGLISH: 'Kh' },
]

const DISTRICTS = [{ DISTRICT_ID: 10, DISTRICT_THAI: 'อ', PROVINCE_ID: 1 }]
const SUBS = [{ SUB_DISTRICT_ID: 100, SUB_DISTRICT_THAI: 'ต', DISTRICT_ID: 10 }]

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useLocationCascade', () => {
  it('maps ids to Thai names and loads the next level', async () => {
    vi.mocked(fetchDistricts).mockResolvedValueOnce(DISTRICTS as never)
    vi.mocked(fetchSubDistricts).mockResolvedValueOnce(SUBS as never)
    const onSelectionChange = vi.fn()
    const { result } = renderHook(() => useLocationCascade(onSelectionChange))

    await act(async () => {
      await result.current.selectProvince('1', PROVINCES as never)
    })
    expect(onSelectionChange).toHaveBeenCalledWith({
      province: 'ก',
      district: '',
      sub_district: '',
    })
    expect(result.current.districts).toEqual(DISTRICTS)
    expect(result.current.selectedProvinceId).toBe(1)

    await act(async () => {
      await result.current.selectDistrict('10', DISTRICTS as never)
    })
    expect(onSelectionChange).toHaveBeenCalledWith({ district: 'อ', sub_district: '' })
    expect(result.current.subDistricts).toEqual(SUBS)

    act(() => {
      result.current.selectSubDistrict('100', SUBS as never)
    })
    expect(onSelectionChange).toHaveBeenCalledWith({ sub_district: 'ต' })
  })

  it('drops a stale province response when the citizen switches fast', async () => {
    let resolveSlow!: (v: District[]) => void
    vi.mocked(fetchDistricts).mockImplementationOnce(
      () => new Promise<District[]>((resolve) => (resolveSlow = resolve)),
    )
    vi.mocked(fetchDistricts).mockResolvedValueOnce([{ DISTRICT_ID: 20 }] as never)
    const { result } = renderHook(() => useLocationCascade(vi.fn()))

    let first!: Promise<void>
    await act(async () => {
      first = result.current.selectProvince('1', PROVINCES as never)
      await result.current.selectProvince('2', PROVINCES as never)
    })
    await act(async () => {
      resolveSlow([])
      await first
    })
    await waitFor(() => expect(result.current.loadingDistricts).toBe(false))
    expect(result.current.districts).toEqual([{ DISTRICT_ID: 20 }])
  })

  it('reset clears ids, lists, and spinners', async () => {
    vi.mocked(fetchDistricts).mockResolvedValueOnce(DISTRICTS as never)
    const { result } = renderHook(() => useLocationCascade(vi.fn()))

    await act(async () => {
      await result.current.selectProvince('1', PROVINCES as never)
    })
    act(() => {
      result.current.reset()
    })
    expect(result.current.selectedProvinceId).toBeNull()
    expect(result.current.districts).toEqual([])
    expect(result.current.subDistricts).toEqual([])
  })
})
