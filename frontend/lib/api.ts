const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface Transcription {
  id: string
  episode_id: string
  text: string
  created_at: string
}

export interface Summary {
  id: string
  episode_id: string
  text: string
  audio_path?: string
  created_at: string
}

export interface Episode {
  id: string
  podcast_id: string
  title: string
  description?: string
  audio_url: string
  local_audio_path?: string
  duration?: number
  published_at?: string
  created_at: string
  image_url?: string
  transcription?: Transcription
  summary?: Summary
  podcast?: {
    id: string
    title: string
  }
}

export interface Podcast {
  id: string
  rss_url: string
  title: string
  author?: string
  description?: string
  image_url?: string
  category?: string
  created_at: string
  episodes?: Episode[]
  episode_count?: number
  processed_count?: number
  latest_episode_date?: string
  updated_at?: string
  auto_download?: number  // 0 = disabled, 1 = enabled
  auto_download_limit?: number | null  // NULL = all episodes, N = keep N episodes
}

export interface TaskHistory {
  id: string
  task_id: string
  task_name: string
  status: string
  started_at: string
  completed_at?: string
  episode_id?: string
  podcast_id?: string
  error_message?: string
  episode?: {
    id: string
    title: string
    duration?: number
  }
  podcast?: {
    id: string
    title: string
  }
}

export interface ChatSession {
  id: string
  episode_id: string
  title?: string
  created_at: string
  updated_at: string
  episode?: {
    id: string
    title: string
    podcast?: {
      id: string
      title: string
    }
  }
}

export interface ChatMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface Notification {
  id: string
  type: string
  title: string
  message: string
  level?: string
  task_id?: string
  episode_id?: string
  podcast_id?: string
  read: number
  created_at: string
  time_ago: string
}

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE}${endpoint}`
    const response = await fetch(url, {
      ...options,
      credentials: 'include', // Include cookies for auth
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }))
      throw new Error(errorData.detail || response.statusText)
    }

    return response.json()
  }

  private async optionalRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T | null> {
    const url = `${API_BASE}${endpoint}`
    const response = await fetch(url, {
      ...options,
      credentials: 'include', // Include cookies for auth
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }))
      throw new Error(errorData.detail || response.statusText)
    }

    return response.json()
  }

  // Podcasts
  async getPodcasts(search?: string, sort?: string, category?: string): Promise<Podcast[]> {
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (sort) params.append('sort', sort)
    if (category) params.append('category', category)

    const query = params.toString()
    return this.request(`/api/podcasts${query ? `?${query}` : ''}`)
  }

  async getCategories(): Promise<{ categories: string[] }> {
    return this.request('/api/podcasts/categories')
  }

  async getProcessedPodcasts(search?: string, sort?: string): Promise<Podcast[]> {
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (sort) params.append('sort', sort)

    const query = params.toString()
    return this.request(`/api/podcasts/processed${query ? `?${query}` : ''}`)
  }

  async getProcessedEpisodes(search?: string, sort?: string): Promise<any[]> {
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (sort) params.append('sort', sort)

    const query = params.toString()
    return this.request(`/api/podcasts/episodes/processed${query ? `?${query}` : ''}`)
  }

  async getProcessedEpisodesCount(): Promise<number> {
    const response = await fetch(`${API_BASE}/api/podcasts/episodes/processed/count`)
    const text = await response.text()
    return parseInt(text, 10)
  }

  async semanticSearchEpisodes(query: string, limit?: number): Promise<any[]> {
    const params = new URLSearchParams()
    params.append('query', query)
    if (limit) params.append('limit', limit.toString())

    return this.request(`/api/podcasts/episodes/semantic-search?${params.toString()}`)
  }

  async getPodcast(id: string): Promise<Podcast> {
    return this.request(`/api/podcasts/${id}`)
  }

  async getPodcastStorage(id: string): Promise<{ podcast_id: string; total_bytes: number; formatted_size: string }> {
    return this.request(`/api/podcasts/${id}/storage`)
  }

  async addPodcast(feedUrl: string): Promise<Podcast> {
    return this.request(`/api/podcasts`, {
      method: 'POST',
      body: JSON.stringify({ rss_url: feedUrl }),
    })
  }

  async deletePodcast(id: string): Promise<void> {
    await fetch(`${API_BASE}/api/podcasts/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
  }

  async refreshPodcast(id: string): Promise<void> {
    await fetch(`${API_BASE}/api/podcasts/${id}/refresh`, {
      credentials: "include",
      method: 'POST',
    })
  }

  async refreshAllPodcasts(): Promise<{ updated: number; failed: number }> {
    const response = await fetch(`${API_BASE}/api/podcasts/refresh-all`, {
      credentials: "include",
      method: 'POST',
    })
    if (!response.ok) {
      throw new Error('Failed to refresh podcasts')
    }
    return response.json()
  }

  // Episodes
  async getEpisodes(
    podcastId: string,
    search?: string,
    processedOnly?: boolean
  ): Promise<Episode[]> {
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (processedOnly) params.append('processed_only', 'true')

    const query = params.toString()
    return this.request(
      `/api/podcasts/${podcastId}/episodes${query ? `?${query}` : ''}`
    )
  }

  async getEpisode(id: string): Promise<Episode> {
    return this.request(`/api/podcasts/episodes/${id}`)
  }

  async getEpisodeTranscription(id: string): Promise<{ id: string; text: string } | null> {
    return this.optionalRequest(`/api/podcasts/episodes/${id}/transcription`)
  }

  async getEpisodeSummary(id: string): Promise<{ id: string; text: string } | null> {
    return this.optionalRequest(`/api/podcasts/episodes/${id}/summary`)
  }

  async getEpisodeTerms(id: string, includeHidden: boolean = false): Promise<any[] | null> {
    const params = new URLSearchParams()
    if (includeHidden) params.append('include_hidden', 'true')
    const query = params.toString()
    return this.optionalRequest(`/api/podcasts/episodes/${id}/terms${query ? `?${query}` : ''}`)
  }

  async getHiddenTermsCount(episodeId: string): Promise<{ count: number }> {
    return this.request(`/api/podcasts/episodes/${episodeId}/terms/hidden/count`)
  }

  async hideTerm(termId: string): Promise<{ status: string; hidden: boolean }> {
    const res = await fetch(`${API_BASE}/api/podcasts/terms/${termId}/hide`, {
      credentials: "include",
      method: 'PATCH',
    })
    if (!res.ok) throw new Error('Failed to hide term')
    return res.json()
  }

  async unhideTerm(termId: string): Promise<{ status: string; hidden: boolean }> {
    const res = await fetch(`${API_BASE}/api/podcasts/terms/${termId}/unhide`, {
      credentials: "include",
      method: 'PATCH',
    })
    if (!res.ok) throw new Error('Failed to unhide term')
    return res.json()
  }

  async extractMoreTerms(episodeId: string): Promise<{ task_id: string; status: string }> {
    const res = await fetch(`${API_BASE}/api/podcasts/episodes/${episodeId}/extract-more-terms`, {
      credentials: "include",
      method: 'POST',
    })
    if (!res.ok) throw new Error('Failed to start term extraction')
    return res.json()
  }

  async createTerm(episodeId: string, term: string, context?: string, explanation?: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/podcasts/episodes/${episodeId}/terms`, {
      credentials: "include",
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term, context, explanation })
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'Failed to create term' }))
      throw new Error(error.detail || 'Failed to create term')
    }
    return res.json()
  }

  async getAllProcessingEpisodes(): Promise<{ processing_episode_ids: string[] }> {
    return this.request(`/api/episodes/processing-status/all`)
  }

  async getEpisodeProcessingStatus(id: string): Promise<{ is_processing: boolean; status?: string; task_id?: string }> {
    return this.request(`/api/episodes/${id}/processing-status`)
  }

  async processEpisode(id: string): Promise<void> {
    await fetch(`${API_BASE}/api/episodes/${id}/process`, {
      credentials: "include",
      method: 'POST',
    })
  }

  async downloadEpisodeAudio(podcastId: string, episodeId: string): Promise<{ message: string; path: string }> {
    const res = await fetch(`${API_BASE}/api/podcasts/${podcastId}/episodes/${episodeId}/download`, {
      credentials: "include",
      method: 'POST',
    })
    if (!res.ok) throw new Error('Failed to download episode audio')
    return res.json()
  }

  async deleteEpisodeLocalData(podcastId: string, episodeId: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/api/podcasts/${podcastId}/episodes/${episodeId}/local-data`, {
      credentials: "include",
      method: 'DELETE',
    })
    if (!res.ok) throw new Error('Failed to delete episode local data')
    return res.json()
  }

  async bulkProcessEpisodes(
    podcastId: string,
    episodeIds: string[]
  ): Promise<void> {
    const formData = new FormData()
    formData.append('episode_ids', episodeIds.join(','))

    await fetch(`${API_BASE}/api/podcasts/${podcastId}/episodes/bulk-process`, {
      credentials: "include",
      method: 'POST',
      body: formData,
    })
  }

  // Tasks
  async getTasks(): Promise<{
    active: TaskHistory[]
    queued: TaskHistory[]
    recent: TaskHistory[]
  }> {
    return this.request('/api/tasks')
  }

  async cancelTask(taskId: string): Promise<void> {
    await fetch(`${API_BASE}/api/tasks/${taskId}/cancel`, {
      credentials: "include",
      method: 'POST',
    })
  }

  async clearTaskHistory(): Promise<void> {
    await fetch(`${API_BASE}/api/tasks/clear-history`, {
      credentials: "include",
      method: 'POST',
    })
  }

  async cleanupOrphanedTasks(): Promise<{ status: string; cleaned: number; checked: number }> {
    const res = await fetch(`${API_BASE}/api/tasks/cleanup-orphaned`, {
      credentials: "include",
      method: 'POST',
    })
    if (!res.ok) throw new Error('Failed to cleanup orphaned tasks')
    return res.json()
  }

  async getTaskStatus(taskId: string): Promise<TaskHistory> {
    return this.request(`/api/tasks/${taskId}/detail`)
  }

  // Chat
  async getChatSessions(): Promise<ChatSession[]> {
    return this.request('/api/chat/sessions')
  }

  async getEpisodeChatSession(episodeId: string): Promise<{ id: string } | null> {
    return this.optionalRequest(`/api/chat/episodes/${episodeId}/session`)
  }

  async getChatSession(sessionId: string): Promise<{
    session: ChatSession
    messages: ChatMessage[]
  }> {
    return this.request(`/api/chat/sessions/${sessionId}`)
  }

  async sendChatMessage(
    episodeId: string,
    message: string,
    sessionId?: string
  ): Promise<{
    session_id: string
    response: string
  }> {
    const formData = new FormData()
    formData.append('message', message)
    if (sessionId) formData.append('session_id', sessionId)

    const response = await fetch(
      `${API_BASE}/api/chat/episodes/${episodeId}/message`,
      {
      credentials: "include",
        method: 'POST',
        body: formData,
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`)
    }

    return response.json()
  }

  // Notifications
  async getNotifications(): Promise<{
    notifications: Notification[]
    unread_count: number
  }> {
    return this.request('/api/notifications')
  }

  async markNotificationRead(id: string): Promise<void> {
    await fetch(`${API_BASE}/api/notifications/${id}/read`, {
      credentials: "include",
      method: 'POST',
    })
  }

  async markAllNotificationsRead(): Promise<void> {
    await fetch(`${API_BASE}/api/notifications/read-all`, {
      credentials: "include",
      method: 'POST',
    })
  }

  async uploadPodcastImage(podcastId: string, file: File): Promise<{ image_url: string }> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`${API_BASE}/api/podcasts/${podcastId}/upload-image`, {
      credentials: "include",
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to upload image')
    }

    return response.json()
  }

  async updateAutoDownloadSettings(podcastId: string, autoDownload: number, autoDownloadLimit: number | null): Promise<{ status: string }> {
    const res = await fetch(`${API_BASE}/api/podcasts/${podcastId}/auto-download-settings`, {
      credentials: "include",
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auto_download: autoDownload,
        auto_download_limit: autoDownloadLimit
      })
    })
    if (!res.ok) throw new Error('Failed to update auto-download settings')
    return res.json()
  }

  // Playback Progress
  async getPlaybackProgress(podcastId: string, episodeId: string): Promise<{ current_time: number; last_updated?: string }> {
    return this.request(`/api/podcasts/${podcastId}/episodes/${episodeId}/playback-progress`)
  }

  async savePlaybackProgress(podcastId: string, episodeId: string, currentTime: number): Promise<void> {
    await fetch(`${API_BASE}/api/podcasts/${podcastId}/episodes/${episodeId}/playback-progress`, {
      credentials: "include",
      method: 'POST',
      body: JSON.stringify({ current_time: Math.floor(currentTime) }),
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  async deletePlaybackProgress(podcastId: string, episodeId: string): Promise<void> {
    await fetch(`${API_BASE}/api/podcasts/${podcastId}/episodes/${episodeId}/playback-progress`, {
      credentials: "include",
      method: 'DELETE',
    })
  }

  async getSystemInfo(): Promise<{
    database_size: number
    uploads_size: number
    exports_size: number
    logs_size: number
    total_size: number
    version: string
  }> {
    return this.request('/api/settings/system-info')
  }

  // User Management (Admin only)
  async getUsers(skip: number = 0, limit: number = 100): Promise<{
    users: Array<{
      id: string
      email: string
      is_admin: boolean
      is_active: boolean
      created_at: string
      last_login: string | null
    }>
    total: number
  }> {
    return this.request(`/api/admin/users?skip=${skip}&limit=${limit}`)
  }

  async getUser(userId: string): Promise<{
    id: string
    email: string
    is_admin: boolean
    is_active: boolean
    created_at: string
    last_login: string | null
  }> {
    return this.request(`/api/admin/users/${userId}`)
  }

  async updateUser(userId: string, data: {
    is_admin?: boolean
    is_active?: boolean
  }): Promise<{
    id: string
    email: string
    is_admin: boolean
    is_active: boolean
    created_at: string
    last_login: string | null
  }> {
    const res = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
      credentials: "include",
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.detail || 'Failed to update user')
    }
    return res.json()
  }

  async deleteUser(userId: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
      credentials: "include",
      method: 'DELETE'
    })
    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.detail || 'Failed to delete user')
    }
    return res.json()
  }

  async resetUserPassword(userId: string, newPassword: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/api/admin/users/${userId}/reset-password`, {
      credentials: "include",
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: newPassword })
    })
    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.detail || 'Failed to reset password')
    }
    return res.json()
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/api/auth/change-password`, {
      credentials: "include",
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword
      })
    })
    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.detail || 'Failed to change password')
    }
    return res.json()
  }

  async changeEmail(password: string, newEmail: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/api/auth/change-email`, {
      credentials: "include",
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: password,
        new_email: newEmail
      })
    })
    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.detail || 'Failed to change email')
    }
    return res.json()
  }
}

export const api = new ApiClient()

