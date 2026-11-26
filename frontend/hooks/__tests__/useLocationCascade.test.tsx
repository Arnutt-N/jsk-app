// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { useLocationCascade } from '@/hooks/useLocationCascade'
import type { District, Province, SubDistrict } from '@/types/location'

const mocks = vi.hoisted(() => ({
  fetchDistricts: vi.fn(),
  fetchSubDistricts: vi.fn(),
}))

vi.mock('@/lib/liff/location-cascade', () => ({
  fetchDistricts: mocks.fetchDistricts,
  fetchSubDistricts: mocks.fetchSubDistricts,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

const provinces: Province[] = [
  { PROVINCE_ID: 1, PROVINCE_THAI: 'A', PROVINCE_ENGLISH: 'A' },
  { PROVINCE_ID: 2, PROVINCE_THAI: 'B', PROVINCE_ENGLISH: 'B' },
]
const district = (id: number): District => ({
  DISTRICT_ID: id, PROVINCE_ID: 1, DISTRICT_THAI: `D${id}`, DISTRICT_ENGLISH: `D${id}`,
})
const subdistrict = (id: number): SubDistrict => ({
  SUB_DISTRICT_ID: id, DISTRICT_ID: 1, SUB_DISTRICT_THAI: `S${id}`,
  SUB_DISTRICT_ENGLISH: `S${id}`, POSTAL_CODE: '00000',
})

function Harness(): ReactNode {
  const state = useLocationCascade(() => {})
  return (
    <div>
      <button onClick={() => { void state.selectProvince('1', provinces) }}>province-1</button>
      <button onClick={() => { void state.selectProvince('2', provinces) }}>province-2</button>
      <button onClick={() => { void state.selectProvince('', provinces) }}>province-clear</button>
      <button onClick={() => { void state.selectDistrict('1', [district(1)]) }}>district-1</button>
      <button onClick={() => { void state.selectDistrict('', [district(1)]) }}>district-clear</button>
      <button onClick={state.reset}>reset</button>
      <span data-testid="districts">{state.districts.map((d) => d.DISTRICT_THAI).join(',')}</span>
      <span data-testid="subdistricts">{state.subDistricts.map((s) => s.SUB_DISTRICT_THAI).join(',')}</span>
      <span data-testid="loading-districts">{String(state.loadingDistricts)}</span>
      <span data-testid="loading-subdistricts">{String(state.loadingSubDistricts)}</span>
    </div>
  )
}

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

describe('useLocationCascade stale responses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchDistricts.mockResolvedValue([])
    mocks.fetchSubDistricts.mockResolvedValue([])
  })

  it('ignores stale district results after a province change', async () => {
    const oldReq = deferred<District[]>()
    const newReq = deferred<District[]>()
    mocks.fetchDistricts.mockImplementation((id: number) => id === 1 ? oldReq.promise : newReq.promise)
    render(<Harness />)

    click('province-1')
    click('province-2')

    await act(async () => {
      newReq.resolve([district(20)])
      await newReq.promise
    })
    expect(screen.getByTestId('districts').textContent).toBe('D20')

    await act(async () => {
      oldReq.resolve([district(10)])
      await oldReq.promise
    })
    expect(screen.getByTestId('districts').textContent).toBe('D20')
    expect(screen.getByTestId('loading-districts').textContent).toBe('false')
  })

  it('invalidates pending subdistrict options when province changes', async () => {
    const pending = deferred<SubDistrict[]>()
    mocks.fetchSubDistricts.mockReturnValue(pending.promise)
    render(<Harness />)

    click('district-1')
    click('province-2')

    await act(async () => {
      pending.resolve([subdistrict(1)])
      await pending.promise
    })
    expect(screen.getByTestId('subdistricts').textContent).toBe('')
    expect(screen.getByTestId('loading-subdistricts').textContent).toBe('false')
  })

  it('clear resets loading state while a fetch is pending', async () => {
    const pending = deferred<District[]>()
    mocks.fetchDistricts.mockReturnValue(pending.promise)
    render(<Harness />)

    click('province-1')
    click('reset')

    await act(async () => {
      pending.resolve([district(10)])
      await pending.promise
    })
    expect(screen.getByTestId('districts').textContent).toBe('')
    expect(screen.getByTestId('loading-districts').textContent).toBe('false')
  })

  it('invalidates district request when province selection is cleared', async () => {
    const pending = deferred<District[]>()
    mocks.fetchDistricts.mockReturnValue(pending.promise)
    render(<Harness />)

    click('province-1')
    click('province-clear')

    await act(async () => {
      pending.resolve([district(10)])
      await pending.promise
    })
    expect(screen.getByTestId('districts').textContent).toBe('')
    expect(screen.getByTestId('loading-districts').textContent).toBe('false')
  })

  it('invalidates subdistrict request when district selection is cleared', async () => {
    const pending = deferred<SubDistrict[]>()
    mocks.fetchSubDistricts.mockReturnValue(pending.promise)
    render(<Harness />)

    click('district-1')
    click('district-clear')

    await act(async () => {
      pending.resolve([subdistrict(1)])
      await pending.promise
    })
    expect(screen.getByTestId('subdistricts').textContent).toBe('')
    expect(screen.getByTestId('loading-subdistricts').textContent).toBe('false')
  })
})
