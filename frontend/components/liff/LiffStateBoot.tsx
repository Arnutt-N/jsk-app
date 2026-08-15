'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'

/**
 * Completes the LIFF primary→secondary redirect chain when the landing page
 * is reached with a pending `liff.state`.
 *
 * With the LIFF app endpoint set to the site root, a path-appended LIFF URL
 * (`https://liff.line.me/{liffId}/liff/booking`) first redirects to the
 * endpoint verbatim with the requested path stashed in `?liff.state=`. The
 * secondary redirect to the real page only happens if the receiving page runs
 * `liff.init()` — which the landing page normally never does. This component
 * boots the SDK only when `liff.state` is present, so regular visitors load
 * nothing extra and see the landing page unchanged.
 */
export function LiffStateBoot() {
  const [needsBoot, setNeedsBoot] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID
    if (params.has('liff.state') && liffId) {
      setNeedsBoot(true)
    }
  }, [])

  useEffect(() => {
    if (!needsBoot) return

    const timer = window.setInterval(() => {
      if (window.liff) {
        window.clearInterval(timer)
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID
        if (!liffId) return
        window.liff
          .init({ liffId })
          .catch(() => {
            // Leave the visitor on the landing page rather than surfacing
            // a LIFF error on a page that is not a LIFF screen.
          })
      }
    }, 100)
    const giveUp = window.setTimeout(() => window.clearInterval(timer), 10000)

    return () => {
      window.clearInterval(timer)
      window.clearTimeout(giveUp)
    }
  }, [needsBoot])

  if (!needsBoot) return null

  return <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" strategy="afterInteractive" />
}
