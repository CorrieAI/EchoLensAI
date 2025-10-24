'use client'

import { useState, useEffect } from 'react'
import { ProtectedRoute } from '@/components/protected-route'
import { ConfirmModal } from '@/components/confirm-modal'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'

interface ExportFile {
  filename: string
  size: number
  type: string
  created: string
}

interface User {
  id: string
  email: string
  is_admin: boolean
  is_active: boolean
  created_at: string
  last_login: string | null
}

export default function AdminPage() {
  const { user: currentUser, loading: authLoading } = useAuth()

  // User Management
  const [users, setUsers] = useState<User[]>([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [showDeleteUserConfirm, setShowDeleteUserConfirm] = useState<User | null>(null)
  const [showResetPasswordModal, setShowResetPasswordModal] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [userActionStatus, setUserActionStatus] = useState('')
  const [requireApproval, setRequireApproval] = useState(true)
  const [approvalStatus, setApprovalStatus] = useState('')
  const [importingUsers, setImportingUsers] = useState(false)
  const [showImportResults, setShowImportResults] = useState(false)
  const [importResults, setImportResults] = useState<{
    total_rows: number
    created: number
    skipped: number
    errors: string[]
    created_users: string[]
    skipped_users: string[]
  } | null>(null)

  const [exports, setExports] = useState<ExportFile[]>([])
  const [includeAudio, setIncludeAudio] = useState(false)
  const [exportEstimate, setExportEstimate] = useState<any>(null)
  const [exportStatus, setExportStatus] = useState('')
  const [exportTaskId, setExportTaskId] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState<{step: string, progress: number} | null>(null)
  const [importing, setImporting] = useState(false)
  const [importModal, setImportModal] = useState<{
    show: boolean
    status: 'uploading' | 'processing' | 'success' | 'error'
    currentStep: string
    progress: number
    steps: {
      uploading: boolean
      extracting: boolean
      preparing: boolean
      restoring: boolean
      files: boolean
      validating: boolean
    }
    warnings?: any[]
    warningMessage?: string
    errorMessage?: string
  }>({
    show: false,
    status: 'uploading',
    currentStep: 'Uploading file...',
    progress: 0,
    steps: {
      uploading: false,
      extracting: false,
      preparing: false,
      restoring: false,
      files: false,
      validating: false
    }
  })
  const [refreshTime, setRefreshTime] = useState('00:00')
  const [refreshStatus, setRefreshStatus] = useState('')
  const [previousExportCount, setPreviousExportCount] = useState(0)

  // Confirm modals
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [showDeleteExportConfirm, setShowDeleteExportConfirm] = useState<string | null>(null)
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null)

  // System info
  const [systemInfo, setSystemInfo] = useState<any>(null)

  // AI Prompts
  const [prompts, setPrompts] = useState<any>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('summarization')
  const [editingPrompt, setEditingPrompt] = useState<{key: string, content: string} | null>(null)
  const [promptStatus, setPromptStatus] = useState('')

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<{
    users: boolean
    refresh: boolean
    rss: boolean
    export: boolean
    import: boolean
    prompts: boolean
    system: boolean
  }>({
    users: true, // User management expanded by default
    refresh: false,
    rss: false,
    export: false,
    import: false,
    prompts: false,
    system: false,
  })

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  // User Management Functions
  const loadUsers = async () => {
    try {
      setLoadingUsers(true)
      const data = await api.getUsers()
      setUsers(data.users)
      setTotalUsers(data.total)
      console.log('Current user ID:', currentUser?.id)
      console.log('Loaded users:', data.users.map(u => ({ id: u.id, email: u.email })))
    } catch (error) {
      console.error('Failed to load users:', error)
    } finally {
      setLoadingUsers(false)
    }
  }

  const handleToggleAdmin = async (user: User) => {
    try {
      await api.updateUser(user.id, { is_admin: !user.is_admin })
      setUserActionStatus(`✓ ${user.email} ${!user.is_admin ? 'promoted to' : 'removed from'} admin`)
      setTimeout(() => setUserActionStatus(''), 3000)
      loadUsers()
    } catch (error: any) {
      setUserActionStatus(`✗ ${error.message}`)
      setTimeout(() => setUserActionStatus(''), 5000)
    }
  }

  const handleToggleActive = async (user: User) => {
    try {
      await api.updateUser(user.id, { is_active: !user.is_active })
      setUserActionStatus(`✓ ${user.email} ${!user.is_active ? 'activated' : 'deactivated'}`)
      setTimeout(() => setUserActionStatus(''), 3000)
      loadUsers()
    } catch (error: any) {
      setUserActionStatus(`✗ ${error.message}`)
      setTimeout(() => setUserActionStatus(''), 5000)
    }
  }

  const handleDeleteUser = async (user: User) => {
    try {
      await api.deleteUser(user.id)
      setUserActionStatus(`✓ User ${user.email} deleted successfully`)
      setTimeout(() => setUserActionStatus(''), 3000)
      setShowDeleteUserConfirm(null)
      loadUsers()
    } catch (error: any) {
      setUserActionStatus(`✗ ${error.message}`)
      setTimeout(() => setUserActionStatus(''), 5000)
    }
  }

  const handleResetPassword = async () => {
    if (!showResetPasswordModal || !newPassword) return

    if (newPassword.length < 8) {
      setUserActionStatus('✗ Password must be at least 8 characters')
      setTimeout(() => setUserActionStatus(''), 5000)
      return
    }

    try {
      const result = await api.resetUserPassword(showResetPasswordModal.id, newPassword)
      setUserActionStatus(`✓ ${result.message}`)
      setTimeout(() => setUserActionStatus(''), 5000)
      setShowResetPasswordModal(null)
      setNewPassword('')
    } catch (error: any) {
      setUserActionStatus(`✗ ${error.message}`)
      setTimeout(() => setUserActionStatus(''), 5000)
    }
  }

  const loadRequireApproval = async () => {
    try {
      const response = await fetch('/api/proxy/api/settings/require-user-approval')
      if (response.ok) {
        const data = await response.json()
        setRequireApproval(data.require_approval)
      }
    } catch (error) {
      console.error('Failed to load user approval setting:', error)
    }
  }

  const handleToggleRequireApproval = async () => {
    try {
      const response = await fetch('/api/proxy/api/settings/require-user-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ require_approval: !requireApproval })
      })

      if (response.ok) {
        setRequireApproval(!requireApproval)
        setApprovalStatus(`✓ User approval ${!requireApproval ? 'enabled' : 'disabled'}`)
        setTimeout(() => setApprovalStatus(''), 3000)
      } else {
        throw new Error('Failed to update setting')
      }
    } catch (error: any) {
      setApprovalStatus(`✗ ${error.message}`)
      setTimeout(() => setApprovalStatus(''), 5000)
    }
  }

  const handleImportUsers = async (file: File) => {
    setImportingUsers(true)
    setUserActionStatus('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/proxy/api/admin/users/import-csv', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Import failed')
      }

      const results = await response.json()
      setImportResults(results)
      setShowImportResults(true)

      // Reload user list
      loadUsers()

      // Show summary status
      setUserActionStatus(`✓ Import complete: ${results.created} created, ${results.skipped} skipped`)
      setTimeout(() => setUserActionStatus(''), 5000)
    } catch (error: any) {
      setUserActionStatus(`✗ ${error.message}`)
      setTimeout(() => setUserActionStatus(''), 5000)
    } finally {
      setImportingUsers(false)
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      handleImportUsers(file)
      // Reset input
      event.target.value = ''
    }
  }

  useEffect(() => {
    // Only load data if user is authenticated and is admin
    if (currentUser && !authLoading && currentUser.is_admin) {
      loadUsers()
      loadRequireApproval()
      loadExportEstimate()
      loadExports()
      loadRefreshSchedule()
      loadSystemInfo()
      loadPrompts()
      checkForRunningExport()
    }

    const interval = setInterval(() => {
      if (currentUser && currentUser.is_admin) {
        loadExports()
        if (exportTaskId) {
          checkExportProgress(exportTaskId)
        }
      }
    }, 2000) // Poll every 2 seconds
    return () => clearInterval(interval)
  }, [exportTaskId, currentUser, authLoading])

  const checkForRunningExport = async () => {
    try {
      // Check localStorage for a saved export task ID
      const savedTaskId = localStorage.getItem('export_task_id')

      if (savedTaskId) {
        // Verify the task is still running by checking Celery
        const response = await fetch(`/api/proxy/api/tasks/${savedTaskId}/detail`)
        if (response.ok) {
          const data = await response.json()

          // If still in progress, restore the task
          if (data.status === 'PROGRESS' || data.status === 'PENDING') {
            setExportTaskId(savedTaskId)
            setExportProgress({ step: 'Resuming...', progress: 0 })
          } else {
            // Task completed or failed, clear localStorage
            localStorage.removeItem('export_task_id')
          }
        } else {
          // Task not found, clear localStorage
          localStorage.removeItem('export_task_id')
        }
      }
    } catch (error) {
      console.error('Failed to check for running export:', error)
      localStorage.removeItem('export_task_id')
    }
  }

  // Show toast when new export appears
  useEffect(() => {
    if (exports.length > previousExportCount && previousExportCount > 0) {
      // New export was created, show toast
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-4 rounded-lg shadow-lg z-50'
      toast.textContent = '✓ Export completed successfully!'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
    }
    setPreviousExportCount(exports.length)
  }, [exports])

  const loadExportEstimate = async () => {
    try {
      const response = await fetch('/api/proxy/api/settings/export-estimate')
      const data = await response.json()
      setExportEstimate(data)
    } catch (error) {
      console.error('Failed to load export estimate:', error)
    }
  }

  const loadExports = async () => {
    try {
      const response = await fetch('/api/proxy/api/settings/export/list')
      const data = await response.json()
      setExports(data.exports || [])
    } catch (error) {
      console.error('Failed to load exports:', error)
    }
  }

  const loadRefreshSchedule = async () => {
    try {
      const response = await fetch('/api/proxy/api/settings/refresh-schedule')
      const data = await response.json()
      setRefreshTime(data.refresh_time || '00:00')
    } catch (error) {
      console.error('Failed to load refresh schedule:', error)
    }
  }

  const loadSystemInfo = async () => {
    try {
      const response = await fetch('/api/proxy/api/settings/system-info')
      const data = await response.json()
      setSystemInfo(data)
    } catch (error) {
      console.error('Failed to load system info:', error)
    }
  }

  const loadPrompts = async () => {
    try {
      const response = await fetch('/api/proxy/api/settings/prompts')
      const data = await response.json()
      setPrompts(data)
      // Set first category as default if available
      if (data && Object.keys(data).length > 0) {
        setSelectedCategory(Object.keys(data)[0])
      }
    } catch (error) {
      console.error('Failed to load prompts:', error)
    }
  }

  const handleUpdatePrompt = async (key: string, content: string) => {
    setPromptStatus('Saving...')
    try {
      const response = await fetch(`/api/proxy/api/settings/prompts/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      })
      if (!response.ok) throw new Error('Update failed')
      setPromptStatus('✓ Prompt saved successfully!')
      setTimeout(() => setPromptStatus(''), 3000)
      setEditingPrompt(null)
      await loadPrompts()
    } catch (error) {
      setPromptStatus('✗ Failed to save: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  const handleResetPrompt = async (key: string) => {
    setPromptStatus('Resetting...')
    try {
      const response = await fetch(`/api/proxy/api/settings/prompts/${key}/reset`, {
        method: 'POST'
      })
      if (!response.ok) throw new Error('Reset failed')
      setPromptStatus('✓ Prompt reset to default!')
      setTimeout(() => setPromptStatus(''), 3000)
      setEditingPrompt(null)
      await loadPrompts()
    } catch (error) {
      setPromptStatus('✗ Failed to reset: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  const handleUpdateRefreshTime = async () => {
    setRefreshStatus('Updating...')
    try {
      const response = await fetch(`/api/proxy/api/settings/refresh-schedule?refresh_time=${encodeURIComponent(refreshTime)}`, {
        method: 'POST'
      })
      if (!response.ok) throw new Error('Update failed')
      setRefreshStatus('✓ Schedule updated! Podcasts will refresh daily at ' + refreshTime)
      setTimeout(() => setRefreshStatus(''), 5000)
    } catch (error) {
      setRefreshStatus('✗ Update failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const checkExportProgress = async (taskId: string) => {
    try {
      const response = await fetch(`/api/proxy/api/tasks/${taskId}/detail`)
      if (!response.ok) return
      const data = await response.json()

      if (data.status === 'PROGRESS' && data.progress) {
        setExportProgress({
          step: data.progress.step || 'Processing...',
          progress: data.progress.progress || 0
        })
      } else if (data.status === 'SUCCESS') {
        setExportProgress(null)
        setExportTaskId(null)
        localStorage.removeItem('export_task_id')
        setExportStatus('✓ Export completed successfully!')
        setTimeout(() => setExportStatus(''), 3000)
        loadExports()
      } else if (data.status === 'FAILURE') {
        setExportProgress(null)
        setExportTaskId(null)
        localStorage.removeItem('export_task_id')
        setExportStatus('✗ Export failed: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Failed to check export progress:', error)
    }
  }

  const handleExport = async () => {
    setExportStatus('Starting export...')
    setExportProgress(null)
    try {
      const response = await fetch(`/api/proxy/api/settings/export?include_audio=${includeAudio}`, {
        method: 'POST'
      })
      if (!response.ok) throw new Error('Export failed')
      const data = await response.json()
      setExportTaskId(data.task_id)
      localStorage.setItem('export_task_id', data.task_id)
      setExportStatus(`✓ ${data.message || 'Export started!'}`)
      setExportProgress({ step: 'Starting...', progress: 0 })
    } catch (error) {
      setExportStatus('✗ Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  const handleImportClick = (file: File) => {
    setPendingImportFile(file)
    setShowImportConfirm(true)
  }

  const handleImport = async () => {
    if (!pendingImportFile) return

    setImporting(true)
    setImportModal({
      show: true,
      status: 'uploading',
      currentStep: 'Uploading file...',
      progress: 0,
      steps: {
        uploading: false,
        extracting: false,
        preparing: false,
        restoring: false,
        files: false,
        validating: false
      }
    })

    const formData = new FormData()
    formData.append('file', pendingImportFile)

    try {
      // Upload file and start background task
      const response = await fetch('/api/proxy/api/settings/import', {
        method: 'POST',
        body: formData
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Import failed')

      const taskId = result.task_id

      // Mark upload as complete
      setImportModal(prev => ({
        ...prev,
        steps: { ...prev.steps, uploading: true }
      }))

      // Poll for progress
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/proxy/api/settings/import/status/${taskId}`)
          const status = await statusRes.json()

          if (status.state === 'PROGRESS') {
            const progress = status.progress || 0
            const step = status.step || 'Processing...'

            // Map step names to checkbox states
            const steps = {
              uploading: true,
              extracting: step.includes('Extracting') || progress > 10,
              preparing: step.includes('Preparing') || step.includes('database') || progress > 40,
              restoring: step.includes('Restoring') || step.includes('SQL') || progress > 60,
              files: step.includes('files') || progress > 80,
              validating: step.includes('Validating') || progress > 90
            }

            setImportModal({
              show: true,
              status: 'processing',
              currentStep: step,
              progress,
              steps
            })
          } else if (status.state === 'SUCCESS') {
            clearInterval(pollInterval)
            const resultData = status.result || {}

            setImportModal({
              show: true,
              status: 'success',
              currentStep: 'Import completed successfully!',
              progress: 100,
              steps: {
                uploading: true,
                extracting: true,
                preparing: true,
                restoring: true,
                files: true,
                validating: true
              },
              warnings: resultData.dimension_warnings,
              warningMessage: resultData.warning_message
            })

            setImporting(false)

            // Auto-reload after 3 seconds if no warnings
            if (!resultData.dimension_warnings || resultData.dimension_warnings.length === 0) {
              setTimeout(() => window.location.reload(), 3000)
            }
          } else if (status.state === 'FAILURE') {
            clearInterval(pollInterval)
            setImportModal(prev => ({
              ...prev,
              status: 'error',
              currentStep: 'Import failed',
              errorMessage: status.error || 'Unknown error'
            }))
            setImporting(false)
          } else if (status.state === 'PENDING') {
            setImportModal(prev => ({
              ...prev,
              status: 'processing',
              currentStep: 'Waiting to start...'
            }))
          }
        } catch (pollError) {
          console.error('Error polling import status:', pollError)
        }
      }, 1000) // Poll every second

      // Cleanup on unmount or timeout (10 minutes max)
      setTimeout(() => clearInterval(pollInterval), 600000)

    } catch (error) {
      setImportModal(prev => ({
        ...prev,
        status: 'error',
        currentStep: 'Upload failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error occurred'
      }))
      setImporting(false)
    }
  }

  return (
    <ProtectedRoute requireAdmin={true}>
      <div className="max-w-4xl mx-auto p-8">
        <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">Manage users and system settings</p>

        {/* User Management Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
          <button
            onClick={() => toggleSection('users')}
            className="w-full p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <h2 className="text-xl font-semibold">User Management</h2>
            </div>
            <svg
              className={`w-5 h-5 transition-transform ${expandedSections.users ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expandedSections.users && (
            <div className="px-6 pb-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                View and manage user accounts, permissions, and activity
              </p>

              {/* Require User Approval Setting */}
              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">
                        Require Admin Approval for New Users
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {requireApproval
                        ? 'New user registrations require admin approval before they can log in.'
                        : 'New users can log in immediately after registration without approval.'}
                    </p>
                  </div>
                  <button
                    onClick={handleToggleRequireApproval}
                    className={`ml-4 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      requireApproval
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-gray-600 hover:bg-gray-700 text-white'
                    }`}
                  >
                    {requireApproval ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                {approvalStatus && (
                  <div className={`mt-2 text-sm ${approvalStatus.startsWith('✓') ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                    {approvalStatus}
                  </div>
                )}
              </div>

              {/* Import Users from CSV */}
              <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">
                        Import Users from CSV
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Upload a CSV file with format: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">email,password</code> (one user per line, no header)
                    </p>
                  </div>
                  <label className="ml-4 cursor-pointer">
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleFileSelect}
                      disabled={importingUsers}
                    />
                    <div className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      importingUsers
                        ? 'bg-gray-400 cursor-not-allowed text-white'
                        : 'bg-purple-600 hover:bg-purple-700 text-white'
                    }`}>
                      {importingUsers ? 'Importing...' : 'Choose File'}
                    </div>
                  </label>
                </div>
              </div>

              {userActionStatus && (
                <div className={`mb-4 p-3 rounded-lg text-sm ${
                  userActionStatus.startsWith('✓')
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                }`}>
                  {userActionStatus}
                </div>
              )}

              {loadingUsers ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : users.length === 0 ? (
                <div className="p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400">No users found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {totalUsers} user{totalUsers !== 1 ? 's' : ''} total
                    </span>
                  </div>

                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/50"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {user.email}
                            </span>
                            {user.id === currentUser?.id && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                You
                              </span>
                            )}
                            {user.is_admin && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                                Admin
                              </span>
                            )}
                            {!user.is_active && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                                Inactive
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                            <div>Created: {new Date(user.created_at).toLocaleDateString()}</div>
                            {user.last_login && (
                              <div>Last login: {new Date(user.last_login).toLocaleString()}</div>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          {/* Toggle Admin */}
                          <button
                            onClick={() => handleToggleAdmin(user)}
                            disabled={user.id === currentUser?.id}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              user.id === currentUser?.id
                                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                                : user.is_admin
                                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                                : 'bg-gray-600 hover:bg-gray-700 text-white'
                            }`}
                            title={user.id === currentUser?.id ? 'Cannot modify your own admin status' : user.is_admin ? 'Remove admin' : 'Make admin'}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                          </button>

                          {/* Toggle Active */}
                          <button
                            onClick={() => handleToggleActive(user)}
                            disabled={user.id === currentUser?.id}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              user.id === currentUser?.id
                                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                                : user.is_active
                                ? 'bg-green-600 hover:bg-green-700 text-white'
                                : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                            }`}
                            title={user.id === currentUser?.id ? 'Cannot deactivate yourself' : user.is_active ? 'Deactivate user' : 'Activate user'}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              {user.is_active ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              )}
                            </svg>
                          </button>

                          {/* Reset Password */}
                          <button
                            onClick={() => setShowResetPasswordModal(user)}
                            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors"
                            title="Reset password"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                          </button>

                          {/* Delete User */}
                          <button
                            onClick={() => setShowDeleteUserConfirm(user)}
                            disabled={user.id === currentUser?.id}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              user.id === currentUser?.id
                                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                                : 'bg-red-600 hover:bg-red-700 text-white'
                            }`}
                            title={user.id === currentUser?.id ? 'Cannot delete yourself' : 'Delete user'}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scheduled Refresh Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
          <button
            onClick={() => toggleSection('refresh')}
            className="w-full p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-xl font-semibold">Scheduled Podcast Refresh</h2>
            </div>
            <svg
              className={`w-5 h-5 transition-transform ${expandedSections.refresh ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expandedSections.refresh && (
            <div className="px-6 pb-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Automatically refresh all podcasts daily at a specific time (server timezone)
              </p>

              <div className="flex items-center gap-3">
            <input
              type="time"
              value={refreshTime}
              onChange={(e) => setRefreshTime(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
            />
            <button
              onClick={handleUpdateRefreshTime}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
            >
              Update Schedule
            </button>
          </div>

          {refreshStatus && (
            <div className={`mt-3 text-sm ${refreshStatus.startsWith('✓') ? 'text-green-600' : refreshStatus.startsWith('✗') ? 'text-red-600' : 'text-gray-600'}`}>
              {refreshStatus}
            </div>
          )}

              <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                Current schedule: Daily refresh at {refreshTime}
              </div>
            </div>
          )}
        </div>

        {/* Export RSS Links Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
          <button
            onClick={() => toggleSection('rss')}
            className="w-full p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <h2 className="text-xl font-semibold">Export RSS Links</h2>
            </div>
            <svg
              className={`w-5 h-5 transition-transform ${expandedSections.rss ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expandedSections.rss && (
            <div className="px-6 pb-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Download all podcast RSS feed URLs as a text file (one per line)
              </p>

              <a
                href="/api/proxy/api/settings/export-rss-links"
                download="rss.txt"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download RSS Links
              </a>
            </div>
          )}
        </div>

        {/* Export Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
          <button
            onClick={() => toggleSection('export')}
            className="w-full p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <h2 className="text-xl font-semibold">Export Data</h2>
            </div>
            <svg
              className={`w-5 h-5 transition-transform ${expandedSections.export ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expandedSections.export && (
            <div className="px-6 pb-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Creates a complete PostgreSQL database backup using pg_dump. Includes all podcasts, episodes, transcriptions, embeddings, terms, summaries, chats, settings, and database structure. Optionally includes audio files.
              </p>

              <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeAudio}
                onChange={(e) => setIncludeAudio(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Include audio files (significantly increases file size)</span>
            </label>

            {exportEstimate && (
              <div className="text-sm p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                <div className="font-semibold mb-2">Estimated Export Size</div>

                {/* Database breakdown */}
                <div className="text-xs mb-3">
                  <div className="font-medium mb-1 text-gray-700 dark:text-gray-300">Database Contents:</div>
                  <div className="pl-2 space-y-0.5 text-gray-600 dark:text-gray-400">
                    <div>• {exportEstimate.podcast_count} podcast feeds</div>
                    <div>• {exportEstimate.episode_count} episodes</div>
                    <div>• {exportEstimate.transcription_count} transcriptions</div>
                    <div>• {exportEstimate.vector_count} AI embeddings</div>
                    <div>• {exportEstimate.term_count} extracted terms</div>
                    <div className="pt-1 font-medium text-gray-700 dark:text-gray-300">
                      SQL Dump: {formatBytes(exportEstimate.metadata_size)}
                    </div>
                  </div>
                </div>

                {/* Audio breakdown */}
                {includeAudio && (
                  <div className="text-xs mb-2">
                    <div className="font-medium mb-1 text-gray-700 dark:text-gray-300">Audio Files:</div>
                    <div className="pl-2 space-y-0.5 text-gray-600 dark:text-gray-400">
                      <div>• {exportEstimate.audio_count} downloaded episodes</div>
                      <div className="font-medium text-gray-700 dark:text-gray-300">
                        Total: {formatBytes(exportEstimate.audio_size)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Total */}
                <div className="pt-2 mt-2 border-t border-blue-200 dark:border-blue-700">
                  <div className="font-semibold text-gray-900 dark:text-gray-100">
                    {includeAudio ? (
                      <>Total Export Size: {formatBytes(exportEstimate.metadata_size + exportEstimate.audio_size)}</>
                    ) : (
                      <>Export Size: {formatBytes(exportEstimate.metadata_size)}</>
                    )}
                  </div>
                  {!includeAudio && exportEstimate.audio_count > 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      ({exportEstimate.audio_count} audio files excluded - would add {formatBytes(exportEstimate.audio_size)})
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={!!exportTaskId}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {exportTaskId ? 'Export in Progress...' : 'Start Export'}
            </button>
            {exportStatus && <div className="text-sm">{exportStatus}</div>}

            {/* Export Progress */}
            {exportProgress && (
              <div className="mt-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{exportProgress.step}</span>
                  <span className="text-sm font-semibold">{exportProgress.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${exportProgress.progress}%` }}
                  ></div>
                </div>
              </div>
            )}

            {exports.length > 0 && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                <h3 className="text-sm font-semibold mb-2">Available Exports</h3>
                {exportTaskId && (
                  <div className="text-xs text-yellow-600 dark:text-yellow-400 mb-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                    ⏳ Export in progress - download and delete disabled until complete
                  </div>
                )}
                <div className="space-y-2">
                  {exports.map((exp) => (
                    <div key={exp.filename} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
                      <div>
                        <div className="text-sm font-medium">{exp.filename}</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {formatBytes(exp.size)} • {exp.type.toUpperCase()} • {new Date(exp.created).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={exportTaskId ? '#' : `/api/proxy/api/settings/export/download/${exp.filename}`}
                          onClick={(e) => exportTaskId && e.preventDefault()}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                            exportTaskId
                              ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download
                        </a>
                        <button
                          onClick={() => setShowDeleteExportConfirm(exp.filename)}
                          disabled={!!exportTaskId}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                            exportTaskId
                              ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                              : 'bg-red-600 hover:bg-red-700 text-white'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
              </div>
            </div>
          )}
        </div>

        {/* Import Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
          <button
            onClick={() => toggleSection('import')}
            className="w-full p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <h2 className="text-xl font-semibold">Import Data</h2>
            </div>
            <svg
              className={`w-5 h-5 transition-transform ${expandedSections.import ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expandedSections.import && (
            <div className="px-6 pb-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Import data from another EchoLens instance. Accepts SQL dumps or ZIP files with SQL + uploads.
              </p>
              <p className="text-sm text-red-600 dark:text-red-400 font-bold mb-4">
                ⚠️ WARNING: This will REPLACE your entire database! All existing data will be deleted and replaced with the imported data.
          </p>

          <input
            type="file"
            accept=".sql,.zip"
            onChange={(e) => e.target.files?.[0] && handleImportClick(e.target.files[0])}
            className="hidden"
            id="import-file"
          />
          <button
            onClick={() => document.getElementById('import-file')?.click()}
            disabled={importing}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {importing ? 'Importing...' : 'Select Import File (.sql or .zip)'}
          </button>
            </div>
          )}
        </div>

        {/* AI Prompts Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
          <button
            onClick={() => toggleSection('prompts')}
            className="w-full p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <h2 className="text-xl font-semibold">AI Prompts</h2>
            </div>
            <svg
              className={`w-5 h-5 transition-transform ${expandedSections.prompts ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expandedSections.prompts && (
            <div className="px-6 pb-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Customize the AI prompts used for summarization, term extraction, and chat. Changes take effect immediately.
              </p>

              {prompts && (
                <>
                  {/* Category Tabs */}
                  <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700">
                    {Object.keys(prompts).map((category) => (
                      <button
                        key={category}
                        onClick={() => setSelectedCategory(category)}
                        className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                          selectedCategory === category
                            ? 'border-blue-600 text-blue-700 dark:text-blue-400'
                            : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                      >
                        {category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </button>
                    ))}
                  </div>

                  {/* Prompts List for Selected Category */}
                  <div className="space-y-4">
                    {prompts[selectedCategory]?.map((prompt: any) => (
                      <div key={prompt.key} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        {/* Prompt Header */}
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="font-semibold text-lg">{prompt.name}</h3>
                            {prompt.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{prompt.description}</p>
                            )}
                          </div>
                        </div>

                        {/* Variables */}
                        {prompt.variables && prompt.variables.length > 0 && (
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Variables:</span>
                            <div className="flex flex-wrap gap-1">
                              {prompt.variables.map((variable: string) => (
                                <span
                                  key={variable}
                                  className="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-mono"
                                >
                                  {`{{ ${variable} }}`}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Content Display/Edit */}
                        {editingPrompt?.key === prompt.key && editingPrompt ? (
                          <div className="space-y-2">
                            <textarea
                              value={editingPrompt.content}
                              onChange={(e) => setEditingPrompt({ ...editingPrompt, content: e.target.value })}
                              className="w-full h-64 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 font-mono text-sm"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => editingPrompt && handleUpdatePrompt(prompt.key, editingPrompt.content)}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingPrompt(null)}
                                className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded-lg overflow-x-auto border border-gray-200 dark:border-gray-700 mb-2 whitespace-pre-wrap font-mono">
                              {prompt.content}
                            </pre>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setEditingPrompt({ key: prompt.key, content: prompt.content })}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleResetPrompt(prompt.key)}
                                className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition-colors"
                              >
                                Reset to Default
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {promptStatus && (
                    <div className={`mt-3 text-sm ${promptStatus.startsWith('✓') ? 'text-green-600' : promptStatus.startsWith('✗') ? 'text-red-600' : 'text-gray-600'}`}>
                      {promptStatus}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* System Info */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => toggleSection('system')}
            className="w-full p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-xl font-semibold">System Information</h2>
            </div>
            <svg
              className={`w-5 h-5 transition-transform ${expandedSections.system ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expandedSections.system && (
            <div className="px-6 pb-6">
              <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Version:</span>
              <span className="font-mono">{systemInfo?.version || '1.0.0'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Application:</span>
              <span>EchoLens - Bring Podcasts Into Focus</span>
            </div>
            {systemInfo && (
              <>
                <div className="border-t border-gray-200 dark:border-gray-700 my-3"></div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Database:</span>
                  <span className="font-mono">{formatBytes(systemInfo.database_size)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Audio Files:</span>
                  <span className="font-mono">{formatBytes(systemInfo.uploads_size)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Exports:</span>
                  <span className="font-mono">{formatBytes(systemInfo.exports_size)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Task Logs:</span>
                  <span className="font-mono">{formatBytes(systemInfo.logs_size)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700 font-semibold">
                  <span className="text-gray-900 dark:text-gray-100">Total Storage:</span>
                  <span className="font-mono text-blue-600 dark:text-blue-400">{formatBytes(systemInfo.total_size)}</span>
                </div>
              </>
            )}
              </div>
            </div>
          )}
        </div>

        {/* Import Modal */}
        {importModal.show && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold flex items-center gap-2">
                    {importModal.status === 'success' ? (
                      <>
                        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Import Complete
                      </>
                    ) : importModal.status === 'error' ? (
                      <>
                        <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Import Failed
                      </>
                    ) : (
                      <>
                        <svg className="w-6 h-6 animate-spin text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Importing Data
                      </>
                    )}
                  </h3>
                  {importModal.status !== 'uploading' && importModal.status !== 'processing' && (
                    <button
                      onClick={() => setImportModal(prev => ({ ...prev, show: false }))}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Progress Steps */}
                {importModal.status !== 'error' && (
                  <div className="space-y-3 mb-6">
                    {/* Upload File */}
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {importModal.steps.uploading ? (
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 rounded"></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">Upload file to server</div>
                      </div>
                    </div>

                    {/* Extract Archive */}
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {importModal.steps.extracting ? (
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : importModal.steps.uploading ? (
                          <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        ) : (
                          <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 rounded"></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">Extract archive contents</div>
                      </div>
                    </div>

                    {/* Prepare Database */}
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {importModal.steps.preparing ? (
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : importModal.steps.extracting ? (
                          <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        ) : (
                          <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 rounded"></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">Prepare database</div>
                      </div>
                    </div>

                    {/* Restore Database */}
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {importModal.steps.restoring ? (
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : importModal.steps.preparing ? (
                          <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        ) : (
                          <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 rounded"></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">Restore database from SQL</div>
                      </div>
                    </div>

                    {/* Restore Files */}
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {importModal.steps.files ? (
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : importModal.steps.restoring ? (
                          <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        ) : (
                          <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 rounded"></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">Restore uploaded files</div>
                      </div>
                    </div>

                    {/* Validate */}
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {importModal.steps.validating ? (
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : importModal.steps.files ? (
                          <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        ) : (
                          <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 rounded"></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">Validate embeddings</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Progress Bar */}
                {importModal.status !== 'error' && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{importModal.currentStep}</span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{importModal.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${importModal.progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {importModal.status === 'error' && (
                  <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-800 dark:text-red-200">{importModal.errorMessage || 'An unknown error occurred'}</p>
                  </div>
                )}

                {/* Dimension Warnings */}
                {importModal.warnings && importModal.warnings.length > 0 && (
                  <div className="mb-6">
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div className="flex-1">
                          <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">Dimension Mismatch Detected</h4>
                          <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">{importModal.warningMessage}</p>

                          <div className="bg-white dark:bg-gray-800 rounded border border-yellow-200 dark:border-yellow-700 p-3">
                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Details:</div>
                            <div className="space-y-1 text-sm font-mono">
                              {importModal.warnings.map((warning: any, idx: number) => (
                                <div key={idx} className="text-gray-600 dark:text-gray-400">
                                  • {warning.table}: imported={warning.imported_dimension}, .env={warning.current_env_dimension} ({warning.embedding_count} embeddings)
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="mt-3 text-xs text-yellow-700 dark:text-yellow-400 space-y-1">
                            <p className="font-semibold">Action Required:</p>
                            <p>1. Update EMBEDDING_DIMENSIONS in .env to match imported data, OR</p>
                            <p>2. Delete imported embeddings and regenerate with current settings</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3">
                  {importModal.status === 'success' && (
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                    >
                      Reload Page
                    </button>
                  )}
                  {importModal.status === 'error' && (
                    <button
                      onClick={() => setImportModal(prev => ({ ...prev, show: false }))}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
                    >
                      Close
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Import Confirmation Modal */}
        <ConfirmModal
          isOpen={showImportConfirm}
          onClose={() => {
            setShowImportConfirm(false)
            setPendingImportFile(null)
          }}
          onConfirm={handleImport}
          title="Import Data"
          message={
            <>
              <p className="font-semibold text-red-600 dark:text-red-400 mb-2">⚠️ WARNING</p>
              <p className="mb-2">This will <strong>DELETE ALL EXISTING DATA</strong> and replace it with the imported data.</p>
              <p className="mb-2">This includes:</p>
              <ul className="list-disc list-inside space-y-1 mb-2">
                <li>All podcasts and episodes</li>
                <li>All transcriptions and summaries</li>
                <li>All terms and vector embeddings</li>
                <li>All chat history</li>
                <li>All task history</li>
              </ul>
              <p className="font-semibold">This action cannot be undone!</p>
            </>
          }
          confirmText="Yes, Import and Delete All"
          cancelText="Cancel"
          type="danger"
        />

        {/* Delete Export Confirmation Modal */}
        <ConfirmModal
          isOpen={!!showDeleteExportConfirm}
          onClose={() => setShowDeleteExportConfirm(null)}
          onConfirm={async () => {
            if (showDeleteExportConfirm) {
              await fetch(`/api/proxy/api/settings/export/${showDeleteExportConfirm}`, { method: 'DELETE' })
              loadExports()
              setShowDeleteExportConfirm(null)
            }
          }}
          title="Delete Export"
          message={`Are you sure you want to delete "${showDeleteExportConfirm}"? This cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          type="danger"
        />

        {/* Delete User Confirmation Modal */}
        <ConfirmModal
          isOpen={!!showDeleteUserConfirm}
          onClose={() => setShowDeleteUserConfirm(null)}
          onConfirm={() => showDeleteUserConfirm && handleDeleteUser(showDeleteUserConfirm)}
          title="Delete User"
          message={
            <>
              <p className="font-semibold text-red-600 dark:text-red-400 mb-2">⚠️ WARNING</p>
              <p className="mb-2">Are you sure you want to delete user <strong>{showDeleteUserConfirm?.email}</strong>?</p>
              <p className="mb-2">This will permanently delete:</p>
              <ul className="list-disc list-inside space-y-1 mb-2 text-sm">
                <li>User account and credentials</li>
                <li>All user sessions (immediate logout)</li>
                <li>All podcasts owned by this user</li>
                <li>All episodes, transcriptions, and summaries</li>
                <li>All chat history</li>
              </ul>
              <p className="font-semibold">This action cannot be undone!</p>
            </>
          }
          confirmText="Yes, Delete User"
          cancelText="Cancel"
          type="danger"
        />

        {/* Reset Password Modal */}
        {showResetPasswordModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6">
              <h3 className="text-xl font-semibold mb-4">Reset Password</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Reset password for <strong>{showResetPasswordModal.email}</strong>
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                ⚠️ This will log the user out of all sessions
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 8 characters)"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowResetPasswordModal(null)
                    setNewPassword('')
                  }}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetPassword}
                  disabled={!newPassword || newPassword.length < 8}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                >
                  Reset Password
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import Results Modal */}
        {showImportResults && importResults && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-semibold mb-4">CSV Import Results</h3>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{importResults.total_rows}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Total Rows</div>
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">{importResults.created}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Created</div>
                </div>
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{importResults.skipped}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Skipped</div>
                </div>
              </div>

              {/* Created Users */}
              {importResults.created_users.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-medium mb-2 text-green-700 dark:text-green-400">✓ Created Users ({importResults.created_users.length})</h4>
                  <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 max-h-32 overflow-y-auto">
                    {importResults.created_users.map((email, idx) => (
                      <div key={idx} className="text-sm text-gray-700 dark:text-gray-300 py-1">{email}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skipped Users */}
              {importResults.skipped_users.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-medium mb-2 text-yellow-700 dark:text-yellow-400">⊘ Skipped Users ({importResults.skipped_users.length})</h4>
                  <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 max-h-32 overflow-y-auto">
                    {importResults.skipped_users.map((email, idx) => (
                      <div key={idx} className="text-sm text-gray-700 dark:text-gray-300 py-1">{email} (already exists)</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors */}
              {importResults.errors.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-medium mb-2 text-red-700 dark:text-red-400">✗ Errors ({importResults.errors.length})</h4>
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 max-h-32 overflow-y-auto">
                    {importResults.errors.map((error, idx) => (
                      <div key={idx} className="text-sm text-red-700 dark:text-red-400 py-1">{error}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Close Button */}
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setShowImportResults(false)
                    setImportResults(null)
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  )
}
