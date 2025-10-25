import { NextRequest, NextResponse } from 'next/server'

// Backend URL - uses Docker network in production, localhost in dev
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params
  return proxyRequest(request, params.path, 'GET')
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params
  return proxyRequest(request, params.path, 'POST')
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params
  return proxyRequest(request, params.path, 'PUT')
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params
  return proxyRequest(request, params.path, 'DELETE')
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params
  return proxyRequest(request, params.path, 'PATCH')
}

async function proxyRequest(
  request: NextRequest,
  pathSegments: string[],
  method: string
) {
  try {
    // Reconstruct the original path
    const path = pathSegments.join('/')

    // Get query parameters
    const searchParams = request.nextUrl.searchParams.toString()
    const queryString = searchParams ? `?${searchParams}` : ''

    // Build the backend URL - path already includes /api from the client
    const backendUrl = `${BACKEND_URL}/${path}${queryString}`

    // Prepare request body for non-GET requests
    let body: BodyInit | null = null
    const contentType = request.headers.get('content-type')

    // Prepare headers
    const headers = new Headers()

    if (method !== 'GET' && method !== 'HEAD') {
      if (contentType?.includes('application/json')) {
        // Handle JSON
        body = JSON.stringify(await request.json())
        headers.set('content-type', 'application/json')
      } else if (contentType?.includes('multipart/form-data')) {
        // For FormData/file uploads, stream the body directly without parsing
        // This avoids loading the entire file into memory and preserves the boundary
        body = request.body
        // Copy the exact content-type with boundary
        if (contentType) {
          headers.set('content-type', contentType)
        }
      } else {
        // Handle plain text or other content types
        body = await request.text()
        if (contentType) {
          headers.set('content-type', contentType)
        }
      }
    }

    // Copy other relevant headers from the original request
    const headersToForward = [
      'authorization',
      'accept',
      'accept-language',
      'user-agent',
      'cookie', // Forward cookies for authentication
      'range', // Forward Range header for audio/video seeking
      'if-range', // Forward If-Range header for conditional range requests
    ]

    headersToForward.forEach((header) => {
      const value = request.headers.get(header)
      if (value) {
        headers.set(header, value)
      }
    })

    // Make the request to the backend
    // For file uploads, we need duplex mode to stream the request body
    const fetchOptions: any = {
      method,
      headers,
      body,
    }

    // Enable duplex streaming when using request.body (ReadableStream)
    // This is required in Node.js when the body is a stream
    if (body && typeof body === 'object' && 'getReader' in body) {
      fetchOptions.duplex = 'half'
    }

    const response = await fetch(backendUrl, fetchOptions)

    // For file downloads and large responses, stream the response
    // Check if it's a binary response (download) by content-type or content-disposition
    const responseContentType = response.headers.get('content-type')
    const contentDisposition = response.headers.get('content-disposition')
    const isBinary = contentDisposition?.includes('attachment') ||
                     responseContentType?.includes('application/octet-stream') ||
                     responseContentType?.includes('application/zip') ||
                     responseContentType?.includes('application/sql') ||
                     responseContentType?.includes('audio/') ||
                     responseContentType?.includes('video/') ||
                     responseContentType?.includes('image/')

    if (isBinary && response.body) {
      // Stream the response for binary content
      const proxyResponse = new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
      })

      // Copy response headers
      response.headers.forEach((value, key) => {
        if (!['transfer-encoding', 'connection', 'keep-alive'].includes(key.toLowerCase())) {
          proxyResponse.headers.set(key, value)
        }
      })

      return proxyResponse
    }

    // For JSON/text responses, read the body
    const responseBody = await response.text()

    // Create response with same status and headers
    const proxyResponse = new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
    })

    // Copy response headers
    response.headers.forEach((value, key) => {
      // Skip some headers that should not be proxied
      if (!['transfer-encoding', 'connection', 'keep-alive'].includes(key.toLowerCase())) {
        proxyResponse.headers.set(key, value)
      }
    })

    return proxyResponse
  } catch (error) {
    console.error('Proxy error:', error)
    return NextResponse.json(
      { error: 'Failed to proxy request to backend' },
      { status: 500 }
    )
  }
}
