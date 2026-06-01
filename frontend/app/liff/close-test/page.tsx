'use client'

import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import Script from 'next/script'
import { CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { logger } from '@/lib/logger';

export default function CloseTestPage() {
    const [timeLeft, setTimeLeft] = useState(5)
    const [status, setStatus] = useState('Initializing...')
    const [liffError, setLiffError] = useState<string | null>(null)
    const [userAgent, setUserAgent] = useState('')

    useEffect(() => {
        setUserAgent(navigator.userAgent)
        const initLiff = async () => {
            try {
                const liffId = process.env.NEXT_PUBLIC_LIFF_ID
                if (!liffId) {
                    throw new Error('LIFF ID not found')
                }
                if (typeof window !== 'undefined' && window.liff) {
                    await window.liff.init({ liffId })
                    setStatus('LIFF Initialized (In Client: ' + window.liff.isInClient() + ')')
                } else {
                    setStatus('LIFF Not Found (External Browser?)')
                }
            } catch (e: unknown) {
                logger.error(e)
                setLiffError(e instanceof Error ? e.message : 'Unknown error')
                setStatus('LIFF Init Failed')
            }
        }
        initLiff()
    }, [])

    const handleClose = () => {
        const liff = window.liff
        try {
            if (liff?.isInClient()) {
                setStatus('Attempting LIFF Close...')
                liff.closeWindow()
            } else {
                setStatus('External Browser - Attempting Window Close & Deep Link...')
                // External browser fallback
                window.close()

                // Construct Deep Link to switch back to LINE App
                const liffId = process.env.NEXT_PUBLIC_LIFF_ID
                if (liffId) {
                    const liffUrl = `https://line.me/R/app/${liffId}`
                    window.location.href = liffUrl
                }
            }
        } catch (e: unknown) {
            logger.error('Close window failed:', e)
            setStatus(`Close Failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
        }
    }

    // Auto-close countdown
    useEffect(() => {
        if (timeLeft > 0) {
            const timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000)
            return () => clearTimeout(timer)
        } else {
            handleClose()
        }
    }, [timeLeft])

    return (
        <div className="min-h-screen bg-bg pb-20 font-sans p-4 flex items-center justify-center">
            <Head>
                <title>Test Close Window</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
            </Head>
            <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" strategy="beforeInteractive" />

            <Card glass className="max-w-sm w-full text-center py-8">
                <CardContent>
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="w-10 h-10 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">ทดสอบปิดหน้าต่าง</h2>

                    <div className="bg-gray-100 p-2 rounded mb-4 text-xs text-left font-mono break-all">
                        <p><strong>Status:</strong> {status}</p>
                        {liffError && <p className="text-red-500">Error: {liffError}</p>}
                        <p><strong>UA:</strong> {userAgent}</p>
                    </div>

                    <p className="text-gray-500 mb-8">
                        หน้านี้สร้างมาเพื่อทดสอบระบบ Auto-Close<br />
                        <span className="text-xs text-gray-400 mt-2 block">(ปิดหน้าต่างอัตโนมัติใน {timeLeft} วินาที)</span>
                    </p>

                    <Button
                        variant="primary"
                        className="w-full py-4 text-lg"
                        onClick={handleClose}
                    >
                        ปิดหน้าต่างทันที
                    </Button>

                    <p className="text-[10px] text-gray-400 mt-4 px-4 opacity-70">
                        หากหน้าต่างไม่ปิดอัตโนมัติ<br />ท่านสามารถปิดหน้านี้ได้ทันที
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
