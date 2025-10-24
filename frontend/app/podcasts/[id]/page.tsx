'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, Podcast, Episode } from '@/lib/api'
import { DeletePodcastModal } from '@/components/delete-podcast-modal'
import { AutoDownloadModal } from '@/components/auto-download-modal'
import { getImageUrl } from '@/lib/image-utils'
import { formatDuration } from '@/lib/duration-utils'
import { useTaskMonitor } from '@/hooks/useTaskMonitor'

export default function PodcastDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [podcast, setPodcast] = useState<Podcast | null>(null)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(true)
  const [searchLoading, setSearchLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [processedOnly, setProcessedOnly] = useState(false)
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [processingEpisodes, setProcessingEpisodes] = useState<Set<string>>(new Set())
  const [uploadingImage, setUploadingImage] = useState(false)
  const [showAutoDownloadModal, setShowAutoDownloadModal] = useState(false)
  const [storageSize, setStorageSize] = useState<string>('')

  // Track previous processing IDs to detect when episodes finish
  const prevProcessingIdsRef = useRef<Set<string>>(new Set())

  // Monitor tasks and auto-refresh when processing completes
  useTaskMonitor({
    onTaskComplete: () => {
      loadPodcast()
      loadEpisodes()
      loadStorage()
    }
  })

  // Helper function to strip HTML tags from text
  const stripHtml = (html: string) => {
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    return tmp.textContent || tmp.innerText || ''
  }

  // Initial load
  useEffect(() => {
    loadPodcast()
    loadProcessingStatus()

    // Poll for processing status every 5 seconds
    const interval = setInterval(loadProcessingStatus, 5000)
    return () => clearInterval(interval)
  }, [id])

  // Search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      loadEpisodes()
    }, 300)
    return () => clearTimeout(timer)
  }, [search, processedOnly])

  const loadProcessingStatus = async () => {
    try {
      const data = await api.getAllProcessingEpisodes()
      const newProcessingIds = new Set(data.processing_episode_ids)

      // Check if any episodes finished processing (were in previous ref, not in new set)
      const finishedEpisodes = Array.from(prevProcessingIdsRef.current).filter(
        id => !newProcessingIds.has(id)
      )

      // Update ref and state
      prevProcessingIdsRef.current = newProcessingIds
      setProcessingEpisodes(newProcessingIds)

      // If episodes finished, reload data to show updated "Processed" badges
      if (finishedEpisodes.length > 0) {
        console.log('Episodes finished processing:', finishedEpisodes)
        // Reload in background without showing loading spinner
        const podcastData = await api.getPodcast(id)
        setPodcast(podcastData)
        const episodesData = await api.getEpisodes(id, search || undefined, processedOnly)
        setEpisodes(episodesData)
      }
    } catch (error) {
      console.error('Failed to load processing status:', error)
    }
  }

  const loadPodcast = async () => {
    try {
      setLoading(true)
      const podcastData = await api.getPodcast(id)
      setPodcast(podcastData)
      await loadEpisodes()
      await loadStorage()
    } catch (error) {
      console.error('Failed to load podcast:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadStorage = async () => {
    try {
      const storageData = await api.getPodcastStorage(id)
      setStorageSize(storageData.formatted_size)
    } catch (error) {
      console.error('Failed to load storage:', error)
    }
  }

  const loadEpisodes = async () => {
    try {
      setSearchLoading(true)
      const episodesData = await api.getEpisodes(id, search || undefined, processedOnly)
      setEpisodes(episodesData)
    } catch (error) {
      console.error('Failed to load episodes:', error)
    } finally {
      setSearchLoading(false)
    }
  }

  const loadData = async () => {
    await loadPodcast()
  }

  const handleRefresh = async () => {
    try {
      setRefreshing(true)
      await api.refreshPodcast(id)
      await loadData()
    } catch (error) {
      console.error('Failed to refresh podcast:', error)
    } finally {
      setRefreshing(false)
    }
  }

  const toggleEpisodeSelection = (episodeId: string) => {
    const newSelection = new Set(selectedEpisodes)
    if (newSelection.has(episodeId)) {
      newSelection.delete(episodeId)
    } else {
      newSelection.add(episodeId)
    }
    setSelectedEpisodes(newSelection)
  }

  const toggleSelectAll = () => {
    if (selectedEpisodes.size === episodes.length) {
      setSelectedEpisodes(new Set())
    } else {
      setSelectedEpisodes(new Set(episodes.map((e) => e.id)))
    }
  }

  const handleProcessSelected = async () => {
    const episodesToProcess = Array.from(selectedEpisodes)

    // Immediately mark episodes as processing
    setProcessingEpisodes(new Set([...processingEpisodes, ...episodesToProcess]))
    setSelectedEpisodes(new Set())

    try {
      await api.bulkProcessEpisodes(id, episodesToProcess)

      // Show success toast
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
      toast.textContent = `✓ Queued ${episodesToProcess.length} episode${episodesToProcess.length !== 1 ? 's' : ''} for AI processing`
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)

      // Keep them marked as processing - they'll show as processed when data reloads
    } catch (error) {
      console.error('Failed to process episodes:', error)

      // Show error toast
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
      toast.textContent = '✗ Failed to queue episodes for processing'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)

      // Remove from processing on error
      setProcessingEpisodes(prev => {
        const next = new Set(prev)
        episodesToProcess.forEach(id => next.delete(id))
        return next
      })
    }
  }

  const handleDelete = async () => {
    try {
      await api.deletePodcast(id)
      router.push('/')
    } catch (error) {
      console.error('Failed to delete podcast:', error)
      throw error
    }
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
      toast.textContent = '✗ Please select an image file'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
      return
    }

    try {
      setUploadingImage(true)
      const result = await api.uploadPodcastImage(id, file)

      // Update podcast image in state - getImageUrl() will handle the URL transformation
      // Add cache-busting parameter to force browser to reload
      const imageUrl = `${result.image_url}?t=${Date.now()}`
      setPodcast(prev => prev ? { ...prev, image_url: imageUrl } : null)

      // Show success toast
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
      toast.textContent = '✓ Image uploaded successfully'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
    } catch (error) {
      console.error('Failed to upload image:', error)
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
      toast.textContent = '✗ Failed to upload image'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
    } finally {
      setUploadingImage(false)
    }
  }

  const handleAutoDownloadSave = async (autoDownload: number, autoDownloadLimit: number | null) => {
    try {
      await api.updateAutoDownloadSettings(id, autoDownload, autoDownloadLimit)

      // Update local state
      setPodcast(prev => prev ? { ...prev, auto_download: autoDownload, auto_download_limit: autoDownloadLimit } : null)

      // Show success toast
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
      toast.textContent = '✓ Auto-download settings saved'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
    } catch (error) {
      console.error('Failed to update auto-download settings:', error)
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
      toast.textContent = '✗ Failed to update settings'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
      throw error
    }
  }

  if (loading || !podcast) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto p-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex gap-6">
            <div className="relative group flex-shrink-0">
              {getImageUrl(podcast.image_url) ? (
                <img
                  src={getImageUrl(podcast.image_url)!}
                  alt={podcast.title}
                  className="w-32 h-32 rounded-lg object-cover"
                />
              ) : (
                <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600" />
              )}
              <label
                htmlFor="image-upload"
                className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {uploadingImage ? (
                  <svg className="w-6 h-6 text-white animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeWidth="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                )}
              </label>
              <input
                id="image-upload"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploadingImage}
                className="hidden"
              />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">{podcast.title}</h1>
              {podcast.author && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  by {podcast.author}
                </p>
              )}

              <div className="flex items-center gap-3 mb-3 text-sm text-gray-600 dark:text-gray-400">
                <div>{podcast.episode_count} episodes</div>
                {(podcast.episodes?.filter(e => e.summary && e.transcription).length ?? 0) > 0 && (
                  <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                    {podcast.episodes?.filter(e => e.summary && e.transcription).length} AI processed
                  </div>
                )}
                {storageSize && storageSize !== '0.0 B' && (
                  <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                    </svg>
                    {storageSize} local storage
                  </div>
                )}
              </div>

              {podcast.description && (
                <p
                  className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 mb-4"
                  dangerouslySetInnerHTML={{ __html: podcast.description }}
                />
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-900 dark:text-gray-100 font-medium px-4 py-2 rounded-lg transition-colors text-sm inline-flex items-center gap-2"
                >
                  <svg
                    className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  {refreshing ? 'Updating...' : 'Update Podcast'}
                </button>
                <button
                  onClick={() => setShowAutoDownloadModal(true)}
                  className="text-sm inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Auto-Download
                </button>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="text-sm inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  Delete Podcast
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          {/* Sticky header section */}
          <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 rounded-t-lg border-b border-gray-200 dark:border-gray-700">
            <div className="p-6 pb-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Episodes ({episodes.length})</h2>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={processedOnly}
                      onChange={(e) => setProcessedOnly(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Processed only</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Search episodes..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-64 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                  />
                </div>
              </div>

              {/* Process Selected bar - shown when episodes are selected */}
              {selectedEpisodes.size > 0 && (
                <div className="p-3 bg-blue-600 dark:bg-blue-600 border border-blue-400 dark:border-blue-500 rounded-lg shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm font-medium text-white cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedEpisodes.size === episodes.length}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded border-white text-blue-600 focus:ring-blue-500"
                        />
                        <span>Select All</span>
                      </label>
                      <span className="text-sm text-blue-100">
                        {selectedEpisodes.size} episode{selectedEpisodes.size !== 1 ? 's' : ''} selected
                      </span>
                    </div>
                    <button
                      onClick={handleProcessSelected}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-blue-50 text-blue-600 text-sm rounded-lg font-medium transition-colors shadow-md hover:shadow-lg"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                        />
                      </svg>
                      Process Selected
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="px-6 pb-6">
            <div className="space-y-4">
            {episodes.map((episode) => {
              const isProcessing = processingEpisodes.has(episode.id)
              const isProcessed = !!(episode.transcription && episode.summary)

              // Check if episode is new (published within last 24 hours)
              const isNew = episode.published_at
                ? new Date(episode.published_at).getTime() > Date.now() - 24 * 60 * 60 * 1000
                : false

              return (
              <div
                key={episode.id}
                className={`flex items-start gap-4 p-4 rounded-lg transition-colors ${
                  isProcessing
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-400 dark:border-blue-600 shadow-lg shadow-blue-200 dark:shadow-blue-900/50'
                    : isProcessed
                    ? 'bg-green-50 dark:bg-green-900/20 border-2 border-green-400 dark:border-green-600 shadow-lg shadow-green-200 dark:shadow-green-900/50 hover:bg-green-100 dark:hover:bg-green-900/30'
                    : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-1">
                      <Link
                        href={`/episodes/${episode.id}`}
                        className="text-lg font-semibold hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {episode.title}
                      </Link>
                      {isNew && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-semibold rounded-full">
                          NEW
                        </span>
                      )}
                    </div>
                    {episode.duration && (
                      <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
                        {formatDuration(episode.duration)}
                      </span>
                    )}
                  </div>
                  {episode.published_at && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {new Date(episode.published_at).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </p>
                  )}
                  {episode.description && (
                    <p
                      className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 mb-2"
                      dangerouslySetInnerHTML={{ __html: episode.description }}
                    />
                  )}
                  {isProcessing && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                      <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeWidth="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
                      </svg>
                      Processing...
                    </span>
                  )}
                  {!isProcessing && isProcessed && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded-full">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Processed
                    </span>
                  )}
                  {!isProcessing && !isProcessed && episode.local_audio_path && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs rounded-full">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Downloaded
                    </span>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={selectedEpisodes.has(episode.id)}
                  onChange={() => toggleEpisodeSelection(episode.id)}
                  disabled={isProcessing || isProcessed}
                  className="w-4 h-4 mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            )
            })}
            </div>
          </div>
        </div>

        <DeletePodcastModal
          isOpen={showDeleteModal}
          podcast={podcast}
          onClose={() => setShowDeleteModal(false)}
          onDelete={handleDelete}
        />

        <AutoDownloadModal
          isOpen={showAutoDownloadModal}
          podcast={podcast}
          onClose={() => setShowAutoDownloadModal(false)}
          onSave={handleAutoDownloadSave}
        />
      </div>
    </div>
  )
}
