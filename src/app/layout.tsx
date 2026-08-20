import type { Metadata, Viewport } from 'next'
import { Providers } from '@/components/providers'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'WHAPPI', template: '%s · WHAPPI' },
  description: 'Private one-to-one conversations that move at your pace.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#6657e8',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-[var(--font-body)]">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
