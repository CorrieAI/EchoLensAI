'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, Episode } from '@/lib/api'
import { Markdown } from '@/components/markdown'
import { DownloadEpisodeModal } from '@/components/download-episode-modal'
import { DeleteEpisodeDataModal } from '@/components/delete-episode-data-modal'
import { formatDuration } from '@/lib/duration-utils'

type TabType = 'summary' | 'terms' | 'notes' | 'transcript'

export default function EpisodeDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [episode, setEpisode] = useState<Episode | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('summary')
  const [summary, setSummary] = useState<string>('')
  const [transcript, setTranscript] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [terms, setTerms] = useState<any[]>([])
  const [filteredTerms, setFilteredTerms] = useState<any[]>([])
  const [termSearch, setTermSearch] = useState('')
  const [termSort, setTermSort] = useState<'elaborated' | 'alphabetical'>('elaborated')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [showDeleteDataModal, setShowDeleteDataModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selectedTerm, setSelectedTerm] = useState<any | null>(null)
  const [extractingMoreTerms, setExtractingMoreTerms] = useState(false)
  const [showHiddenTerms, setShowHiddenTerms] = useState(false)
  const [hiddenTermsCount, setHiddenTermsCount] = useState(0)
  const [transcriptSearch, setTranscriptSearch] = useState('')
  const [headerMinimized, setHeaderMinimized] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const mainAudioRef = useRef<HTMLAudioElement>(null)
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    loadEpisode()
    checkProcessingStatus()

    // Load header preference from localStorage
    const savedHeaderState = localStorage.getItem('episodeHeaderMinimized')
    if (savedHeaderState === 'true') {
      setHeaderMinimized(true)
    }

    // Poll for processing status every 5 seconds
    const interval = setInterval(checkProcessingStatus, 5000)
    return () => clearInterval(interval)
  }, [id])

  // Save header preference to localStorage
  const toggleHeader = () => {
    const newState = !headerMinimized
    setHeaderMinimized(newState)
    localStorage.setItem('episodeHeaderMinimized', String(newState))
  }

  // Load and restore playback position when episode changes
  useEffect(() => {
    if (!episode) return

    const loadPlaybackPosition = async () => {
      try {
        const progress = await api.getPlaybackProgress(episode.podcast_id, episode.id)
        if (progress.current_time > 0 && mainAudioRef.current) {
          mainAudioRef.current.currentTime = progress.current_time
        }
      } catch (error) {
        console.error('Failed to load playback position:', error)
      }
    }

    loadPlaybackPosition()
  }, [episode])

  // Save playback position every 10 seconds when playing
  useEffect(() => {
    const mainAudio = mainAudioRef.current
    if (!mainAudio || !episode) return

    const handlePlay = () => {
      // Save position every 10 seconds
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current)
      }

      saveIntervalRef.current = setInterval(async () => {
        if (mainAudio.currentTime > 0) {
          try {
            await api.savePlaybackProgress(episode.podcast_id, episode.id, mainAudio.currentTime)
          } catch (error) {
            console.error('Failed to save playback position:', error)
          }
        }
      }, 10000) // Save every 10 seconds
    }

    const handlePause = () => {
      // Save position immediately when paused
      if (mainAudio.currentTime > 0) {
        api.savePlaybackProgress(episode.podcast_id, episode.id, mainAudio.currentTime).catch(console.error)
      }

      // Clear interval when paused
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current)
        saveIntervalRef.current = null
      }
    }

    const handleEnded = () => {
      // Clear saved position when episode finishes
      api.deletePlaybackProgress(episode.podcast_id, episode.id).catch(console.error)

      // Clear interval
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current)
        saveIntervalRef.current = null
      }
    }

    mainAudio.addEventListener('play', handlePlay)
    mainAudio.addEventListener('pause', handlePause)
    mainAudio.addEventListener('ended', handleEnded)

    return () => {
      mainAudio.removeEventListener('play', handlePlay)
      mainAudio.removeEventListener('pause', handlePause)
      mainAudio.removeEventListener('ended', handleEnded)

      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current)
      }
    }
  }, [episode])

  const checkProcessingStatus = async () => {
    try {
      const status = await api.getEpisodeProcessingStatus(id)
      if (status.is_processing) {
        setProcessing(true)
      } else {
        if (processing) {
          // Was processing, now done - reload episode
          setProcessing(false)
          loadEpisode()
        }
      }
    } catch (error) {
      console.error('Failed to check processing status:', error)
    }
  }

  useEffect(() => {
    // Only load resources if episode has been processed (transcription/summary exist)
    if (activeTab === 'summary' && !summary && episode?.summary) {
      loadSummary()
    } else if (activeTab === 'transcript' && !transcript && episode?.transcription) {
      loadTranscription()
    } else if (activeTab === 'terms' && terms.length === 0 && episode?.summary) {
      // Terms are only available if episode has been processed (summary exists)
      loadTerms()
    } else if (activeTab === 'notes' && !notes) {
      loadNotes()
    }
  }, [activeTab, episode])

  const loadEpisode = async () => {
    try {
      setLoading(true)
      const data = await api.getEpisode(id)
      setEpisode(data)
    } catch (error) {
      console.error('Failed to load episode:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadSummary = async () => {
    try {
      const data = await api.getEpisodeSummary(id)
      setSummary(data?.text || '')
    } catch (error) {
      console.error('Failed to load summary:', error)
    }
  }

  const loadTranscription = async () => {
    try {
      const data = await api.getEpisodeTranscription(id)
      setTranscript(data?.text || '')
    } catch (error) {
      console.error('Failed to load transcription:', error)
    }
  }

  const loadTerms = async () => {
    try {
      const data = await api.getEpisodeTerms(id, showHiddenTerms)
      setTerms(data || [])
      setFilteredTerms(data || [])

      // Load hidden terms count
      try {
        const countData = await api.getHiddenTermsCount(id)
        setHiddenTermsCount(countData.count)
      } catch (error) {
        // Count endpoint might fail if no terms exist yet
        setHiddenTermsCount(0)
      }
    } catch (error) {
      console.error('Failed to load terms:', error)
    }
  }

  const handleExtractMoreTerms = async () => {
    if (!episode) return
    setExtractingMoreTerms(true)
    try {
      // Load transcript if not already loaded (needed for backend processing)
      if (!transcript && episode.transcription) {
        await loadTranscription()
      }

      const response = await api.extractMoreTerms(id)
      const taskId = response.task_id

      // Poll for task completion
      const pollInterval = setInterval(async () => {
        try {
          const taskStatus = await api.getTaskStatus(taskId)

          if (taskStatus.status === 'SUCCESS') {
            clearInterval(pollInterval)
            await loadTerms()
            setExtractingMoreTerms(false)
          } else if (taskStatus.status === 'FAILURE' || taskStatus.status === 'CANCELLED') {
            clearInterval(pollInterval)
            setExtractingMoreTerms(false)
            console.error('Task failed:', taskStatus.error_message)
          }
        } catch (error) {
          console.error('Failed to check task status:', error)
        }
      }, 2000) // Check every 2 seconds

    } catch (error) {
      console.error('Failed to extract more terms:', error)
      setExtractingMoreTerms(false)
    }
  }

  const handleHideTerm = async (termId: string) => {
    try {
      await api.hideTerm(termId)
      setOpenMenuId(null)
      loadTerms()
    } catch (error) {
      console.error('Failed to hide term:', error)
    }
  }

  const handleUnhideTerm = async (termId: string) => {
    try {
      await api.unhideTerm(termId)
      loadTerms()
    } catch (error) {
      console.error('Failed to unhide term:', error)
    }
  }


  // Filter and sort terms
  useEffect(() => {
    if (terms.length === 0) return

    let filtered = terms

    // Apply search filter
    if (termSearch) {
      filtered = filtered.filter((term) =>
        term.term.toLowerCase().includes(termSearch.toLowerCase()) ||
        (term.explanation && term.explanation.toLowerCase().includes(termSearch.toLowerCase()))
      )
    }

    // Apply sort
    if (termSort === 'alphabetical') {
      filtered = [...filtered].sort((a, b) => a.term.localeCompare(b.term))
    } else if (termSort === 'elaborated') {
      filtered = [...filtered].sort((a, b) => {
        // Elaborated first (has elaborate_explanation)
        const aElaborated = a.elaborate_explanation ? 1 : 0
        const bElaborated = b.elaborate_explanation ? 1 : 0
        return bElaborated - aElaborated
      })
    }

    setFilteredTerms(filtered)
  }, [terms, termSearch, termSort])

  // Reload terms when showHiddenTerms changes
  useEffect(() => {
    if (activeTab === 'terms') {
      loadTerms()
    }
  }, [showHiddenTerms])

  const loadNotes = async () => {
    // TODO: Implement notes API endpoint
    console.log('Load notes')
  }

  const handleDownloadNotes = () => {
    if (!notes.trim()) {
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-yellow-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
      toast.textContent = 'No notes to download'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
      return
    }

    // Create a blob with the notes content
    const blob = new Blob([notes], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)

    // Create a temporary download link
    const link = document.createElement('a')
    link.href = url
    link.download = `${episode?.title || 'episode'}-notes.txt`
    document.body.appendChild(link)
    link.click()

    // Cleanup
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    // Show success toast
    const toast = document.createElement('div')
    toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
    toast.textContent = 'Notes downloaded!'
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 3000)
  }

  const handleProcess = async () => {
    setProcessing(true)
    try {
      const result = await api.processEpisode(id)
      // Show success message in a simple toast-like div
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 animate-slide-up'
      toast.textContent = 'Episode queued for processing! Check the Tasks page for progress.'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 4000)

      await loadEpisode()
    } catch (error) {
      console.error('Failed to process episode:', error)
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
      toast.textContent = 'Failed to queue episode: ' + (error instanceof Error ? error.message : 'Unknown error')
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 4000)
    } finally {
      setProcessing(false)
    }
  }

  const handleDownload = async () => {
    if (!episode) return

    setDownloading(true)
    try {
      await api.downloadEpisodeAudio(episode.podcast_id, episode.id)
      await loadEpisode() // Refresh to get local_audio_path

      // Show success toast
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
      toast.textContent = '✓ Episode audio downloaded successfully'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
    } catch (error) {
      console.error('Failed to download episode:', error)

      // Show error toast
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
      toast.textContent = '✗ Failed to download episode audio'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
    } finally {
      setDownloading(false)
    }
  }

  const handleDeleteLocalData = async () => {
    if (!episode) return

    setDeleting(true)
    try {
      await api.deleteEpisodeLocalData(episode.podcast_id, episode.id)
      await loadEpisode() // Refresh episode data

      // Clear local state for deleted data (don't try to reload from API - would get 404s)
      setSummary('')
      setTranscript('')
      setTerms([])
      setFilteredTerms([])

      // Show success toast
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
      toast.textContent = '✓ Local data deleted successfully'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
    } catch (error) {
      console.error('Failed to delete local data:', error)

      // Show error toast
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
      toast.textContent = '✗ Failed to delete local data'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
    } finally {
      setDeleting(false)
      setShowDeleteDataModal(false)
    }
  }

  const handleChatAboutTerm = async (term: any) => {
    setOpenMenuId(null)

    try {
      // Check if a chat session exists for this episode
      const existingSession = await api.getEpisodeChatSession(id)

      if (existingSession) {
        // Navigate to existing session with pre-populated query
        router.push(`/chat?session_id=${existingSession.id}&q=${encodeURIComponent('Tell me more about ' + term.term)}`)
      } else {
        // Navigate with episode_id to create new session
        router.push(`/chat?episode_id=${id}&q=${encodeURIComponent('Tell me more about ' + term.term)}`)
      }
    } catch (error) {
      console.error('Failed to check for existing chat session:', error)
      // Fallback to creating new session
      router.push(`/chat?episode_id=${id}&q=${encodeURIComponent('Tell me more about ' + term.term)}`)
    }
  }

  const handleElaborate = async (termId: string) => {
    setOpenMenuId(null)

    // Show processing toast
    const processingToast = document.createElement('div')
    processingToast.className = 'fixed bottom-4 right-4 bg-blue-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 flex items-center gap-3'
    processingToast.innerHTML = `
      <svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-width="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
      </svg>
      <span>Generating elaborate explanation...</span>
    `
    document.body.appendChild(processingToast)

    try {
      const response = await fetch(`/api/proxy/api/terms/${termId}/elaborate`, {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to elaborate term' }))
        throw new Error(error.detail || 'Failed to elaborate term')
      }

      // Remove processing toast
      processingToast.remove()

      // Show success toast
      const successToast = document.createElement('div')
      successToast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
      successToast.textContent = 'Elaborate explanation generated and added to vector database!'
      document.body.appendChild(successToast)
      setTimeout(() => successToast.remove(), 4000)

      // Reload terms to get the updated elaborate_explanation
      await loadTerms()
    } catch (error) {
      console.error('Failed to elaborate term:', error)

      // Remove processing toast
      processingToast.remove()

      // Show error toast
      const errorToast = document.createElement('div')
      errorToast.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
      errorToast.textContent = 'Failed to elaborate term: ' + (error instanceof Error ? error.message : 'Unknown error')
      document.body.appendChild(errorToast)
      setTimeout(() => errorToast.remove(), 4000)
    }
  }

  if (loading || !episode) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  const tabs: { key: TabType; label: string }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'terms', label: 'Terms' },
    { key: 'notes', label: 'Notes' },
    { key: 'transcript', label: 'Raw Transcript' },
  ]

  return (
    <div className="min-h-screen">
      {/* Sticky Episode Header */}
      <div className="sticky top-12 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="max-w-6xl mx-auto p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            {headerMinimized ? (
              /* Minimized Header */
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleHeader}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors flex-shrink-0"
                  title="Expand header"
                >
                  <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {episode.image_url && (
                  <img
                    src={episode.image_url}
                    alt={episode.title}
                    className="w-12 h-12 rounded object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {episode.podcast && (
                      <Link
                        href={`/podcasts/${episode.podcast.id}`}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
                      >
                        {episode.podcast.title}
                      </Link>
                    )}
                    {episode.transcription && episode.summary && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-medium rounded">
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    )}
                  </div>
                  <h1 className="text-sm font-semibold truncate">{episode.title}</h1>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {episode.transcription && (
                    <Link
                      href={`/chat?episode_id=${episode.id}`}
                      className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded font-medium transition-colors"
                    >
                      Chat
                    </Link>
                  )}
                  {episode.local_audio_path ? (
                    <button disabled className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-600 text-white text-xs rounded cursor-default opacity-75">
                      Downloaded
                    </button>
                  ) : (
                    <button onClick={() => setShowDownloadModal(true)} disabled={downloading} className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-xs rounded transition-colors">
                      Download
                    </button>
                  )}
                  {episode.transcription && episode.summary ? (
                    <button disabled className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-600 text-white text-xs rounded cursor-default">
                      Processed
                    </button>
                  ) : (
                    <button onClick={handleProcess} disabled={processing} className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-xs rounded transition-colors">
                      {processing ? 'Processing...' : 'Process'}
                    </button>
                  )}
                  {(episode.local_audio_path || episode.transcription || episode.summary) && (
                    <button onClick={() => setShowDeleteDataModal(true)} disabled={deleting} className="inline-flex items-center gap-1.5 px-2 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white text-xs rounded transition-colors">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Expanded Header */
              <div className="flex gap-4">
                <button
                  onClick={toggleHeader}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors self-start flex-shrink-0"
                  title="Minimize header"
                >
                  <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                {episode.image_url && (
                  <img
                    src={episode.image_url}
                    alt={episode.title}
                    className="w-36 h-36 rounded-lg object-cover shadow-lg flex-shrink-0"
                  />
                )}

                <div className="flex-1">
                  {episode.podcast && (
                    <Link
                      href={`/podcasts/${episode.podcast.id}`}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-1 block"
                    >
                      {episode.podcast.title}
                    </Link>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <h1 className="text-xl font-bold">{episode.title}</h1>
                    {episode.transcription && episode.summary && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-medium rounded">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        Processed
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                    {episode.duration && (
                      <span>
                        {formatDuration(episode.duration)}
                      </span>
                    )}
                    {episode.published_at && (
                      <>
                        {episode.duration && <span>•</span>}
                        <span>{new Date(episode.published_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {episode.transcription && (
                      <Link
                        href={`/chat?episode_id=${episode.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        Chat
                      </Link>
                    )}
                    {episode.local_audio_path ? (
                      <button disabled className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg cursor-default opacity-75">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Downloaded
                      </button>
                    ) : (
                      <button onClick={() => setShowDownloadModal(true)} disabled={downloading} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm rounded-lg font-medium transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download
                      </button>
                    )}
                    {episode.transcription && episode.summary ? (
                      <button disabled className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg cursor-default">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Processed
                      </button>
                    ) : (
                      <button onClick={handleProcess} disabled={processing} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm rounded-lg font-medium transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        {processing ? 'Processing...' : 'Process with AI'}
                      </button>
                    )}
                    {(episode.local_audio_path || episode.transcription || episode.summary) && (
                      <button onClick={() => setShowDeleteDataModal(true)} disabled={deleting} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm rounded-lg font-medium transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete Local Data
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-8 pt-4">
        {/* Show Notes */}
        {episode.description && (
          <details className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <summary className="cursor-pointer text-lg font-semibold hover:text-blue-600 dark:hover:text-blue-400">
              Show Notes
            </summary>
            <div className="mt-4 text-sm text-gray-700 dark:text-gray-300">
              <Markdown content={episode.description} />
            </div>
          </details>
        )}

        {/* Audio Player */}
        {episode.audio_url && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
              </svg>
              <h2 className="font-semibold">Full Episode Audio</h2>
            </div>
            <audio ref={mainAudioRef} controls className="w-full">
              <source
                src={
                  episode.local_audio_path
                    ? `/api/proxy/${episode.local_audio_path}`
                    : `/api/proxy/api/podcasts/${episode.podcast_id}/episodes/${episode.id}/stream`
                }
                type="audio/mpeg"
              />
              Your browser does not support the audio element.
            </audio>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="border-b border-gray-200 dark:border-gray-700 flex">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-6 py-3 font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {activeTab === 'summary' && (
              <div>
                {/* Summary Audio Player */}
                {episode.summary?.audio_path && (
                  <div className="mb-6">
                    <div className="flex items-center gap-3 mb-3">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                        />
                      </svg>
                      <h2 className="font-semibold text-base">Summary</h2>
                    </div>
                    <audio ref={audioRef} controls className="w-full mb-6">
                      <source src={`/api/proxy/${episode.summary.audio_path}`} type="audio/mpeg" />
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                )}

                {summary ? (
                  <Markdown content={summary} />
                ) : (
                  <p className="text-gray-500">No summary available</p>
                )}
              </div>
            )}

            {activeTab === 'terms' && (
              <div>
                {terms.length > 0 ? (
                  <>
                    {/* Search and Sort Controls */}
                    <div className="mb-6 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          # Extracted Terms ({filteredTerms.length})
                        </span>
                        <button
                          onClick={handleExtractMoreTerms}
                          disabled={extractingMoreTerms || (terms.length === 0 && !transcript)}
                          className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center gap-2"
                        >
                          {extractingMoreTerms ? (
                            <>
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Extracting...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Extract More Terms
                            </>
                          )}
                        </button>
                        {hiddenTermsCount > 0 && (
                          <button
                            onClick={() => setShowHiddenTerms(!showHiddenTerms)}
                            className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-2 ${
                              showHiddenTerms
                                ? 'bg-gray-600 hover:bg-gray-700 text-white'
                                : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100'
                            }`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              {showHiddenTerms ? (
                                <>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </>
                              ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              )}
                            </svg>
                            {hiddenTermsCount} Hidden
                          </button>
                        )}
                      </div>
                      <div className="flex gap-3 items-center w-full sm:w-auto">
                        <input
                          type="text"
                          placeholder="Search terms..."
                          value={termSearch}
                          onChange={(e) => setTermSearch(e.target.value)}
                          className="flex-1 sm:w-64 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                        />
                        <select
                          value={termSort}
                          onChange={(e) => setTermSort(e.target.value as 'elaborated' | 'alphabetical')}
                          className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                        >
                          <option value="elaborated">Elaborated First</option>
                          <option value="alphabetical">Alphabetical</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredTerms.map((term) => (
                      <div
                        key={term.id}
                        className={`border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow relative ${
                          term.hidden === 1
                            ? 'bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-600 opacity-70'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                        }`}
                        onMouseLeave={() => setOpenMenuId(null)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2 flex-1">
                            <h3 className="font-semibold text-lg text-blue-600 dark:text-blue-400">
                              {term.term}
                            </h3>
                            {term.source === 'manual' && (
                              <span className="text-xs px-2 py-0.5 bg-blue-500 text-white rounded">
                                Manual
                              </span>
                            )}
                            {term.hidden === 1 && (
                              <span className="text-xs px-2 py-0.5 bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                                Hidden
                              </span>
                            )}
                          </div>
                          <div className="relative">
                            <button
                              onClick={() => setOpenMenuId(openMenuId === term.id ? null : term.id)}
                              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            >
                              <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 16 16">
                                <circle cx="8" cy="3" r="1.5"/>
                                <circle cx="8" cy="8" r="1.5"/>
                                <circle cx="8" cy="13" r="1.5"/>
                              </svg>
                            </button>
                            {openMenuId === term.id && (
                              <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
                                <button
                                  onClick={() => handleChatAboutTerm(term)}
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                  </svg>
                                  Chat about this
                                </button>
                                <button
                                  onClick={() => handleElaborate(term.id)}
                                  disabled={!!term.elaborate_explanation}
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  {term.elaborate_explanation ? 'Already Elaborated' : 'Elaborate'}
                                </button>
                                {term.hidden === 1 ? (
                                  <button
                                    onClick={() => handleUnhideTerm(term.id)}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    Unhide
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleHideTerm(term.id)}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                    </svg>
                                    Hide
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        {term.context && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 italic mb-2 border-l-2 border-gray-300 dark:border-gray-600 pl-2">
                            "{term.context}"
                          </p>
                        )}
                        {term.explanation && (
                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                            {term.explanation}
                          </p>
                        )}
                        {term.elaborate_explanation && (
                          <button
                            onClick={() => setSelectedTerm(term)}
                            className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            View detailed explanation
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  </>
                ) : (
                  <p className="text-gray-500">No terms extracted</p>
                )}
              </div>
            )}

            {activeTab === 'notes' && (
              <div>
                <div className="mb-4 flex justify-between items-center">
                  <h3 className="text-lg font-semibold">My Notes</h3>
                  <button
                    onClick={handleDownloadNotes}
                    className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors"
                  >
                    Download Notes
                  </button>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full h-64 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                  placeholder="Take notes about this episode..."
                />
              </div>
            )}

            {activeTab === 'transcript' && (
              <div>
                {transcript ? (
                  <>
                    {/* Search Bar */}
                    <div className="mb-4">
                      <input
                        type="text"
                        placeholder="Search transcript..."
                        value={transcriptSearch}
                        onChange={(e) => setTranscriptSearch(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                      />
                    </div>

                    {/* Transcript Text */}
                    <div className="max-w-none relative">
                      <pre className="whitespace-pre-wrap text-sm bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                        {transcriptSearch ? (
                          transcript.split(new RegExp(`(${transcriptSearch})`, 'gi')).map((part, i) =>
                            part.toLowerCase() === transcriptSearch.toLowerCase() ? (
                              <mark key={i} className="bg-yellow-200 dark:bg-yellow-600">{part}</mark>
                            ) : (
                              part
                            )
                          )
                        ) : (
                          transcript
                        )}
                      </pre>
                    </div>
                  </>
                ) : (
                  <p className="text-gray-500">No transcript available</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Elaborate Term Modal */}
      {selectedTerm && (
        <div
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedTerm(null)}
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden flex flex-col max-w-4xl w-full max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 flex items-center justify-between flex-shrink-0">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{selectedTerm.term}</h3>
              <button
                onClick={() => setSelectedTerm(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {selectedTerm.explanation && (
                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 mb-2">Brief Definition:</p>
                  <p className="text-sm text-blue-800 dark:text-blue-200">{selectedTerm.explanation}</p>
                </div>
              )}
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <Markdown content={selectedTerm.elaborate_explanation} />
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 flex-shrink-0">
              <button
                onClick={() => setSelectedTerm(null)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <DownloadEpisodeModal
        isOpen={showDownloadModal}
        episode={episode}
        onClose={() => setShowDownloadModal(false)}
        onDownload={handleDownload}
      />

      <DeleteEpisodeDataModal
        isOpen={showDeleteDataModal}
        episode={episode}
        onClose={() => setShowDeleteDataModal(false)}
        onDelete={handleDeleteLocalData}
      />
    </div>
  )
}
