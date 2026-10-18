"use client"

import Script from 'next/script'
import { preconnect } from 'react-dom'

function apiOrigin(): string | null {
    try {
        return new URL(process.env.NEXT_PUBLIC_API_URL ?? '').origin
    } catch {
        return null
    }
}

export default function LiffLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Open the API connection while the LIFF SDK initialises.
    const origin = apiOrigin()
    if (origin) preconnect(origin)
    return (
        <>
            <Script
                src="https://static.line-scdn.net/liff/edge/2/sdk.js"
                strategy="beforeInteractive"
            />
            {children}
        </>
    )
}
