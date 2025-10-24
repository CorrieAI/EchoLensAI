'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { api, ChatSession } from '@/lib/api'
import { useSidebar } from './sidebar-context'
import { ConfirmModal } from './confirm-modal'
import { useTaskMonitor } from '@/hooks/useTaskMonitor'

export function Sidebar() {
  const pathname = usePathname()
  const { sidebarWidth, setSidebarWidth, isExpanded, setIsExpanded, setRefreshChats } = useSidebar()
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [chatSearch, setChatSearch] = useState('')
  const [isResizing, setIsResizing] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<'top' | 'bottom'>('bottom')
  const [podcastCount, setPodcastCount] = useState(0)
  const [aiEnhancedCount, setAiEnhancedCount] = useState(0)
  const [activeTaskCount, setActiveTaskCount] = useState(0)
  const [showDeleteChatConfirm, setShowDeleteChatConfirm] = useState<string | null>(null)
  const [version, setVersion] = useState<string>('')
  const sidebarRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const closeMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Monitor tasks and trigger immediate updates when tasks complete
  useTaskMonitor({
    onTaskComplete: () => {
      loadCounts()
    }
  })

  const loadChatSessions = async () => {
    try {
      const sessions = await api.getChatSessions()
      // Sort by most recently updated (already sorted from backend, but ensure it)
      setChatSessions(sessions)
    } catch (error) {
      console.error('Failed to load chat sessions:', error)
    }
  }

  const loadCounts = async () => {
    try {
      const podcasts = await api.getPodcasts()
      setPodcastCount(podcasts.length)

      const aiCount = await api.getProcessedEpisodesCount()
      setAiEnhancedCount(aiCount)

      const tasks = await api.getTasks()
      setActiveTaskCount(tasks.active.length + tasks.queued.length)
    } catch (error) {
      console.error('Failed to load counts:', error)
    }
  }

  const loadVersion = async () => {
    try {
      const systemInfo = await api.getSystemInfo()
      setVersion(systemInfo.version)
    } catch (error) {
      console.error('Failed to load version:', error)
    }
  }

  useEffect(() => {
    loadChatSessions()
    loadCounts()
    loadVersion()
    const interval = setInterval(loadCounts, 5000) // Update counts every 5 seconds
    return () => clearInterval(interval)
  }, [])

  // Register the refresh function in the context
  useEffect(() => {
    setRefreshChats(() => loadChatSessions)
  }, [setRefreshChats])

  // Filter chat sessions based on search
  const filteredChatSessions = chatSessions.filter(session => {
    if (!chatSearch) return true
    const searchLower = chatSearch.toLowerCase()
    return (
      session.episode?.title.toLowerCase().includes(searchLower) ||
      session.episode?.podcast?.title.toLowerCase().includes(searchLower)
    )
  })

  // Group chats by time periods
  const groupChatsByTime = (sessions: ChatSession[]) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const groups = {
      today: [] as ChatSession[],
      last7Days: [] as ChatSession[],
      older: [] as ChatSession[]
    }

    sessions.forEach(session => {
      const sessionDate = new Date(session.updated_at)
      if (sessionDate >= today) {
        groups.today.push(session)
      } else if (sessionDate >= sevenDaysAgo) {
        groups.last7Days.push(session)
      } else {
        groups.older.push(session)
      }
    })

    return groups
  }

  const groupedChats = groupChatsByTime(filteredChatSessions)


  const handleDeleteChat = async () => {
    if (!showDeleteChatConfirm) return

    try {
      await fetch(`/api/proxy/api/chat/${showDeleteChatConfirm}`, {
        method: 'DELETE',
      })
      await loadChatSessions()
      setOpenMenuId(null)

      // Show success toast
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 flex items-center gap-3'
      toast.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <span>Chat deleted successfully</span>
      `
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
    } catch (error) {
      console.error('Failed to delete chat:', error)

      // Show error toast
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 flex items-center gap-3'
      toast.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
        <span>Failed to delete chat</span>
      `
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
    }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return

      const newWidth = e.clientX
      if (newWidth >= 192 && newWidth <= 480) { // min 12rem, max 30rem
        setSidebarWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  const navItems = [
    {
      href: '/',
      label: 'All Podcasts',
      count: podcastCount,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
        </svg>
      ),
    },
    {
      href: '/ai-enhanced',
      label: 'AI Enhanced',
      count: aiEnhancedCount,
      isGreen: true,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
      ),
    },
    {
      href: '/tasks',
      label: 'Process Status',
      count: activeTaskCount,
      showSpinner: activeTaskCount > 0,
      isGreen: true,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />
        </svg>
      ),
    },
  ] as const

  return (
    <>
    <div
      ref={sidebarRef}
      className="fixed left-0 top-16 bottom-0 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 transition-all duration-300"
      style={{ width: isExpanded ? `${sidebarWidth}px` : '64px' }}
    >
      <div className="flex flex-col h-full">

        {/* Navigation */}
        <nav className="p-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors ${
                pathname === item.href
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-800'
              }`}
            >
              {item.icon}
              {isExpanded && (
                <>
                  <span className="font-medium flex-1">{item.label}</span>
                  {'count' in item && item.count !== undefined && item.count > 0 && (
                    <span className="flex items-center gap-1">
                      {'showSpinner' in item && item.showSpinner ? (
                        <div className="relative">
                          <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          <svg className="w-4 h-4 absolute -top-0.5 -left-0.5 animate-spin text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" strokeWidth="2" strokeDasharray="60" strokeDashoffset="15" />
                          </svg>
                        </div>
                      ) : 'isGreen' in item && item.isGreen && (
                        <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      )}
                      <span className={`text-sm px-2 py-0.5 rounded-full ${'isGreen' in item && item.isGreen ? 'bg-green-600 dark:bg-green-500 text-white' : 'bg-blue-600 text-white'}`}>
                        {item.count}
                      </span>
                    </span>
                  )}
                </>
              )}
            </Link>
          ))}
        </nav>

        {/* Chat Sessions */}
        {isExpanded && (
          <div className="px-4 py-2 flex-1 flex flex-col overflow-hidden">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
              Recent Chats
            </h3>
            {chatSessions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center px-4 py-8">
                <div className="text-center text-gray-500 dark:text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-xs">No chats yet</p>
                  <p className="text-xs mt-1 opacity-75">Start a chat from an episode page</p>
                </div>
              </div>
            ) : (
              <>
            <input
              type="text"
              placeholder="Search chats..."
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              className="mb-2 px-2 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
            />
            <div
              className="overflow-y-auto flex-1 chat-scroll"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgb(156 163 175) transparent'
              }}
            >
              {/* Today */}
              {groupedChats.today.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 px-1">
                    Today
                  </div>
                  <div className="space-y-1">
                    {groupedChats.today.map((session) => (
                      <div
                        key={session.id}
                        className="group relative flex items-center"
                        onMouseLeave={() => {
                          // Delay closing to allow user to move mouse to menu
                          closeMenuTimeoutRef.current = setTimeout(() => {
                            setOpenMenuId(null)
                          }, 300)
                        }}
                        onMouseEnter={() => {
                          // Cancel close timeout if mouse comes back
                          if (closeMenuTimeoutRef.current) {
                            clearTimeout(closeMenuTimeoutRef.current)
                          }
                        }}
                      >
                        <Link
                          href={`/chat?session_id=${session.id}`}
                          className="flex-1 px-3 py-2 text-sm rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 min-w-0"
                          title={`${session.episode?.title || 'Chat Session'}${session.episode?.podcast ? `\n${session.episode.podcast.title}` : ''}`}
                        >
                          <div className="font-medium truncate">{session.episode?.title || 'Chat Session'}</div>
                          {session.episode?.podcast && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{session.episode.podcast.title}</div>
                          )}
                        </Link>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const button = e.currentTarget
                            const rect = button.getBoundingClientRect()
                            const windowHeight = window.innerHeight
                            const spaceBelow = windowHeight - rect.bottom
                            const spaceAbove = rect.top
                            if (spaceBelow < 100 && spaceAbove > spaceBelow) {
                              setMenuPosition('top')
                            } else {
                              setMenuPosition('bottom')
                            }
                            setOpenMenuId(openMenuId === session.id ? null : session.id)
                          }}
                          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                        >
                          <svg className="w-3 h-3 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 16 16">
                            <circle cx="8" cy="3" r="1.5"/>
                            <circle cx="8" cy="8" r="1.5"/>
                            <circle cx="8" cy="13" r="1.5"/>
                          </svg>
                        </button>
                        {openMenuId === session.id && (
                          <div
                            ref={menuRef}
                            className={`absolute right-0 w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 ${
                              menuPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
                            }`}
                          >
                            <button
                              onClick={() => setShowDeleteChatConfirm(session.id)}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 rounded-lg"
                            >
                              Delete Chat
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Last 7 Days */}
              {groupedChats.last7Days.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 px-1">
                    Last 7 Days
                  </div>
                  <div className="space-y-1">
                    {groupedChats.last7Days.map((session) => (
                      <div
                        key={session.id}
                        className="group relative flex items-center"
                        onMouseLeave={() => {
                          // Delay closing to allow user to move mouse to menu
                          closeMenuTimeoutRef.current = setTimeout(() => {
                            setOpenMenuId(null)
                          }, 300)
                        }}
                        onMouseEnter={() => {
                          // Cancel close timeout if mouse comes back
                          if (closeMenuTimeoutRef.current) {
                            clearTimeout(closeMenuTimeoutRef.current)
                          }
                        }}
                      >
                        <Link
                          href={`/chat?session_id=${session.id}`}
                          className="flex-1 px-3 py-2 text-sm rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 min-w-0"
                          title={`${session.episode?.title || 'Chat Session'}${session.episode?.podcast ? `\n${session.episode.podcast.title}` : ''}`}
                        >
                          <div className="font-medium truncate">{session.episode?.title || 'Chat Session'}</div>
                          {session.episode?.podcast && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{session.episode.podcast.title}</div>
                          )}
                        </Link>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const button = e.currentTarget
                            const rect = button.getBoundingClientRect()
                            const windowHeight = window.innerHeight
                            const spaceBelow = windowHeight - rect.bottom
                            const spaceAbove = rect.top
                            if (spaceBelow < 100 && spaceAbove > spaceBelow) {
                              setMenuPosition('top')
                            } else {
                              setMenuPosition('bottom')
                            }
                            setOpenMenuId(openMenuId === session.id ? null : session.id)
                          }}
                          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                        >
                          <svg className="w-3 h-3 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 16 16">
                            <circle cx="8" cy="3" r="1.5"/>
                            <circle cx="8" cy="8" r="1.5"/>
                            <circle cx="8" cy="13" r="1.5"/>
                          </svg>
                        </button>
                        {openMenuId === session.id && (
                          <div
                            ref={menuRef}
                            className={`absolute right-0 w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 ${
                              menuPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
                            }`}
                          >
                            <button
                              onClick={() => setShowDeleteChatConfirm(session.id)}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 rounded-lg"
                            >
                              Delete Chat
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Older */}
              {groupedChats.older.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 px-1">
                    Older
                  </div>
                  <div className="space-y-1">
                    {groupedChats.older.map((session) => (
                      <div
                        key={session.id}
                        className="group relative flex items-center"
                        onMouseLeave={() => {
                          // Delay closing to allow user to move mouse to menu
                          closeMenuTimeoutRef.current = setTimeout(() => {
                            setOpenMenuId(null)
                          }, 300)
                        }}
                        onMouseEnter={() => {
                          // Cancel close timeout if mouse comes back
                          if (closeMenuTimeoutRef.current) {
                            clearTimeout(closeMenuTimeoutRef.current)
                          }
                        }}
                      >
                        <Link
                          href={`/chat?session_id=${session.id}`}
                          className="flex-1 px-3 py-2 text-sm rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 min-w-0"
                          title={`${session.episode?.title || 'Chat Session'}${session.episode?.podcast ? `\n${session.episode.podcast.title}` : ''}`}
                        >
                          <div className="font-medium truncate">{session.episode?.title || 'Chat Session'}</div>
                          {session.episode?.podcast && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{session.episode.podcast.title}</div>
                          )}
                        </Link>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const button = e.currentTarget
                            const rect = button.getBoundingClientRect()
                            const windowHeight = window.innerHeight
                            const spaceBelow = windowHeight - rect.bottom
                            const spaceAbove = rect.top
                            if (spaceBelow < 100 && spaceAbove > spaceBelow) {
                              setMenuPosition('top')
                            } else {
                              setMenuPosition('bottom')
                            }
                            setOpenMenuId(openMenuId === session.id ? null : session.id)
                          }}
                          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                        >
                          <svg className="w-3 h-3 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 16 16">
                            <circle cx="8" cy="3" r="1.5"/>
                            <circle cx="8" cy="8" r="1.5"/>
                            <circle cx="8" cy="13" r="1.5"/>
                          </svg>
                        </button>
                        {openMenuId === session.id && (
                          <div
                            ref={menuRef}
                            className={`absolute right-0 w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 ${
                              menuPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
                            }`}
                          >
                            <button
                              onClick={() => setShowDeleteChatConfirm(session.id)}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 rounded-lg"
                            >
                              Delete Chat
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
              </>
            )}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1"></div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          {isExpanded && (
            <div className="text-xs text-gray-600 dark:text-gray-400 text-center space-y-1">
              <div>
                © 2025 EchoLensAI by{' '}
                <a
                  href="https://corrie.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  CorrieAI
                </a>
              </div>
              <div className="flex gap-2 justify-center">
                <a
                  href="https://echolensai.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Website
                </a>
                <span>•</span>
                <a
                  href="https://docs.echolensai.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Docs
                </a>
                <span>•</span>
                <a
                  href="https://github.com/CorrieAI/EchoLensAI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  GitHub
                </a>
              </div>
              {version && (
                <div className="text-gray-500 dark:text-gray-500">
                  v{version}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Resize Handle */}
      {isExpanded && (
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 transition-colors"
          onMouseDown={() => setIsResizing(true)}
          style={{ userSelect: 'none' }}
        />
      )}
    </div>

    {/* Delete Chat Confirmation Modal */}
    <ConfirmModal
      isOpen={!!showDeleteChatConfirm}
      onClose={() => setShowDeleteChatConfirm(null)}
      onConfirm={handleDeleteChat}
      title="Delete Chat"
      message="Are you sure you want to delete this chat? All messages will be permanently removed. This action cannot be undone."
      confirmText="Delete Chat"
      cancelText="Cancel"
      type="danger"
    />
    </>
  )
}
