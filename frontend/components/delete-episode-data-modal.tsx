'use client'

import { Episode } from '@/lib/api'
import { ConfirmModal } from './confirm-modal'

interface DeleteEpisodeDataModalProps {
  isOpen: boolean
  episode: Episode | null
  onClose: () => void
  onDelete: () => Promise<void>
}

export function DeleteEpisodeDataModal({ isOpen, episode, onClose, onDelete }: DeleteEpisodeDataModalProps) {
  if (!isOpen || !episode) return null

  const handleConfirm = async () => {
    await onDelete()
  }

  const hasAudio = !!episode.local_audio_path
  const hasTranscript = !!episode.transcription
  const hasSummary = !!episode.summary

  const messageContent = (
    <div className="space-y-4">
      {/* Warning Banner */}
      <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">
            This will delete locally stored data
          </h4>
          <p className="text-sm text-red-700 dark:text-red-300">
            The episode will remain in your list, but local files will be removed.
          </p>
        </div>
      </div>

      {/* Episode Info */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {episode.title}
        </p>
      </div>

      {/* What will be deleted */}
      <div className="space-y-3">
        <p className="text-sm text-gray-700 dark:text-gray-300">The following will be deleted:</p>
        <ul className="space-y-2 text-sm">
          {hasAudio && (
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 text-gray-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span><strong>Downloaded audio file</strong></span>
            </li>
          )}
          {hasTranscript && (
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 text-gray-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span><strong>Transcription</strong></span>
            </li>
          )}
          {hasSummary && (
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 text-gray-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span><strong>AI-generated summary, terms, and embeddings</strong></span>
            </li>
          )}
          <li className="flex items-start gap-2">
            <svg className="w-4 h-4 text-gray-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span><strong>All chat conversations</strong> related to this episode</span>
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
      title="Delete Local Data?"
      message={messageContent}
      confirmText="Delete Local Data"
      cancelText="Cancel"
      type="danger"
    />
  )
}
