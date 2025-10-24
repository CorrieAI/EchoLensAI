'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface TaskDetail {
  task_id: string
  status: string
  episode_title: string
  podcast_title: string
  current_step: string
  steps: {
    name: string
    status: 'completed' | 'active' | 'pending'
    detail?: string
  }[]
  logs: string[]
  runtime: string
}

export default function TaskDetailPage() {
  const params = useParams()
  const router = useRouter()
  const taskId = params.id as string

  const [task, setTask] = useState<TaskDetail | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [allLogs, setAllLogs] = useState<string[]>([]) // Keep all logs ever received
  const [showLogs, setShowLogs] = useState(false) // Hidden by default
  const [loading, setLoading] = useState(true)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const logsContainerRef = useRef<HTMLPreElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelWithCleanup, setCancelWithCleanup] = useState(false)

  useEffect(() => {
    loadTask()
    loadLogs()
    const interval = setInterval(() => {
      loadTask()
      loadLogs()
    }, 2000)
    return () => clearInterval(interval)
  }, [taskId])

  const loadTask = async () => {
    try {
      // Get detailed task info with step information from Celery
      const response = await fetch(`/api/proxy/api/tasks/${taskId}/detail`)
      const data = await response.json()

      setTask({
        task_id: data.task_id,
        status: data.status,
        episode_title: data.episode_title,
        podcast_title: data.podcast_title,
        current_step: data.current_step,
        steps: data.steps,
        logs: [],
        runtime: '' // Runtime will be calculated from task list
      })

      if (loading) setLoading(false)
    } catch (error) {
      console.error('Failed to load task:', error)
      if (loading) setLoading(false)
    }
  }

  const loadLogs = async () => {
    try {
      const response = await fetch(`/api/proxy/api/tasks/${taskId}/logs`)
      const text = await response.text()
      if (text) {
        const newLogs = text.split('\n').filter(line => line.trim())
        setLogs(newLogs)

        // Append new logs to allLogs (keep all logs ever received)
        setAllLogs(prev => {
          const combined = [...prev, ...newLogs]
          // Remove duplicates while preserving order
          return Array.from(new Set(combined))
        })
      }
    } catch (error) {
      console.error('Failed to load logs:', error)
    }
  }

  // Check if user is scrolled to bottom
  const checkIfAtBottom = () => {
    if (logsContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current
      const atBottom = scrollHeight - scrollTop - clientHeight < 50
      setIsAtBottom(atBottom)
    }
  }

  // Auto-scroll to bottom when new logs arrive if user is at bottom
  useEffect(() => {
    if (isAtBottom && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [allLogs, isAtBottom])

  const handleDownloadLogs = () => {
    const logsText = allLogs.join('\n')
    const blob = new Blob([logsText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `task-${taskId}-logs.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const calculateRuntime = (startedAt: string, completedAt?: string) => {
    const start = new Date(startedAt)
    const end = completedAt ? new Date(completedAt) : new Date()
    const diffMs = end.getTime() - start.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffSecs = Math.floor((diffMs % 60000) / 1000)
    return `${diffMins}m ${diffSecs}s`
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

  const handleCancelClick = (cleanup: boolean) => {
    setCancelWithCleanup(cleanup)
    setShowCancelModal(true)
  }

  const handleCancelConfirm = async () => {
    setShowCancelModal(false)
    setCancelling(true)

    try {
      const response = await fetch(`/api/proxy/api/tasks/${taskId}/cancel?cleanup=${cancelWithCleanup}`, {
        method: 'POST'
      })

      if (response.ok) {
        const data = await response.json()
        showToast(
          cancelWithCleanup ? 'Task cancelled and data cleaned up' : 'Task cancelled',
          'success'
        )

        // Backend creates the notification, no need to do it here
        setTimeout(() => router.push('/tasks'), 1000)
      } else {
        const errorText = await response.text()
        showToast(`Failed to cancel task: ${response.status}`, 'error')
      }
    } catch (error) {
      showToast(`Failed to cancel task: ${error instanceof Error ? error.message : String(error)}`, 'error')
    } finally {
      setCancelling(false)
    }
  }

  if (loading || !task) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading task...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link href="/tasks" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
            ← Back to Tasks
          </Link>
        </div>

        <h1 className="text-3xl font-bold mb-6">Task Status</h1>

        <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          <div>Task ID: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{task.task_id}</code></div>
        </div>

        {/* Episode Info */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="font-semibold text-xl mb-2">{task.podcast_title}</div>
              <div className="text-gray-600 dark:text-gray-400">{task.episode_title}</div>
            </div>
            {/* Cancel buttons - only show for active tasks */}
            {(task.status === 'PROGRESS' || task.status === 'PENDING') && (
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => handleCancelClick(false)}
                  disabled={cancelling}
                  className="px-3 py-1.5 text-sm bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white rounded transition-colors"
                >
                  {cancelling ? 'Cancelling...' : 'Cancel'}
                </button>
                <button
                  onClick={() => handleCancelClick(true)}
                  disabled={cancelling}
                  className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded transition-colors"
                  title="Cancel and delete all data created during this task"
                >
                  {cancelling ? 'Cancelling...' : 'Cancel & Cleanup'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Processing Steps */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="font-semibold text-lg mb-4">Processing Steps</h2>
          <div className="space-y-3">
            {task.steps.map((step, i) => {
              const isCompleted = step.status === 'completed'
              const isActive = step.status === 'active'
              const isPending = step.status === 'pending'

              return (
                <div key={i} className="flex items-center gap-3">
                  {isCompleted && (
                    <>
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" strokeWidth="2"/>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4"/>
                      </svg>
                      <span className="text-green-600 dark:text-green-400">{step.name}</span>
                    </>
                  )}
                  {isActive && (
                    <>
                      <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeWidth="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
                      </svg>
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">{step.name}</span>
                      {step.detail && (
                        <span className="text-xs text-blue-600 dark:text-blue-400">({step.detail})</span>
                      )}
                    </>
                  )}
                  {isPending && (
                    <>
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" strokeWidth="2" opacity="0.3"/>
                      </svg>
                      <span className="text-gray-400 dark:text-gray-600">{step.name}</span>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Developer Logs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Developer Logs</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={handleDownloadLogs}
                disabled={allLogs.length === 0}
                className="text-sm px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors flex items-center gap-2"
                title="Download all logs"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {showLogs ? 'Hide' : 'Show'} Logs
              </button>
            </div>
          </div>
          {showLogs && (
            <pre
              ref={logsContainerRef}
              onScroll={checkIfAtBottom}
              className="bg-gray-900 dark:bg-black text-green-400 p-4 rounded text-xs overflow-x-auto max-h-96 overflow-y-auto"
            >
              {allLogs.length > 0 ? allLogs.join('\n') : 'No logs available'}
              <div ref={logsEndRef} />
            </pre>
          )}
          {showLogs && allLogs.length > 0 && (
            <div className="text-xs text-gray-500 mt-2">
              {allLogs.length} log {allLogs.length === 1 ? 'entry' : 'entries'} • {isAtBottom ? 'Auto-scrolling enabled' : 'Scroll to bottom to enable auto-scroll'}
            </div>
          )}
        </div>

        {/* Cancel Confirmation Modal */}
        {showCancelModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCancelModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start gap-4 mb-4">
                <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${cancelWithCleanup ? 'bg-red-100 dark:bg-red-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
                  <svg className={`w-6 h-6 ${cancelWithCleanup ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-2">
                    {cancelWithCleanup ? 'Cancel Task & Clean Up Data?' : 'Cancel Task?'}
                  </h3>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {cancelWithCleanup ? (
                      <>
                        <p>This will <strong>immediately stop</strong> the task and <strong className="text-red-600 dark:text-red-400">permanently delete</strong>:</p>
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          <li>Transcription data</li>
                          <li>Generated terms and definitions</li>
                          <li>Vector embeddings</li>
                          <li>Summary text and audio</li>
                          <li>Downloaded audio files</li>
                        </ul>
                        <p className="mt-3 font-semibold">This action cannot be undone.</p>
                      </>
                    ) : (
                      <p>
                        This will stop the task but keep any data that has already been processed.
                        You can restart the task later to continue from where it left off.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Keep Running
                </button>
                <button
                  onClick={handleCancelConfirm}
                  className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                    cancelWithCleanup
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-orange-600 hover:bg-orange-700'
                  }`}
                >
                  {cancelWithCleanup ? 'Cancel & Delete Data' : 'Cancel Task'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
