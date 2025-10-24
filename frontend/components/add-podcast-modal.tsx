'use client'

import { useState } from 'react'

interface AddPodcastModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (feedUrl: string) => Promise<void>
}

export function AddPodcastModal({ isOpen, onClose, onAdd }: AddPodcastModalProps) {
  const [bulkUrls, setBulkUrls] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'bulk' | 'file'>('bulk')
  const [bulkResults, setBulkResults] = useState<{ url: string; success: boolean; error?: string }[]>([])

  if (!isOpen) return null

  const handleBulkSubmit = async () => {
    const urls = bulkUrls
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0)

    if (urls.length === 0) return

    setLoading(true)
    setBulkResults([])
    const results: { url: string; success: boolean; error?: string }[] = []

    // Show processing toast (z-index higher than modal which is z-50)
    const toast = document.createElement('div')
    toast.id = 'bulk-add-toast'
    toast.className = 'fixed bottom-4 right-4 bg-blue-600 text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3'
    toast.style.zIndex = '9999'
    toast.innerHTML = `
      <svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-width="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
      </svg>
      <span>Adding podcasts: <span id="bulk-progress">0</span>/${urls.length}</span>
    `
    document.body.appendChild(toast)

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i]
      try {
        await onAdd(url)
        results.push({ url, success: true })
      } catch (error) {
        results.push({
          url,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
      setBulkResults([...results])

      // Update progress in toast
      const progressEl = document.getElementById('bulk-progress')
      if (progressEl) {
        progressEl.textContent = String(i + 1)
      }
    }

    setLoading(false)

    // Remove processing toast
    toast.remove()

    // Show completion toast
    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    const completionToast = document.createElement('div')
    completionToast.className = `fixed bottom-4 right-4 ${
      failCount === 0 ? 'bg-green-600' : 'bg-yellow-600'
    } text-white px-6 py-4 rounded-lg shadow-lg`
    completionToast.style.zIndex = '9999'
    completionToast.textContent = `Added ${successCount} podcast${successCount !== 1 ? 's' : ''}${
      failCount > 0 ? `, ${failCount} failed` : ''
    }`
    document.body.appendChild(completionToast)
    setTimeout(() => completionToast.remove(), 3000)

    // Redirect to homepage after a short delay
    setTimeout(() => {
      window.location.href = '/'
    }, 3000)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()

    // Parse CSV or plain text (one URL per line)
    let urls: string[] = []
    if (file.name.endsWith('.csv')) {
      // Simple CSV parsing - assume first column has URLs
      urls = text
        .split('\n')
        .slice(1) // Skip header
        .map(line => line.split(',')[0].trim())
        .filter(url => url.length > 0 && url.startsWith('http'))
    } else {
      // Plain text - one URL per line
      urls = text
        .split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0)
    }

    setBulkUrls(urls.join('\n'))
    setActiveTab('bulk')
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Add Podcast(s)</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('bulk')}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'bulk'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Add Podcasts
          </button>
          <button
            onClick={() => setActiveTab('file')}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'file'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Upload File
          </button>
        </div>

        {/* Add Podcasts Tab */}
        {activeTab === 'bulk' && (
          <div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                RSS Feed URL(s)
              </label>
              <textarea
                value={bulkUrls}
                onChange={(e) => setBulkUrls(e.target.value)}
                placeholder="https://example.com/podcast1/feed.xml&#10;https://example.com/podcast2/feed.xml&#10;https://example.com/podcast3/feed.xml"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 min-h-[200px] font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Paste one or more RSS feed URLs (one per line)
              </p>
            </div>

            {bulkResults.length > 0 && (
              <div className="mb-4 max-h-[200px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <h3 className="text-sm font-semibold mb-2">Results:</h3>
                <div className="space-y-1">
                  {bulkResults.map((result, idx) => (
                    <div key={idx} className="text-xs flex items-start gap-2">
                      {result.success ? (
                        <span className="text-green-600 dark:text-green-400">✓</span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400">✗</span>
                      )}
                      <span className="flex-1 truncate" title={result.url}>
                        {result.url}
                      </span>
                      {result.error && (
                        <span className="text-red-600 dark:text-red-400 text-xs">
                          {result.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleBulkSubmit}
                disabled={loading || !bulkUrls.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {loading ? `Adding... (${bulkResults.length})` : 'Add Podcast(s)'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {bulkResults.length > 0 ? 'Done' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {/* File Upload Tab */}
        {activeTab === 'file' && (
          <div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Upload File
              </label>
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <input
                  type="file"
                  accept=".txt,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors inline-block"
                >
                  Choose File
                </label>
                <p className="text-xs text-gray-500 mt-2">
                  Upload .txt (one URL per line) or .csv (URLs in first column)
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
