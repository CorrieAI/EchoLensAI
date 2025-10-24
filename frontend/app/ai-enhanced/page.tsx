'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import Link from 'next/link'
import { formatDuration } from '@/lib/duration-utils'
import { useTaskMonitor } from '@/hooks/useTaskMonitor'

export default function AIEnhancedPage() {
  const [episodes, setEpisodes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('processed_desc')
  const [searchMode, setSearchMode] = useState<'semantic' | 'text'>('semantic')

  // Monitor tasks and auto-refresh when processing completes
  useTaskMonitor({
    onTaskComplete: () => {
      loadEpisodes()
    }
  })

  useEffect(() => {
    loadEpisodes()
  }, [search, sort, searchMode])

  const stripHtml = (html: string) => {
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    return tmp.textContent || tmp.innerText || ''
  }

  const loadEpisodes = async () => {
    try {
      setLoading(true)

      // Use semantic search if enabled and search query exists
      if (searchMode === 'semantic' && search && search.trim()) {
        const data = await api.semanticSearchEpisodes(search, 20)
        setEpisodes(data)
      } else {
        // Fall back to text search
        const data = await api.getProcessedEpisodes(search || undefined, sort)
        setEpisodes(data)
      }
    } catch (error) {
      console.error('Failed to load episodes:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto p-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">AI Enhanced Podcasts</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Podcasts with AI-processed episodes - summaries, transcripts, and insights
            </p>
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchMode('semantic')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                searchMode === 'semantic'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Hybrid AI Search
              </span>
            </button>
            <button
              onClick={() => setSearchMode('text')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                searchMode === 'text'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                Basic Search
              </span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder={searchMode === 'semantic' ? 'Search episode transcripts...' : 'Search titles & descriptions...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              style={{ width: '320px' }}
            />
            {searchMode === 'text' && (
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                style={{ width: '220px' }}
              >
                <option value="processed_desc">Recently Processed</option>
                <option value="name_asc">Name (A-Z)</option>
                <option value="name_desc">Name (Z-A)</option>
                <option value="episodes_desc">Most Episodes</option>
              </select>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12 text-gray-500">
              Loading AI enhanced episodes...
            </div>
          ) : episodes.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No AI enhanced episodes found
            </div>
          ) : (
            episodes.map((episode) => (
              <Link
                key={episode.id}
                href={`/episodes/${episode.id}`}
                className="block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {episode.image_url && (
                    <img
                      src={episode.image_url}
                      alt={episode.title}
                      className="w-16 h-16 rounded object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1 line-clamp-1">
                      {episode.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {episode.podcast_title}
                      {episode.podcast_author && ` • ${episode.podcast_author}`}
                    </p>
                    {searchMode === 'semantic' && episode.match_snippet ? (
                      <div className="mb-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          {episode.exact_match ? (
                            <>
                              <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="text-xs font-semibold text-green-600 dark:text-green-400">Exact Match</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                              </svg>
                              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Semantic Match</span>
                              {episode.similarity_score !== undefined && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  ({(1 - episode.similarity_score).toFixed(2)})
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 italic line-clamp-2 pl-4 border-l-2 border-blue-300 dark:border-blue-700">
                          "{episode.match_snippet}"
                        </p>
                      </div>
                    ) : episode.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-500 line-clamp-2 mb-2">
                        {stripHtml(episode.description)}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {episode.processed_at && (
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          Processed {new Date(episode.processed_at).toLocaleDateString()}
                        </span>
                      )}
                      {episode.published_at && (
                        <span>Published {new Date(episode.published_at).toLocaleDateString()}</span>
                      )}
                      {episode.duration && (
                        <span>{formatDuration(episode.duration)}</span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
