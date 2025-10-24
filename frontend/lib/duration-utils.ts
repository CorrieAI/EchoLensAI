/**
 * Format duration in seconds to a human-readable string
 * Durations over 59 minutes are displayed as hours and minutes (e.g., "1h 50m")
 * Durations under 60 minutes are displayed as minutes only (e.g., "45m")
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  if (minutes > 59) {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }
  return `${minutes}m`
}
