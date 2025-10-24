'use client'

import Link from 'next/link'
import { Podcast } from '@/lib/api'
import { getImageUrl } from '@/lib/image-utils'

interface PodcastCardProps {
  podcast: Podcast
}

export function PodcastCard({ podcast }: PodcastCardProps) {
  // Use cached counts from database instead of calculating from episodes array
  const episodeCount = podcast.episode_count ?? podcast.episodes?.length ?? 0
  const processedCount = podcast.processed_count ?? podcast.episodes?.filter(e => e.summary && e.transcription).length ?? 0
  const imageUrl = getImageUrl(podcast.image_url)

  return (
    <Link
      href={`/podcasts/${podcast.id}`}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 hover:shadow-md transition-shadow cursor-pointer block"
    >
      <div className="flex gap-6">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={podcast.title}
            className="w-32 h-32 rounded-lg object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          {podcast.category && (
            <span className="inline-block px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-2">
              {podcast.category}
            </span>
          )}
          <h3 className="text-xl font-bold mb-1 truncate" title={podcast.title}>{podcast.title}</h3>
          {podcast.author && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 truncate" title={podcast.author}>
              {podcast.author}
            </p>
          )}

          <div className="mt-3 space-y-1.5 text-sm text-gray-500">
            {processedCount > 0 && (
              <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
                {processedCount} AI processed
              </div>
            )}
            <div>{episodeCount} episodes</div>
            {podcast.latest_episode_date && (
              <div>Latest: {new Date(podcast.latest_episode_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
