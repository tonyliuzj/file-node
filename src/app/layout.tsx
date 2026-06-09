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
          <div className="flex min-h-screen flex-col">
            <Suspense fallback={null}>
              <NavBar />
            </Suspense>
            <main className="flex-1 pt-14">{children}</main>
            <footer className="border-t bg-background">
              <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-4 text-sm text-muted-foreground md:px-6">
                Powered by&nbsp;
                <a
                  href="https://github.com/tonyliuzj/file-node/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  File Node
                </a>
              </div>
            </footer>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
