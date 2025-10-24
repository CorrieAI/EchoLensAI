'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface SidebarContextType {
  sidebarWidth: number
  setSidebarWidth: (width: number) => void
  isExpanded: boolean
  setIsExpanded: (expanded: boolean) => void
  refreshChats: () => void
  setRefreshChats: (fn: () => void) => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(256) // 16rem in pixels
  const [isExpanded, setIsExpanded] = useState(true)
  const [refreshChats, setRefreshChats] = useState<() => void>(() => () => {})

  return (
    <SidebarContext.Provider value={{ sidebarWidth, setSidebarWidth, isExpanded, setIsExpanded, refreshChats, setRefreshChats }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}
