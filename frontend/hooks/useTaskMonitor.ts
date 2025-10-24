/**
 * Hook to monitor active tasks and trigger callbacks when tasks complete
 * Polls the tasks API and detects when processing tasks finish
 */

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

interface UseTaskMonitorOptions {
  onTaskComplete?: () => void
  pollInterval?: number
  enabled?: boolean
}

export function useTaskMonitor(options: UseTaskMonitorOptions = {}) {
  const {
    onTaskComplete,
    pollInterval = 3000, // Poll every 3 seconds
    enabled = true
  } = options

  const [hasActiveTasks, setHasActiveTasks] = useState(false)
  const previousActiveTaskIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!enabled) return

    const checkTasks = async () => {
      try {
        const tasks = await api.getTasks()
        const activeTaskIds = new Set([
          ...tasks.active.map(t => t.id),
          ...tasks.queued.map(t => t.id)
        ])

        // Check if any previously active tasks are now complete
        const completedTaskIds = Array.from(previousActiveTaskIds.current).filter(
          id => !activeTaskIds.has(id)
        )

        if (completedTaskIds.length > 0 && onTaskComplete) {
          // Tasks completed, trigger callback
          onTaskComplete()
        }

        // Update state
        setHasActiveTasks(activeTaskIds.size > 0)
        previousActiveTaskIds.current = activeTaskIds
      } catch (error: any) {
        // Silently ignore auth errors (user not logged in)
        if (!error.message?.includes('Not authenticated')) {
          console.error('Failed to check tasks:', error)
        }
      }
    }

    // Initial check
    checkTasks()

    // Set up polling
    const interval = setInterval(checkTasks, pollInterval)

    return () => clearInterval(interval)
  }, [enabled, onTaskComplete, pollInterval])

  return { hasActiveTasks }
}
