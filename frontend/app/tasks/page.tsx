'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { api, TaskHistory } from '@/lib/api'
import { ConfirmModal } from '@/components/confirm-modal'

export default function TasksPage() {
  const [tasks, setTasks] = useState<{
    active: TaskHistory[]
    queued: TaskHistory[]
    recent: TaskHistory[]
  }>({
    active: [],
    queued: [],
    recent: [],
  })
  const [loading, setLoading] = useState(true)
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(null)
  const [cancelWithCleanup, setCancelWithCleanup] = useState(false)

  useEffect(() => {
    loadTasks()
    const interval = setInterval(loadTasks, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadTasks = async () => {
    try {
      const data = await api.getTasks()
      setTasks(data)
      if (loading) setLoading(false)
    } catch (error) {
      console.error('Failed to load tasks:', error)
      if (loading) setLoading(false)
    }
  }

  const handleCancelClick = (taskId: string, cleanup: boolean) => {
    setCancellingTaskId(taskId)
    setCancelWithCleanup(cleanup)
    setShowCancelModal(true)
  }

  const handleCancelConfirm = async () => {
    if (!cancellingTaskId) return

    setShowCancelModal(false)

    try {
      const response = await fetch(`/api/proxy/api/tasks/${cancellingTaskId}/cancel?cleanup=${cancelWithCleanup}`, {
        method: 'POST'
      })

      if (response.ok) {
        showToast(
          cancelWithCleanup ? 'Task cancelled and data cleaned up' : 'Task cancelled',
          'success'
        )
        await loadTasks()
      } else {
        showToast(`Failed to cancel task: ${response.status}`, 'error')
      }
    } catch (error) {
      showToast(`Failed to cancel task: ${error instanceof Error ? error.message : String(error)}`, 'error')
    } finally {
      setCancellingTaskId(null)
    }
  }

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    const toast = document.createElement('div')
    const bgColor = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-orange-600'
    toast.className = `fixed bottom-4 right-4 ${bgColor} text-white px-6 py-4 rounded-lg shadow-lg z-50 flex items-center gap-3`

    const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : '⚠'
    toast.innerHTML = `<span class="text-xl">${icon}</span><span>${message}</span>`

    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 4000)
  }

  const handleClearHistory = async () => {
    try {
      await api.clearTaskHistory()
      await loadTasks()

      // Show success toast
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
      toast.textContent = '✓ Task history cleared successfully'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
    } catch (error) {
      console.error('Failed to clear history:', error)

      // Show error toast
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
      toast.textContent = '✗ Failed to clear task history'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      PROGRESS: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
      PENDING: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
      SUCCESS: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
      FAILURE: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
      CANCELLED: 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400',
    }

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.PENDING}`}>
        {status}
      </span>
    )
  }

  const calculateRuntime = (startedAt: string, completedAt?: string) => {
    const start = new Date(startedAt)
    const end = completedAt ? new Date(completedAt) : new Date()
    const diffMs = end.getTime() - start.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffSecs = Math.floor((diffMs % 60000) / 1000)
    return `${diffMins}m ${diffSecs}s`
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (hours > 0) {
      return `${hours}h ${mins}m`
    }
    return `${mins}m`
  }

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const renderTaskRow = (task: TaskHistory, showCancel: boolean = false) => (
    <div
      key={task.id}
      className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-semibold mb-1">{task.podcast?.title || 'Unknown Podcast'}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            {task.episode?.title || task.task_name}
          </div>
          <div className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-500">
            <div className="flex items-center gap-4">
              {task.episode?.duration && (
                <div>Episode: {formatDuration(task.episode.duration)}</div>
              )}
              {task.status === 'PROGRESS' && (
                <div>Runtime: {calculateRuntime(task.started_at)}</div>
              )}
              {task.completed_at && (
                <div>Runtime: {calculateRuntime(task.started_at, task.completed_at)}</div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div>Started: {formatDateTime(task.started_at)}</div>
              {task.completed_at && (
                <div>Finished: {formatDateTime(task.completed_at)}</div>
              )}
            </div>
          </div>
          {task.error_message && (
            <pre className="mt-2 p-2 bg-gray-900 dark:bg-black text-red-400 text-xs rounded overflow-x-auto line-clamp-2">
              {task.error_message}
            </pre>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {getStatusBadge(task.status)}
          <div className="flex gap-2">
            {showCancel && (task.status === 'PROGRESS' || task.status === 'PENDING') && (
              <>
                <button
                  onClick={() => handleCancelClick(task.id, false)}
                  disabled={cancellingTaskId === task.id}
                  className="px-3 py-1 text-xs bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white rounded transition-colors"
                  title="Cancel task"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleCancelClick(task.id, true)}
                  disabled={cancellingTaskId === task.id}
                  className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded transition-colors"
                  title="Cancel and delete all data created during this task"
                >
                  Cancel & Cleanup
                </button>
              </>
            )}
            <Link
              href={`/tasks/${task.id}`}
              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Details
            </Link>
          </div>
        </div>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading tasks...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Processing Tasks</h1>

        {/* Active Tasks */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">
            Active Tasks ({tasks.active.length})
          </h2>
          {tasks.active.length === 0 ? (
            <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              No active tasks
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.active.map((task) => renderTaskRow(task, true))}
            </div>
          )}
        </div>

        {/* Queued Tasks */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">
            Queued Tasks ({tasks.queued.length})
          </h2>
          {tasks.queued.length === 0 ? (
            <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              No queued tasks
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.queued.map((task) => renderTaskRow(task, false))}
            </div>
          )}
        </div>

        {/* Task History */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4 flex items-center justify-between">
            <span>Task History</span>
            <button
              onClick={() => setShowClearHistoryConfirm(true)}
              className="text-sm text-red-600 dark:text-red-400 hover:underline font-normal"
            >
              Clear History
            </button>
          </h2>
          {tasks.recent.length === 0 ? (
            <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              No recent tasks
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.recent.map((task) => renderTaskRow(task, false))}
            </div>
          )}
        </div>
      </div>

      {/* Clear History Confirmation Modal */}
      <ConfirmModal
        isOpen={showClearHistoryConfirm}
        onClose={() => setShowClearHistoryConfirm(false)}
        onConfirm={handleClearHistory}
        title="Clear Task History"
        message="Are you sure you want to clear all completed, failed, and cancelled tasks from history? This action cannot be undone."
        confirmText="Clear History"
        cancelText="Cancel"
        type="warning"
      />

      {/* Cancel Task Confirmation Modal */}
      <ConfirmModal
        isOpen={showCancelModal}
        onClose={() => {
          setShowCancelModal(false)
          setCancellingTaskId(null)
        }}
        onConfirm={handleCancelConfirm}
        title={cancelWithCleanup ? "Cancel Task & Cleanup" : "Cancel Task"}
        message={
          cancelWithCleanup
            ? "Are you sure you want to cancel this task and delete all data created during processing? This will remove any transcriptions, summaries, embeddings, and terms that were generated. This action cannot be undone."
            : "Are you sure you want to cancel this task? Any progress will be lost, but data already created will be kept."
        }
        confirmText={cancelWithCleanup ? "Cancel & Cleanup" : "Cancel Task"}
        cancelText="Keep Running"
        type="danger"
      />
    </div>
  )
}
