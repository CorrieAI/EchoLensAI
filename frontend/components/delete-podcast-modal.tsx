'use client'

import { Podcast } from '@/lib/api'
import { ConfirmModal } from './confirm-modal'

interface DeletePodcastModalProps {
  isOpen: boolean
  podcast: Podcast | null
  onClose: () => void
  onDelete: () => Promise<void>
}

export function DeletePodcastModal({ isOpen, podcast, onClose, onDelete }: DeletePodcastModalProps) {
  if (!isOpen || !podcast) return null

  const handleConfirm = async () => {
    await onDelete()
  }

  const messageContent = (
    <div className="space-y-4">
      {/* Warning Banner */}
      <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">
            Warning: This action cannot be undone
          </h4>
          <p className="text-sm text-red-700 dark:text-red-300">
            Deleting this podcast will permanently remove all associated data.
          </p>
        </div>
      </div>

      {/* What will be deleted */}
      <div className="space-y-3">
        <p className="text-sm text-gray-700 dark:text-gray-300">The following will be deleted:</p>
        <ul className="space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <svg className="w-4 h-4 text-gray-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span><strong>{podcast.episode_count} episodes</strong> and all episode metadata</span>
          </li>
          {(podcast.processed_count ?? 0) > 0 && (
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 text-gray-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span><strong>All AI-generated content</strong> (transcriptions, summaries, extracted terms)</span>
            </li>
          )}
          <li className="flex items-start gap-2">
            <svg className="w-4 h-4 text-gray-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span><strong>All chat conversations</strong> related to this podcast&apos;s episodes</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-4 h-4 text-gray-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span><strong>Downloaded audio files</strong> (if any)</span>
          </li>
        </ul>
      </div>
    </div>
  )

  return (
    <ConfirmModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      title={`Delete "${podcast.title}"?`}
      message={messageContent}
      confirmText="Delete Permanently"
      cancelText="Cancel"
      type="danger"
    />
  )
}
