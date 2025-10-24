/**
 * Get the full URL for an image, handling both external URLs and local uploads
 */
export function getImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null

  // If it's already a full URL (starts with http:// or https://), return as-is
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl
  }

  // If it already has /api/proxy, return as-is (already transformed)
  if (imageUrl.startsWith('/api/proxy/')) {
    return imageUrl
  }

  // All backend paths should be proxied through /api/proxy
  // This includes /echolens_data/ and any other backend-served paths
  if (imageUrl.startsWith('/')) {
    return `/api/proxy${imageUrl}`
  }

  // Otherwise, return as-is (shouldn't happen, but just in case)
  return imageUrl
}
