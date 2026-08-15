'use client'

import { useEffect } from 'react'

const OVERLAY_ID = 'liff-boot-overlay'

/**
 * Runs during initial HTML parse — before the SSR'd landing page paints — so
 * the boot overlay covers the would-be flash of the hero section. Vanilla DOM
 * + inline styles because Tailwind is not available inside a raw script string.
 *
 * Per the LIFF boot UX report (research/codeX/line-liff-service-booking-
 * architecture-report.md §6-7): show a static splash first (brand mark +
 * short Thai label), and only start the spinner after ~250ms so a fast
 * liff.init() never produces a flickering animation.
 */
const OVERLAY_SCRIPT = `(function(){try{
if(!new URLSearchParams(window.location.search).has('liff.state'))return;
var k=document.createElement('style');
k.textContent='#${OVERLAY_ID} .liff-boot-ring{opacity:0;transition:opacity .15s}'
+'#${OVERLAY_ID}.liff-boot-late .liff-boot-ring{opacity:1}'
+'@keyframes liff-boot-spin{to{transform:rotate(360deg)}}';
document.head.appendChild(k);
var o=document.createElement('div');o.id='${OVERLAY_ID}';
o.style.cssText='position:fixed;inset:0;z-index:9999;background:#FAFAFA;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;';
var m=document.createElement('div');
m.style.cssText='width:48px;height:48px;border-radius:16px;background:linear-gradient(135deg,#172554,#3b82f6);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px;font-family:system-ui,sans-serif;';
m.textContent='JSK';
var t=document.createElement('div');
t.style.cssText='color:#475569;font-size:14px;font-family:system-ui,sans-serif;';
t.textContent='กำลังเปิดบริการ...';
var s=document.createElement('div');
s.className='liff-boot-ring';
s.style.cssText='margin-top:4px;width:24px;height:24px;border-radius:9999px;border:3px solid #dbeafe;border-top-color:#2563eb;animation:liff-boot-spin .8s linear infinite;';
o.appendChild(m);o.appendChild(t);o.appendChild(s);document.body.appendChild(o);
setTimeout(function(){o.className='liff-boot-late'},250);
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
 * page with the splash overlay; this effect removes it when the SDK takes
 * over, when boot is impossible, or when it has taken too long.
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
