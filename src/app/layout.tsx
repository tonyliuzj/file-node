import './globals.css'
import NavBar from './nav-bar'
import { Suspense } from 'react'
import { ThemeProvider } from 'next-themes'
import { Inter } from 'next/font/google'
import { cn } from '@/lib/utils'

const inter = Inter({ subsets: ['latin'], variable: "--font-sans" })

export const metadata = {
  title: 'File Node',
  description: 'Self-hosted indexed file explorer',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <link rel="preload" href="/pdf.worker.min.js" as="script" />
      </head>
      <body className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable
        )}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Suspense fallback={null}>
            <NavBar />
          </Suspense>
          <main className="pt-14">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  )
}
