'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api, Notification } from '@/lib/api'
import { ThemeToggle } from './theme-toggle'
import { useAuth } from '@/contexts/auth-context'

export function TopBar() {
  const router = useRouter()
  const { user, logout } = useAuth()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 20000) // Poll every 20 seconds
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadNotifications = async () => {
    try {
      const data = await api.getNotifications()
      setNotifications(data.notifications)
      setUnreadCount(data.unread_count)
    } catch (error) {
      console.error('Failed to load notifications:', error)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead()
      await loadNotifications()
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }

  const handleNotificationClick = async (notification: Notification) => {
    if (notification.read === 0) {
      await api.markNotificationRead(notification.id)
      await loadNotifications()
    }
  }

  const getLevelColor = (level?: string) => {
    switch (level) {
      case 'success':
        return 'text-green-600 dark:text-green-400'
      case 'error':
        return 'text-red-600 dark:text-red-400'
      case 'warning':
        return 'text-yellow-600 dark:text-yellow-400'
      default:
        return 'text-blue-600 dark:text-blue-400'
    }
  }

  return (
    <div className="fixed top-0 right-0 left-0 h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6 py-3 z-40">
      {/* Logo and Branding */}
      <a href="/" className="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="250 220 550 550" className="text-gray-900 dark:text-gray-100" fill="currentColor">
          <path d="M 628.752 265.053 C 623.043 269.759, 621.989 276.505, 625.839 283.700 C 626.422 284.788, 629.391 287.602, 632.438 289.952 C 635.632 292.416, 637.703 294.708, 637.329 295.363 C 636.972 295.988, 637.059 296.155, 637.524 295.732 C 638.629 294.728, 645.109 301.015, 644.307 302.313 C 643.967 302.862, 644.193 302.999, 644.809 302.618 C 646.003 301.880, 656.031 314.074, 664.329 326.354 C 670.707 335.793, 683.115 361.212, 686.854 372.500 C 692.191 388.612, 696.925 410.618, 697.128 420.269 C 697.166 422.046, 697.401 429.906, 697.651 437.736 C 698.663 469.466, 691.804 499.080, 676.281 529.992 C 671.727 539.062, 668 547.514, 668 548.774 C 668 559.252, 680.298 565.630, 689.102 559.718 C 695.359 555.518, 710.619 523.018, 717.047 500.208 C 728.753 458.663, 727.295 410.212, 713.036 366.924 C 701.255 331.158, 683.479 302.226, 657.411 276.390 C 642.653 261.763, 635.957 259.114, 628.752 265.053 M 443 274.402 C 407.806 279.876, 380.422 291.521, 355.345 311.680 C 298.268 357.563, 276.646 435.043, 300.631 507.743 C 302.038 512.009, 305.951 521.125, 309.324 528 C 312.698 534.875, 315.406 541.058, 315.342 541.739 C 315.278 542.421, 315.555 542.775, 315.958 542.526 C 316.360 542.277, 319.341 545.995, 322.582 550.787 C 326.072 555.947, 333.781 564.815, 341.487 572.535 C 368.119 599.212, 395.686 614.272, 432.096 622.034 C 445.357 624.861, 470.662 625.797, 485.857 624.023 C 511.226 621.061, 537.492 611.579, 560.829 596.959 C 563.515 595.277, 562.881 594.673, 584.401 619.405 C 608.269 646.836, 619.990 661.207, 619.346 662.249 C 618.985 662.834, 619.161 663.018, 619.740 662.661 C 620.695 662.071, 632.826 676.251, 663.692 714.036 C 679.901 733.880, 684.028 737, 694.067 737 C 703.318 737, 710.329 731.548, 713.550 721.849 C 716.429 713.181, 713.779 707.340, 701.209 694.646 C 697.317 690.716, 669.423 662.848, 639.223 632.718 L 584.313 577.937 590.685 571.218 C 598.918 562.539, 608.818 549.573, 609.605 546.439 C 611.252 539.877, 605.704 530.972, 599.059 529.513 C 592.077 527.979, 590.226 529.334, 576.575 545.976 C 555.242 571.981, 521.618 590.713, 487.750 595.459 L 479 596.686 479 578.431 L 479 560.176 483.250 559.513 C 514.503 554.635, 541.948 533.907, 556.547 504.152 C 564.095 488.771, 567.011 474.727, 567.088 453.402 C 567.136 439.910, 566.908 437.741, 565.061 434.120 C 563.917 431.877, 561.657 429.357, 560.040 428.521 C 553.455 425.115, 543.938 427.714, 540.977 433.725 C 540.053 435.600, 539.394 442.665, 538.945 455.500 C 538.370 471.951, 537.944 475.529, 535.773 482.167 C 531.783 494.366, 526.676 502.530, 517.045 512.110 C 502.334 526.742, 485.678 533.367, 464 533.206 C 431.641 532.968, 404.860 513.456, 394.489 482.563 C 391.449 473.506, 390.018 462.541, 390.008 448.218 C 389.999 436.204, 388.629 431.964, 383.810 429.026 C 377.492 425.173, 368.504 427.248, 364.404 433.506 C 361.784 437.505, 362.133 470.402, 364.911 481.198 C 375.058 520.637, 402.619 548.376, 441.015 557.793 L 452.053 560.500 451.948 578.750 C 451.891 588.788, 451.473 597, 451.021 597 C 445.975 597, 425.103 592.261, 416.368 589.132 C 396.461 582.001, 383.579 574.454, 367.956 560.770 C 345.145 540.791, 330.262 515.888, 322.615 484.904 C 312.669 444.600, 320.481 398.841, 343 365.508 C 350.523 354.373, 355.988 347.875, 357.201 348.625 C 357.826 349.010, 358.030 348.857, 357.669 348.273 C 356.656 346.634, 372.149 332.523, 382.277 325.861 C 406.166 310.148, 427.133 303.449, 458.537 301.494 C 484.451 299.882, 515.898 307.203, 538.129 320.024 C 544.433 323.659, 547.801 324.998, 550.629 324.993 C 560.829 324.976, 567.421 313.123, 562.092 304.383 C 556.623 295.414, 520.105 279.735, 494.655 275.429 C 482.028 273.292, 453.753 272.730, 443 274.402 M 597.415 302.374 C 592.357 304.654, 590 308.509, 590 314.500 C 590 318.064, 590.590 320.490, 591.851 322.115 C 592.869 323.427, 593.509 325.175, 593.275 326 C 592.954 327.128, 593.070 327.185, 593.745 326.231 C 594.403 325.300, 596.758 327.031, 602.584 332.731 C 623.095 352.796, 636.617 377.921, 643.156 408.113 C 645.086 417.028, 645.410 421.547, 645.444 440 C 645.478 458.910, 645.203 462.751, 643.167 471.881 C 640.187 485.243, 635.823 497.676, 630.998 506.553 C 626.269 515.254, 625.299 519.744, 627.309 523.631 C 629.433 527.738, 631.900 529.654, 636.713 530.936 C 645.150 533.182, 649.849 529.080, 657.350 512.921 C 688.008 446.874, 672.748 362.993, 621.021 313.226 C 609.348 301.994, 603.857 299.470, 597.415 302.374 M 453.306 331.048 C 436.425 334.383, 419.675 347.542, 412.584 363.039 C 406.729 375.832, 406.525 377.877, 406.650 422.500 C 406.747 456.914, 407.031 464.624, 408.423 470.500 C 413.668 492.642, 429.684 509.237, 451 514.613 C 459.427 516.739, 475.023 516.030, 483.202 513.149 C 497.228 508.209, 509.073 497.556, 515.762 483.866 C 522.282 470.522, 522.501 468.534, 522.488 423 C 522.475 377.597, 522.251 375.552, 515.830 362.129 C 504.845 339.166, 478.501 326.069, 453.306 331.048 M 564.619 341.034 C 559.640 342.525, 555.329 347.455, 554.367 352.759 C 553.561 357.208, 556.053 361.159, 566.746 372.381 C 573.170 379.123, 576.906 383.802, 576.568 384.683 C 576.268 385.464, 576.432 385.851, 576.933 385.542 C 578.120 384.808, 584.095 394.738, 587.439 403 C 597.595 428.097, 596.587 461.627, 585.025 483.293 C 582.937 487.207, 582 490.366, 582 493.496 C 582 503, 592.424 508.882, 601 504.218 C 607.596 500.630, 615.444 484.012, 619.272 465.530 C 621.977 452.467, 622.159 429.544, 619.658 416.790 C 614.586 390.921, 602.817 369.266, 582.718 348.818 C 578.234 344.256, 574.935 341.798, 572.325 341.073 C 568.013 339.876, 568.481 339.878, 564.619 341.034" fillRule="evenodd"/>
        </svg>
        <div className="flex flex-col">
          <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">EchoLens</span>
          <span className="text-[11px] text-gray-500 dark:text-gray-400 -mt-0.5">Bring Your Podcasts Into Focus</span>
        </div>
      </a>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        <ThemeToggle />

        {/* Notifications */}
        <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Notifications"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-600 rounded-full">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {showNotifications && (
          <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Mark all as read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No notifications
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`p-3 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${
                      notification.read === 0 ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium text-sm ${getLevelColor(notification.level)}`}>
                          {notification.title}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {notification.message}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {notification.time_ago}
                        </div>
                      </div>
                      {notification.read === 0 && (
                        <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-1"></div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        </div>

        {/* User Menu */}
        {user && (
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={user.email}
            >
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
                {user.email.charAt(0).toUpperCase()}
              </div>
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50">
                <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="font-medium text-sm truncate">{user.email}</div>
                  {user.is_admin && (
                    <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">Administrator</div>
                  )}
                </div>

                <div className="py-1">
                  {user.is_admin && (
                    <button
                      onClick={() => {
                        setShowUserMenu(false)
                        router.push('/admin')
                      }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Admin Dashboard
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowUserMenu(false)
                      router.push('/settings')
                    }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Settings
                  </button>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={async () => {
                      try {
                        await logout()
                        router.push('/login')
                      } catch (error) {
                        console.error('Logout failed:', error)
                      }
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
