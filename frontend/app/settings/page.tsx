'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { api } from '@/lib/api'

export default function SettingsPage() {
  const { user, refreshUser } = useAuth()

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<{
    profile: boolean
    display: boolean
  }>({
    profile: false,
    display: false,
  })

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  // User profile
  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailStatus, setEmailStatus] = useState('')
  const [emailError, setEmailError] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordStatus, setPasswordStatus] = useState('')
  const [passwordError, setPasswordError] = useState('')

  // Display preferences
  const [cardColumns, setCardColumns] = useState<'2' | '3'>('3')
  const [paginationMode, setPaginationMode] = useState<'infinite' | 'pagination'>('pagination')
  const [itemsPerPage, setItemsPerPage] = useState<number>(12)
  const [displayStatus, setDisplayStatus] = useState('')

  useEffect(() => {
    loadDisplayPreferences()
    if (user) {
      setNewEmail(user.email)
    }
  }, [user])

  const loadDisplayPreferences = () => {
    const savedColumns = localStorage.getItem('podcast_card_columns')
    const savedPagination = localStorage.getItem('podcast_pagination_mode')
    const savedItemsPerPage = localStorage.getItem('podcast_items_per_page')

    if (savedColumns) setCardColumns(savedColumns as '2' | '3')
    if (savedPagination) setPaginationMode(savedPagination as 'infinite' | 'pagination')
    if (savedItemsPerPage) setItemsPerPage(parseInt(savedItemsPerPage))
  }

  const saveDisplayPreferences = () => {
    localStorage.setItem('podcast_card_columns', cardColumns)
    localStorage.setItem('podcast_pagination_mode', paginationMode)
    localStorage.setItem('podcast_items_per_page', itemsPerPage.toString())

    setDisplayStatus('✓ Display preferences saved!')
    setTimeout(() => setDisplayStatus(''), 3000)

    // Reload the page to apply changes
    window.location.href = '/'
  }

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailError('')
    setEmailStatus('')

    if (!newEmail || !emailPassword) {
      setEmailError('Please fill in all fields')
      return
    }

    if (newEmail === user?.email) {
      setEmailError('New email must be different from current email')
      return
    }

    try {
      const result = await api.changeEmail(emailPassword, newEmail)
      setEmailStatus(result.message)
      setEmailPassword('')
      // Refresh user data to show new email
      await refreshUser()
      setTimeout(() => setEmailStatus(''), 5000)
    } catch (error: any) {
      setEmailError(error.message || 'Failed to change email')
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordStatus('')

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Please fill in all fields')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long')
      return
    }

    if (currentPassword === newPassword) {
      setPasswordError('New password must be different from current password')
      return
    }

    try {
      const result = await api.changePassword(currentPassword, newPassword)
      setPasswordStatus(result.message)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordStatus(''), 5000)
    } catch (error: any) {
      setPasswordError(error.message || 'Failed to change password')
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-2">Settings</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">Customize your EchoLens experience</p>

      {/* User Profile Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
        <button
          onClick={() => toggleSection('profile')}
          className="w-full p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <h2 className="text-xl font-semibold">User Profile</h2>
          </div>
          <svg
            className={`w-5 h-5 transition-transform ${expandedSections.profile ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expandedSections.profile && (
          <div className="px-6 pb-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Update your email address and password
            </p>

            <div className="space-y-6">
          {/* Change Email */}
          <div className="pb-6 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold mb-3">Change Email Address</h3>
            <form onSubmit={handleChangeEmail} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">New Email Address</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                  placeholder="Enter your password to confirm"
                />
              </div>
              {emailError && (
                <div className="text-sm text-red-600 dark:text-red-400">{emailError}</div>
              )}
              {emailStatus && (
                <div className="text-sm text-green-600 dark:text-green-400">{emailStatus}</div>
              )}
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
              >
                Update Email
              </button>
            </form>
          </div>

          {/* Change Password */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Change Password</h3>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                  placeholder="Enter new password (min 8 characters)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                  placeholder="Confirm new password"
                />
              </div>
              {passwordError && (
                <div className="text-sm text-red-600 dark:text-red-400">{passwordError}</div>
              )}
              {passwordStatus && (
                <div className="text-sm text-green-600 dark:text-green-400">{passwordStatus}</div>
              )}
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
              >
                Update Password
              </button>
            </form>
          </div>
            </div>
          </div>
        )}
      </div>

      {/* Display Preferences Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
        <button
          onClick={() => toggleSection('display')}
          className="w-full p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            <h2 className="text-xl font-semibold">Display Preferences</h2>
          </div>
          <svg
            className={`w-5 h-5 transition-transform ${expandedSections.display ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expandedSections.display && (
          <div className="px-6 pb-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Customize how podcasts are displayed on the main page
            </p>

            <div className="space-y-4">
          {/* Card Columns */}
          <div>
            <label className="block text-sm font-medium mb-2">Card Layout</label>
            <div className="flex gap-3">
              <button
                onClick={() => setCardColumns('2')}
                className={`px-4 py-2 rounded-lg border-2 transition-colors text-sm ${
                  cardColumns === '2'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                2 Columns Wide
              </button>
              <button
                onClick={() => setCardColumns('3')}
                className={`px-4 py-2 rounded-lg border-2 transition-colors text-sm ${
                  cardColumns === '3'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                3 Columns Wide
              </button>
            </div>
          </div>

          {/* Pagination Mode */}
          <div>
            <label className="block text-sm font-medium mb-2">Loading Mode</label>
            <div className="flex gap-3">
              <button
                onClick={() => setPaginationMode('pagination')}
                className={`px-4 py-2 rounded-lg border-2 transition-colors text-sm ${
                  paginationMode === 'pagination'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                Pagination
              </button>
              <button
                onClick={() => setPaginationMode('infinite')}
                className={`px-4 py-2 rounded-lg border-2 transition-colors text-sm ${
                  paginationMode === 'infinite'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                Infinite Scroll
              </button>
            </div>
          </div>

          {/* Items per Page */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Items per Page
              {paginationMode === 'infinite' && (
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">(applies when using Pagination mode)</span>
              )}
            </label>
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(parseInt(e.target.value))}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
            >
              <option value={6}>6 podcasts</option>
              <option value={12}>12 podcasts</option>
              <option value={24}>24 podcasts</option>
              <option value={48}>48 podcasts</option>
              <option value={100}>100 podcasts</option>
            </select>
          </div>

          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={saveDisplayPreferences}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
            >
              Save Display Preferences
            </button>
            {displayStatus && (
              <span className="ml-3 text-sm text-green-600 dark:text-green-400">{displayStatus}</span>
            )}
          </div>
        </div>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-semibold mb-1">Looking for more settings?</p>
            <p>System-level settings like RSS refresh, data export/import, and AI prompts are available in the Admin Dashboard for administrators.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
