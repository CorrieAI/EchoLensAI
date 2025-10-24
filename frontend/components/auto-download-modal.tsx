'use client'

import { useState } from 'react'
import { Podcast } from '@/lib/api'

interface AutoDownloadModalProps {
  isOpen: boolean
  podcast: Podcast | null
  onClose: () => void
  onSave: (autoDownload: number, autoDownloadLimit: number | null) => Promise<void>
}

export function AutoDownloadModal({ isOpen, podcast, onClose, onSave }: AutoDownloadModalProps) {
  const [autoDownload, setAutoDownload] = useState(podcast?.auto_download || 0)
  const [autoDownloadLimit, setAutoDownloadLimit] = useState<number | null>(
    podcast?.auto_download_limit === undefined ? null : podcast.auto_download_limit
  )
  const [saving, setSaving] = useState(false)

  if (!isOpen || !podcast) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(autoDownload, autoDownloadLimit)
      onClose()
    } catch (error) {
      console.error('Failed to save auto-download settings:', error)
    } finally {
      setSaving(false)
    }
  }

  const downloadedCount = podcast.episodes?.filter(e => e.local_audio_path && !e.transcription).length || 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">Auto-Download Settings</h2>

        <div className="space-y-4 mb-6">
          {/* Info Banner */}
          <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">
                About Downloading
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Episodes can be streamed without downloading. Downloading stores audio files locally and uses additional storage space on your EchoLens host.
              </p>
            </div>
          </div>

          {/* Downloaded Count */}
          {downloadedCount > 0 && (
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <span className="text-sm text-gray-700 dark:text-gray-300">Currently downloaded</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {downloadedCount} {downloadedCount === 1 ? 'episode' : 'episodes'}
              </span>
            </div>
          )}

          {/* Auto-Download Toggle */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <input
                type="checkbox"
                checked={autoDownload === 1}
                onChange={(e) => setAutoDownload(e.target.checked ? 1 : 0)}
                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Auto-download new episodes
                </span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                  Automatically download episodes when RSS feed refreshes
                </p>
              </div>
            </label>

            {/* Episode Limit Dropdown */}
            {autoDownload === 1 && (
              <div className="ml-8 space-y-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Keep episodes:
                </label>
                <select
                  value={autoDownloadLimit === null ? 'all' : String(autoDownloadLimit)}
                  onChange={(e) => setAutoDownloadLimit(e.target.value === 'all' ? null : parseInt(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="5">Last 5 episodes</option>
                  <option value="10">Last 10 episodes</option>
                  <option value="25">Last 25 episodes</option>
                  <option value="50">Last 50 episodes</option>
                  <option value="all">All episodes</option>
                </select>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Older episodes will be automatically deleted when limit is exceeded
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-gray-100 font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
