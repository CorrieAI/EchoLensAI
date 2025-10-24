'use client'

import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'
import { ScrollToTop } from './scroll-to-top'
import { useSidebar } from './sidebar-context'
import { useAuth } from '@/contexts/auth-context'

export function LayoutContent({ children }: { children: ReactNode }) {
  const { sidebarWidth, isExpanded } = useSidebar()
  const { user, loading } = useAuth()
  const pathname = usePathname()

  // Check if current page is an auth page (login/register)
  const isAuthPage = pathname === '/login' || pathname === '/register'

  // Show sidebar and topbar only if user is authenticated and not on auth pages
  const showLayout = user && !isAuthPage

  return (
    <>
      <ScrollToTop />
      {showLayout && <TopBar />}
      {showLayout && <Sidebar />}
      <main
        className={showLayout ? "transition-all duration-300 pt-16" : ""}
        style={showLayout ? {
          marginLeft: isExpanded ? `${sidebarWidth}px` : '64px',
        } : {}}
      >
        {children}
      </main>
    </>
  )
}
