'use client'

import { useState, useEffect } from 'react'
import { api, Podcast } from '@/lib/api'
import { PodcastCard } from '@/components/podcast-card'
import { AddPodcastModal } from '@/components/add-podcast-modal'
import { useTaskMonitor } from '@/hooks/useTaskMonitor'
import { ProtectedRoute } from '@/components/protected-route'
import { useAuth } from '@/contexts/auth-context'

export default function Home() {
  const { user, loading: authLoading } = useAuth()
  const [podcasts, setPodcasts] = useState<Podcast[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('updated_desc')
  const [category, setCategory] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [updating, setUpdating] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

  // Display preferences
  const [cardColumns, setCardColumns] = useState<'2' | '3'>('3')
  const [paginationMode, setPaginationMode] = useState<'infinite' | 'pagination'>('pagination')
  const [itemsPerPage, setItemsPerPage] = useState<number>(12)
  const [currentPage, setCurrentPage] = useState(1)

  // Monitor tasks and auto-refresh when processing completes
  useTaskMonitor({
    onTaskComplete: () => {
      loadPodcasts()
    }
  })

  useEffect(() => {
    // Only load data if user is authenticated
    if (user && !authLoading) {
      loadCategories()
      loadDisplayPreferences()
    }
  }, [user, authLoading])

  useEffect(() => {
    // Only load podcasts if user is authenticated
    if (user && !authLoading) {
      loadPodcasts()
    }
  }, [search, sort, category, user, authLoading])

  const loadDisplayPreferences = () => {
    const savedColumns = localStorage.getItem('podcast_card_columns')
    const savedPagination = localStorage.getItem('podcast_pagination_mode')
    const savedItemsPerPage = localStorage.getItem('podcast_items_per_page')

    if (savedColumns) setCardColumns(savedColumns as '2' | '3')
    if (savedPagination) setPaginationMode(savedPagination as 'infinite' | 'pagination')
    if (savedItemsPerPage) setItemsPerPage(parseInt(savedItemsPerPage))
  }

  const loadCategories = async () => {
    try {
      const data = await api.getCategories()
      setCategories(data.categories)
    } catch (error) {
      console.error('Failed to load categories:', error)
    }
  }

  const loadPodcasts = async () => {
    try {
      setLoading(true)
      const data = await api.getPodcasts(search || undefined, sort, category || undefined)
      setPodcasts(data)
    } catch (error) {
      console.error('Failed to load podcasts:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateAll = async () => {
    try {
      setUpdating(true)
      const result = await api.refreshAllPodcasts()
      await loadPodcasts()

      // Show toast notification
      const toast = document.createElement('div')
      toast.className = `fixed bottom-4 right-4 ${result.failed > 0 ? 'bg-yellow-600' : 'bg-green-600'} text-white px-6 py-4 rounded-lg shadow-lg z-50`
      toast.textContent = `Updated ${result.updated} podcast(s)${result.failed > 0 ? `, ${result.failed} failed` : ''}`
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
    } catch (error) {
      console.error('Failed to update podcasts:', error)

      // Show error toast
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
      toast.textContent = 'Failed to update podcasts'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
    } finally {
      setUpdating(false)
    }
  }

  const handleAddPodcast = async (feedUrl: string) => {
    try {
      await api.addPodcast(feedUrl)
      await loadPodcasts()
    } catch (error) {
      console.error('Failed to add podcast:', error)
      throw error
    }
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen">
        <div className="max-w-6xl mx-auto p-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">All Podcasts</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage your podcast collection and explore episodes
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Podcast
          </button>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleUpdateAll}
              disabled={updating}
              className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-900 dark:text-gray-100 font-medium px-4 py-2 rounded-lg transition-colors text-sm inline-flex items-center gap-2"
            >
              <svg
                className={`w-4 h-4 ${updating ? 'animate-spin' : ''}`}
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
              {updating ? 'Updating...' : 'Update All'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search podcasts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              style={{ width: '280px' }}
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              style={{ width: '180px' }}
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              style={{ width: '200px' }}
            >
              <option value="name_asc">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
              <option value="updated_desc">Recently Updated</option>
              <option value="episodes_desc">Most Episodes</option>
            </select>
          </div>
        </div>

        <div className={`grid gap-6 ${cardColumns === '2' ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
          {loading ? (
            <div className="col-span-full text-center py-12 text-gray-500">
              Loading podcasts...
            </div>
          ) : podcasts.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-500">
              No podcasts found
            </div>
          ) : (
            (() => {
              const displayPodcasts = paginationMode === 'pagination'
                ? podcasts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                : podcasts

              return displayPodcasts.map((podcast) => (
                <PodcastCard key={podcast.id} podcast={podcast} />
              ))
            })()
          )}
        </div>

        {/* Pagination Controls */}
        {paginationMode === 'pagination' && podcasts.length > 0 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Previous
            </button>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Page {currentPage} of {Math.ceil(podcasts.length / itemsPerPage)}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(Math.ceil(podcasts.length / itemsPerPage), p + 1))}
              disabled={currentPage >= Math.ceil(podcasts.length / itemsPerPage)}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Next
            </button>
          </div>
        )}

        <AddPodcastModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddPodcast}
        />
        </div>
      </div>
    </ProtectedRoute>
  )
}
