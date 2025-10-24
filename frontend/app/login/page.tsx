'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(true)
  const { login, user } = useAuth()
  const router = useRouter()

  // Initialize theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark)

    setIsDarkMode(shouldBeDark)
    if (shouldBeDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [])

  const toggleTheme = () => {
    const newMode = !isDarkMode
    setIsDarkMode(newMode)
    if (newMode) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      // Use replace instead of push to avoid back button issues
      router.replace('/')
    }
  }, [user, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(email, password)
      // Don't manually redirect - let the useEffect handle it when user state updates
    } catch (err: any) {
      setError(err.message || 'Login failed')
      setLoading(false) // Only clear loading on error
    }
    // Note: Don't clear loading on success - let it stay loading until redirect happens
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-blue-950 dark:to-indigo-950">
      {/* Theme Toggle Button */}
      <button
        onClick={toggleTheme}
        className="absolute top-6 right-6 z-20 p-2 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shadow-lg"
        title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDarkMode ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>

      {/* Animated network background - complex mesh */}
      <div className="absolute inset-0 overflow-visible pointer-events-none">
        <svg className="w-[120%] h-[120%] absolute -left-[10%] -top-[10%]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={isDarkMode ? "0.3" : "0.4"} />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity={isDarkMode ? "0.4" : "0.5"} />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity={isDarkMode ? "0.3" : "0.4"} />
            </linearGradient>
            <radialGradient id="nodeGlow">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity={isDarkMode ? "0.8" : "0.6"} />
              <stop offset="50%" stopColor="#3b82f6" stopOpacity={isDarkMode ? "0.4" : "0.5"} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </radialGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* Create a distributed network of nodes */}
          {[...Array(56)].map((_, i) => {
            // Distribute nodes across and BEYOND the screen for infinite effect
            const row = Math.floor(i / 8)
            const col = i % 8
            const baseX = (col * 14.2857) - 7  // Start at -7% and go beyond 100%
            const baseY = (row * 14.2857) - 7  // Start at -7% and go beyond 100%
            // Add some randomness but keep it consistent between renders
            const offsetX = ((i * 7) % 11) - 5
            const offsetY = ((i * 13) % 11) - 5
            const cx = Number((baseX + offsetX).toFixed(2))
            const cy = Number((baseY + offsetY).toFixed(2))
            const size = i === 28 ? 1 : (0.3 + ((i * 3) % 3) * 0.1) // Even tinier dots
            const isPrimary = i === 28
            const color = isPrimary ? '#8b5cf6' : (i % 3 === 0 ? '#06b6d4' : i % 3 === 1 ? '#3b82f6' : '#8b5cf6')

            return (
              <g key={`node-${i}`}>
                {/* Node */}
                <circle
                  cx={`${cx}%`}
                  cy={`${cy}%`}
                  r={size}
                  fill={color}
                  opacity={isDarkMode ? (isPrimary ? "0.9" : "0.6") : (isPrimary ? "0.7" : "0.5")}
                  filter={isPrimary ? "url(#glow)" : undefined}
                >
                  <animate
                    attributeName="opacity"
                    values={isDarkMode ? (isPrimary ? "0.7;1;0.7" : "0.4;0.7;0.4") : (isPrimary ? "0.6;0.8;0.6" : "0.4;0.6;0.4")}
                    dur={`${4 + (i % 5)}s`}
                    repeatCount="indefinite"
                    begin={`${(i * 0.1) % 2}s`}
                  />
                </circle>

                {/* Glow effect for some nodes */}
                {i % 4 === 0 && (
                  <circle
                    cx={`${cx}%`}
                    cy={`${cy}%`}
                    r={size * 3}
                    fill="url(#nodeGlow)"
                    opacity="0.3"
                  >
                    <animate
                      attributeName="r"
                      values={`${size * 2};${size * 4};${size * 2}`}
                      dur={`${5 + (i % 3)}s`}
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
              </g>
            )
          })}

          {/* Connection lines - create a mesh between nearby nodes */}
          {[...Array(56)].map((_, i) => {
            const row = Math.floor(i / 8)
            const col = i % 8
            const baseX = (col * 14.2857) - 7
            const baseY = (row * 14.2857) - 7
            const offsetX = ((i * 7) % 11) - 5
            const offsetY = ((i * 13) % 11) - 5
            const x1 = Number((baseX + offsetX).toFixed(2))
            const y1 = Number((baseY + offsetY).toFixed(2))

            // Connect to nearby nodes (right, down, diagonal)
            const connections = []

            // Right neighbor
            if (col < 7) {
              const j = i + 1
              const nBaseX = ((j % 8) * 14.2857) - 7
              const nBaseY = (Math.floor(j / 8) * 14.2857) - 7
              const nOffsetX = ((j * 7) % 11) - 5
              const nOffsetY = ((j * 13) % 11) - 5
              connections.push({
                x2: Number((nBaseX + nOffsetX).toFixed(2)),
                y2: Number((nBaseY + nOffsetY).toFixed(2)),
                key: `${i}-r`
              })
            }

            // Down neighbor
            if (row < 6) {
              const j = i + 8
              const nBaseX = ((j % 8) * 14.2857) - 7
              const nBaseY = (Math.floor(j / 8) * 14.2857) - 7
              const nOffsetX = ((j * 7) % 11) - 5
              const nOffsetY = ((j * 13) % 11) - 5
              connections.push({
                x2: Number((nBaseX + nOffsetX).toFixed(2)),
                y2: Number((nBaseY + nOffsetY).toFixed(2)),
                key: `${i}-d`
              })
            }

            // Diagonal neighbor
            if (col < 7 && row < 6) {
              const j = i + 9
              const nBaseX = ((j % 8) * 14.2857) - 7
              const nBaseY = (Math.floor(j / 8) * 14.2857) - 7
              const nOffsetX = ((j * 7) % 11) - 5
              const nOffsetY = ((j * 13) % 11) - 5
              connections.push({
                x2: Number((nBaseX + nOffsetX).toFixed(2)),
                y2: Number((nBaseY + nOffsetY).toFixed(2)),
                key: `${i}-diag`
              })
            }

            return connections.map(conn => (
              <line
                key={conn.key}
                x1={`${x1}%`}
                y1={`${y1}%`}
                x2={`${conn.x2}%`}
                y2={`${conn.y2}%`}
                stroke="url(#lineGradient)"
                strokeWidth="0.15"
                opacity="0.15"
              >
                <animate
                  attributeName="opacity"
                  values="0.1;0.3;0.1"
                  dur={`${4 + (i % 4)}s`}
                  repeatCount="indefinite"
                  begin={`${(i * 0.2) % 3}s`}
                />
              </line>
            ))
          })}
        </svg>
      </div>

      {/* Main content */}
      <div className="relative z-10 max-w-md w-full mx-4">
        {/* Logo and branding */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image
              src="/favicon.png"
              alt="EchoLens Logo"
              width={80}
              height={80}
              className="rounded-2xl"
            />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            EchoLens
          </h1>
          <p className="text-gray-600 dark:text-gray-300 text-sm">
            Bring Your Podcasts Into Focus
          </p>
        </div>

        {/* Login form card */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-gray-200 dark:border-gray-700">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center">
              Welcome Back
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
              Don't have an account?{' '}
              <Link
                href="/register"
                className="font-semibold text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                Sign up
              </Link>
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 border border-red-200 dark:border-red-800">
                <div className="text-sm text-red-800 dark:text-red-200">{error}</div>
              </div>
            )}

            <div>
              <label htmlFor="email-address" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-white bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-white bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            © 2025 EchoLensAI by CorrieAI
          </p>
          <div className="flex items-center justify-center gap-2 text-xs">
            <a
              href="https://echolensai.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              Website
            </a>
            <span className="text-gray-500 dark:text-gray-400">•</span>
            <a
              href="https://docs.echolensai.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              Docs
            </a>
            <span className="text-gray-500 dark:text-gray-400">•</span>
            <a
              href="https://github.com/CorrieAI/EchoLensAI"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              GitHub
            </a>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            v1.0.0
          </p>
        </div>
      </div>
    </div>
  )
}
