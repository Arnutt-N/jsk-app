import type { Metadata } from 'next'
import { Inter, Noto_Sans_Thai, Outfit } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'

const notoThai = Noto_Sans_Thai({
    subsets: ['thai', 'latin'],
    weight: ['300', '400', '500', '600', '700'],
    variable: '--font-noto-thai',
})

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
})

const outfit = Outfit({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700', '800', '900'],
    variable: '--font-outfit',
})

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
