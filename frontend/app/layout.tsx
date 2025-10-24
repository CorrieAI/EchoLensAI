import type { Metadata } from 'next'
import './globals.css'
import { SidebarProvider } from '@/components/sidebar-context'
import { AuthProvider } from '@/contexts/auth-context'
import { LayoutContent } from '@/components/layout-content'

export const metadata: Metadata = {
  title: 'EchoLens',
  description: 'Bring Your Podcasts Into Focus',
  icons: {
    icon: '/favicon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('theme');
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (theme === 'dark' || (!theme && prefersDark)) {
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <AuthProvider>
          <SidebarProvider>
            <LayoutContent>{children}</LayoutContent>
          </SidebarProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
