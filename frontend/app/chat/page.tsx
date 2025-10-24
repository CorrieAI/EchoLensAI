'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api, ChatMessage, Episode } from '@/lib/api'
import { Markdown } from '@/components/markdown'
import { useSidebar } from '@/components/sidebar-context'

function ChatPageContent() {
  const searchParams = useSearchParams()
  const episodeIdFromUrl = searchParams.get('episode_id')
  const sessionId = searchParams.get('session_id')
  const queryParam = searchParams.get('q')
  const { refreshChats } = useSidebar()

  const [episode, setEpisode] = useState<Episode | null>(null)
  const [episodeId, setEpisodeId] = useState<string | null>(episodeIdFromUrl)
  const [podcastTitle, setPodcastTitle] = useState<string>('')
  const [podcastImage, setPodcastImage] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionId)
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null)
  const [editedContent, setEditedContent] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Clear podcast image and title when switching sessions/episodes to prevent stale data
    setPodcastImage('')
    setPodcastTitle('')
    setEpisode(null)

    if (sessionId) {
      loadChatSession()
    } else if (episodeIdFromUrl) {
      setEpisodeId(episodeIdFromUrl)
      loadEpisode(episodeIdFromUrl)
    }
  }, [sessionId, episodeIdFromUrl])

  // Pre-populate input with query parameter
  useEffect(() => {
    if (queryParam) {
      setInputMessage(queryParam)
    }
  }, [queryParam])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const loadEpisode = async (epId?: string) => {
    const idToUse = epId || episodeId
    if (!idToUse) return
    try {
      const data = await api.getEpisode(idToUse)
      setEpisode(data)
      // Also get podcast info
      const podcast = await api.getPodcast(data.podcast_id)
      setPodcastTitle(podcast.title)
      setPodcastImage(podcast.image_url || '')
    } catch (error) {
      console.error('Failed to load episode:', error)
    }
  }

  const loadChatSession = async () => {
    if (!sessionId) return
    try {
      const data = await api.getChatSession(sessionId)
      setMessages(data.messages)
      setCurrentSessionId(sessionId)

      // Always fetch full episode data to ensure we have podcast info
      if (data.session.episode_id) {
        const fullEpisode = await api.getEpisode(data.session.episode_id)
        setEpisode(fullEpisode)
        setEpisodeId(data.session.episode_id)

        // Fetch podcast data for image and title
        if (fullEpisode.podcast_id) {
          const podcast = await api.getPodcast(fullEpisode.podcast_id)
          setPodcastTitle(podcast.title)
          setPodcastImage(podcast.image_url || '')
        }
      } else {
        setEpisode(null)
      }
    } catch (error) {
      console.error('Failed to load chat session:', error)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content)
    // Show a brief toast notification
    const toast = document.createElement('div')
    toast.className = 'fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg z-50'
    toast.textContent = 'Copied to clipboard'
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 2000)
  }

  const handleCopyAllChat = () => {
    // Format all messages as a readable text conversation
    const chatText = messages
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n')

    navigator.clipboard.writeText(chatText)

    // Show toast notification
    const toast = document.createElement('div')
    toast.className = 'fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg z-50'
    toast.textContent = 'Entire chat copied to clipboard'
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 2000)
  }

  const handleEditMessage = (idx: number, content: string) => {
    setEditingMessageIndex(idx)
    setEditedContent(content)
  }

  const handleCancelEdit = () => {
    setEditingMessageIndex(null)
    setEditedContent('')
  }

  const handleSaveEdit = async (idx: number) => {
    if (!editedContent.trim() || !episodeId) return

    // Remove all messages after the edited message
    const updatedMessages = messages.slice(0, idx)
    setMessages(updatedMessages)
    setEditingMessageIndex(null)

    // Send the edited message
    const userMessage = editedContent
    setEditedContent('')
    setMessages((prev) => [
      ...prev,
      { id: '', session_id: currentSessionId || '', role: 'user', content: userMessage, created_at: new Date().toISOString() },
    ])
    setLoading(true)

    try {
      const response = await api.sendChatMessage(episodeId, userMessage, currentSessionId || undefined)
      setCurrentSessionId(response.session_id)
      setMessages((prev) => [
        ...prev,
        {
          id: '',
          session_id: response.session_id,
          role: 'assistant',
          content: response.response,
          created_at: new Date().toISOString(),
        },
      ])
      // Refresh sidebar chat list
      refreshChats()
    } catch (error) {
      console.error('Failed to send message:', error)
      setMessages((prev) => [
        ...prev,
        {
          id: '',
          session_id: currentSessionId || '',
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          created_at: new Date().toISOString(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    if (!inputMessage.trim() || !episodeId) return

    const userMessage = inputMessage
    setInputMessage('')
    setMessages((prev) => [
      ...prev,
      { id: '', session_id: currentSessionId || '', role: 'user', content: userMessage, created_at: new Date().toISOString() },
    ])
    setLoading(true)

    try {
      const response = await api.sendChatMessage(episodeId, userMessage, currentSessionId || undefined)
      setCurrentSessionId(response.session_id)
      setMessages((prev) => [
        ...prev,
        {
          id: '',
          session_id: response.session_id,
          role: 'assistant',
          content: response.response,
          created_at: new Date().toISOString(),
        },
      ])
      // Refresh sidebar chat list
      refreshChats()
    } catch (error) {
      console.error('Failed to send message:', error)
      setMessages((prev) => [
        ...prev,
        {
          id: '',
          session_id: currentSessionId || '',
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          created_at: new Date().toISOString(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 4rem)' }}>
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-3">
        <div className="max-w-4xl mx-auto">
          {episode && (
            <div className="flex items-center gap-3">
              {podcastImage && (
                <img
                  src={podcastImage}
                  alt={podcastTitle}
                  className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                {podcastTitle && (
                  <p className="text-xs text-gray-600 dark:text-gray-400">{podcastTitle}</p>
                )}
                <h1 className="text-sm font-semibold truncate">{episode.title}</h1>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Link
                  href={`/episodes/${episodeId}`}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Show Episode
                </Link>
                <button
                  onClick={handleCopyAllChat}
                  disabled={messages.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy All
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 py-12">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <p>Ask me anything about this episode!</p>
            </div>
          )}

          {messages.map((message, idx) => (
            <div
              key={idx}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-3xl ${message.role === 'user' ? 'w-full' : ''}`}>
                {editingMessageIndex === idx && message.role === 'user' ? (
                  // Editing mode
                  <div className="bg-white dark:bg-gray-800 border border-blue-500 rounded-lg p-3">
                    <textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 min-h-[80px]"
                      autoFocus
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleSaveEdit(idx)}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium"
                      >
                        Save & Resend
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // Display mode
                  <div className="group">
                    <div
                      className={`px-4 py-3 rounded-lg ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700'
                      }`}
                    >
                      {message.role === 'user' ? (
                        <div className="text-sm text-white whitespace-pre-wrap">{message.content}</div>
                      ) : (
                        <div className="text-sm">
                          <Markdown content={message.content} />
                        </div>
                      )}
                    </div>
                    {/* Action buttons - always visible below message */}
                    <div className={`flex gap-1 mt-1 ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}>
                      <button
                        onClick={() => handleCopyMessage(message.content)}
                        className="p-1.5 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400"
                        title="Copy message"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      {message.role === 'user' && (
                        <button
                          onClick={() => handleEditMessage(idx, message.content)}
                          className="p-1.5 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400"
                          title="Edit and resend"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-gray-700 px-4 py-3 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="max-w-4xl mx-auto flex gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask a question about this episode..."
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
            disabled={loading || !episodeId}
          />
          <button
            onClick={handleSend}
            disabled={loading || !inputMessage.trim() || !episodeId}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
      <ChatPageContent />
    </Suspense>
  )
}
