import type { Metadata, Viewport } from 'next'
import { Inter, Noto_Sans_Thai, Outfit } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'

const notoThai = Noto_Sans_Thai({
    subsets: ['thai', 'latin'],
    weight: ['400', '500', '700'],
    variable: '--font-noto-thai',
    display: 'swap',
    preload: true,
    fallback: ['system-ui', 'sans-serif'],
})

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
    display: 'swap',
    preload: true,
    fallback: ['system-ui', 'sans-serif'],
})

const outfit = Outfit({
    subsets: ['latin'],
    weight: ['500', '700', '900'],
    variable: '--font-outfit',
    display: 'swap',
    preload: true,
    fallback: ['system-ui', 'sans-serif'],
})

export const viewport: Viewport = {
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#FAFAFA' },
        { media: '(prefers-color-scheme: dark)', color: '#020617' },
    ],
    width: 'device-width',
    initialScale: 1,
}

export const metadata: Metadata = {
    title: 'JSK Platform | Community Justice Services',
    description: 'Public service operations platform for LINE Official Account and citizen service workflows.',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="th" suppressHydrationWarning className={`${notoThai.variable} ${inter.variable} ${outfit.variable}`}>
            <body suppressHydrationWarning className="font-sans antialiased">
                <Providers>
                    {children}
                </Providers>
            </body>
        </html>
    )
}
