import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useLiffInit, type LiffSdk } from '../useLiffInit'

/**
 * Behavior tests for useLiffInit.
 *
 * The hook wraps every LIFF bootstrap concern shared by the three form pages:
 * init with the configured LIFF ID, login redirect vs. silent skip, profile +
 * ID-token fetch, in-LINE detection (with an error-path re-detection fallback),
 * and surfacing failures through `liffError` / `onError`. Everything finishes
 * with `initDone = true`, success or not — that gate unlocks request-v2's UI.
 *
 * Only the hook's public surface is observed. The SDK is represented by a
 * structural `LiffSdk` double created fresh per test; expected messages below
 * are copied literals from `useLiffInit.ts` itself.
 */

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { logger } from '@/lib/logger'

const TEST_LIFF_ID = 'test-liff-id'
const EXPECTED_MISSING_ID_MESSAGE =
  'LIFF ID is not specified in environment variables.'
const EXPECTED_SDK_MISSING_WARNING =
  'LIFF SDK not found. Running in browser mode?'

/** Fresh LiffSdk double per test; overrides win over the safe defaults. */
function createMockLiff(overrides: Partial<LiffSdk> = {}): LiffSdk {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    isLoggedIn: vi.fn().mockReturnValue(true),
    isInClient: vi.fn().mockReturnValue(true),
    login: vi.fn(),
    getProfile: vi.fn().mockResolvedValue({ userId: 'U123abc' }),
    getIDToken: vi.fn().mockReturnValue('id-token-xyz'),
    ...overrides,
  }
}

const ORIGINAL_LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID

beforeEach(() => {
  process.env.NEXT_PUBLIC_LIFF_ID = TEST_LIFF_ID
  vi.clearAllMocks()
})

afterEach(() => {
  if (ORIGINAL_LIFF_ID === undefined) {
    delete process.env.NEXT_PUBLIC_LIFF_ID
  } else {
    process.env.NEXT_PUBLIC_LIFF_ID = ORIGINAL_LIFF_ID
  }
  vi.restoreAllMocks()
})

describe('useLiffInit', () => {
  it('happy path: initializes, stores profile + idToken, and completes', async () => {
    // Arrange
    const liff = createMockLiff()
    const onError = vi.fn()

    // Act
    const { result } = renderHook(() =>
      useLiffInit({ getLiff: () => liff, onError })
    )
    await waitFor(() => expect(result.current.initDone).toBe(true))

    // Assert
    expect(liff.init).toHaveBeenCalledTimes(1)
    expect(liff.init).toHaveBeenCalledWith({ liffId: TEST_LIFF_ID })
    expect(result.current.profile).toEqual({ userId: 'U123abc' })
    expect(result.current.idToken).toBe('id-token-xyz')
    expect(result.current.isInLineApp).toBe(false) // trackInLineApp defaults off
    expect(result.current.liffError).toBeNull()
    expect(liff.login).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('trackInLineApp maps isInClient() into isInLineApp; setter overrides it', async () => {
    // Arrange — service-request wizard tracks LINE context for auto-close
    const liff = createMockLiff({ isInClient: vi.fn().mockReturnValue(true) })
    const { result } = renderHook(() =>
      useLiffInit({ getLiff: () => liff, trackInLineApp: true })
    )
    await waitFor(() => expect(result.current.initDone).toBe(true))

    // Assert — detection landed
    expect(liff.isInClient).toHaveBeenCalledTimes(1)
    expect(result.current.isInLineApp).toBe(true)

    // Pages may re-sync the flag themselves (e.g. late liff-ready events)
    act(() => {
      result.current.setIsInLineApp(false)
    })
    expect(result.current.isInLineApp).toBe(false)
  })

  it('redirectLogin (default): triggers login() and skips profile fetch', async () => {
    // Arrange — wizard usage redirects outsiders to LINE login
    const liff = createMockLiff({ isLoggedIn: vi.fn().mockReturnValue(false) })
    const { result } = renderHook(() =>
      useLiffInit({ getLiff: () => liff })
    )
    await waitFor(() => expect(result.current.initDone).toBe(true))

    // Assert
    expect(liff.login).toHaveBeenCalledTimes(1)
    expect(liff.getProfile).not.toHaveBeenCalled()
    expect(result.current.profile).toBeNull()
    expect(result.current.idToken).toBeNull()
    expect(result.current.liffError).toBeNull()
  })

  it('redirectLogin=false: skips silently without login()', async () => {
    // Arrange — service-request-single opens read-only outside login flows
    const liff = createMockLiff({ isLoggedIn: vi.fn().mockReturnValue(false) })
    const { result } = renderHook(() =>
      useLiffInit({ getLiff: () => liff, redirectLogin: false })
    )
    await waitFor(() => expect(result.current.initDone).toBe(true))

    // Assert
    expect(liff.login).not.toHaveBeenCalled()
    expect(result.current.profile).toBeNull()
    expect(result.current.liffError).toBeNull()
  })

  it('missing LIFF ID surfaces an error via liffError + onError (requireLiffId)', async () => {
    // Arrange — no NEXT_PUBLIC_LIFF_ID configured anywhere
    delete process.env.NEXT_PUBLIC_LIFF_ID
    const liff = createMockLiff()
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useLiffInit({ getLiff: () => liff, onError })
    )
    await waitFor(() => expect(result.current.initDone).toBe(true))

    // Assert — exact misconfiguration message, SDK never touched
    expect(liff.init).not.toHaveBeenCalled()
    expect(result.current.liffError).toBeInstanceOf(Error)
    expect((result.current.liffError as Error).message).toBe(
      EXPECTED_MISSING_ID_MESSAGE
    )
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(result.current.liffError)
  })

  it('missing LIFF ID with requireLiffId=false skips quietly', async () => {
    // Arrange — single page tolerates browser-mode rendering
    delete process.env.NEXT_PUBLIC_LIFF_ID
    const getLiff = vi.fn<() => LiffSdk | null>().mockReturnValue(createMockLiff())
    const { result } = renderHook(() =>
      useLiffInit({ getLiff, requireLiffId: false, redirectLogin: false })
    )
    await waitFor(() => expect(result.current.initDone).toBe(true))

    // Assert — bail-out happens before the SDK is even requested
    expect(getLiff).not.toHaveBeenCalled()
    expect(result.current.liffError).toBeNull()
  })

  it('warns exactly the browser-mode hint when SDK is absent and warnWhenSdkMissing=true', async () => {
    // Arrange — request-v2 asks for a hint that the script tag never loaded
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const getLiff = vi.fn<() => LiffSdk | null>().mockReturnValue(null)
    const { result } = renderHook(() =>
      useLiffInit({ getLiff, warnWhenSdkMissing: true })
    )
    await waitFor(() => expect(result.current.initDone).toBe(true))

    // Assert
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(EXPECTED_SDK_MISSING_WARNING)
    expect(result.current.liffError).toBeNull()
  })

  it('stays silent about a missing SDK by default', async () => {
    // Arrange — bundled-import page relies on liffError alone
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const getLiff = vi.fn<() => LiffSdk | null>().mockReturnValue(null)
    const { result } = renderHook(() => useLiffInit({ getLiff }))
    await waitFor(() => expect(result.current.initDone).toBe(true))

    // Assert
    expect(warnSpy).not.toHaveBeenCalled()
    expect(result.current.liffError).toBeNull()
  })

  it('init rejection: records liffError, notifies onError, logs via logger', async () => {
    // Arrange
    const boom = new Error('network hiccup')
    const liff = createMockLiff({ init: vi.fn().mockRejectedValue(boom) })
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useLiffInit({ getLiff: () => liff, onError })
    )
    await waitFor(() => expect(result.current.initDone).toBe(true))

    // Assert — same thrown object reaches both consumers
    expect(result.current.liffError).toBe(boom)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(boom)
    expect(logger.error).toHaveBeenCalled()
    expect(liff.isLoggedIn).not.toHaveBeenCalled() // flow aborted before login check
  })

  it('fallback re-detection: failed init still detects the LINE client', async () => {
    // Arrange — mobile user whose init hiccupped must still auto-close;
    // the hook retries isInClient() through getLiff() on the error path.
    const boom = new Error('flaky init')
    const liff = createMockLiff({
      init: vi.fn().mockRejectedValue(boom),
      isInClient: vi.fn().mockReturnValue(true),
    })
    const { result } = renderHook(() =>
      useLiffInit({ getLiff: () => liff, trackInLineApp: true })
    )
    await waitFor(() => expect(result.current.initDone).toBe(true))

    // Assert
    expect(result.current.liffError).toBe(boom)
    expect(result.current.isInLineApp).toBe(true)
    expect(liff.isInClient).toHaveBeenCalled()
  })

  it('fallback re-detection survives isInClient() throwing during init failure', async () => {
    // Arrange — SDK present but unusable outside LINE
    const boom = new Error('flaky init')
    const liff = createMockLiff({
      init: vi.fn().mockRejectedValue(boom),
      isInClient: vi.fn().mockImplementation(() => {
        throw new Error('client exploded')
      }),
    })
    const { result } = renderHook(() =>
      useLiffInit({ getLiff: () => liff, trackInLineApp: true })
    )
    await waitFor(() => expect(result.current.initDone).toBe(true))

    // Assert — inner failure swallowed; original init error kept intact
    expect(result.current.isInLineApp).toBe(false)
    expect(result.current.liffError).toBe(boom)
  })

  it('getIDToken throwing loses the token but keeps profile and success state', async () => {
    // Arrange
    const liff = createMockLiff({
      getIDToken: vi.fn().mockImplementation(() => {
        throw new Error('token endpoint unavailable')
      }),
    })
    const { result } = renderHook(() =>
      useLiffInit({ getLiff: () => liff })
    )
    await waitFor(() => expect(result.current.initDone).toBe(true))

    // Assert — submission proceeds with profile; idToken header omitted
    expect(result.current.profile).toEqual({ userId: 'U123abc' })
    expect(result.current.idToken).toBeNull()
    expect(result.current.liffError).toBeNull()
    expect(logger.error).toHaveBeenCalled()
  })

  it('holds initDone=false while init is in flight (loading gate stays closed)', async () => {
    // Arrange — park init() on an unresolved promise so we can observe the
    // mid-flight state; request-v2 renders its loader behind !initDone.
    let resolveInit!: () => void
    const gated = new Promise<void>((res) => {
      resolveInit = res
    })
    const liff = createMockLiff({ init: vi.fn().mockReturnValue(gated) })

    // Act / Assert — effects ran synchronously on mount but no microtask has
    // flushed yet: the gate must still be closed and nothing else resolved.
    const { result } = renderHook(() => useLiffInit({ getLiff: () => liff }))
    expect(result.current.initDone).toBe(false)
    expect(liff.init).toHaveBeenCalledTimes(1)
    expect(result.current.profile).toBeNull()

    // Release the flow — completion flips the gate exactly once more.
    await act(async () => {
      resolveInit()
    })
    await waitFor(() => expect(result.current.initDone).toBe(true))
    expect(result.current.profile).toEqual({ userId: 'U123abc' })
  })
})
