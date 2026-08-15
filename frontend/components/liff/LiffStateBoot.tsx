'use client'

import { useEffect } from 'react'

const OVERLAY_ID = 'liff-boot-overlay'

/**
 * Runs during initial HTML parse — before the SSR'd landing page paints — so
 * the boot overlay covers the would-be flash of the hero section. Vanilla DOM
 * + inline styles because Tailwind is not available inside a raw script string.
 */
const OVERLAY_SCRIPT = `(function(){try{
if(!new URLSearchParams(window.location.search).has('liff.state'))return;
var k=document.createElement('style');
k.textContent='@keyframes liff-boot-spin{to{transform:rotate(360deg)}}';
document.head.appendChild(k);
var o=document.createElement('div');o.id='${OVERLAY_ID}';
o.style.cssText='position:fixed;inset:0;z-index:9999;background:#FAFAFA;display:flex;align-items:center;justify-content:center;';
var s=document.createElement('div');
s.style.cssText='width:40px;height:40px;border-radius:9999px;border:3px solid #dbeafe;border-top-color:#2563eb;animation:liff-boot-spin .8s linear infinite;';
o.appendChild(s);document.body.appendChild(o);
setTimeout(function(){var e=document.getElementById('${OVERLAY_ID}');
if(e&&!e.hasAttribute('data-claimed'))e.remove();},8000);
}catch(e){}})();`

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
 *
 * While the boot is in flight, the inline script above has already covered the
 * page with a branded spinner overlay; this effect removes it when the SDK
 * takes over, when boot is impossible, or when it has taken too long.
 */
export function LiffStateBoot() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID
    const overlay = document.getElementById(OVERLAY_ID)

    if (!params.has('liff.state') || !liffId) {
      // The inline script cannot see the env var; if it showed the overlay
      // but there is no liffId to boot with, reveal the landing page.
      overlay?.remove()
      return
    }

    overlay?.setAttribute('data-claimed', '1')
    const done = () => overlay?.remove()

    const script = document.createElement('script')
    script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js'
    script.async = true
    document.head.appendChild(script)

    const timer = window.setInterval(() => {
      if (!window.liff) return
      window.clearInterval(timer)
      window.liff
        .init({ liffId })
        .catch(() => {})
        .finally(done)
    }, 100)
    const giveUp = window.setTimeout(() => {
      window.clearInterval(timer)
      done()
    }, 10000)

    return () => {
      window.clearInterval(timer)
      window.clearTimeout(giveUp)
      script.remove()
    }
  }, [])

  return <script dangerouslySetInnerHTML={{ __html: OVERLAY_SCRIPT }} />
}
