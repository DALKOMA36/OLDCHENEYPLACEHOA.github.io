// Global middleware for all /api/* routes
// Handles CORS preflight, auth, and error wrapping

import { getUserId } from './_helpers'

export async function onRequest(context) {
  // Handle CORS preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // Skip auth for the auth endpoint itself
  const url = new URL(context.request.url)
  if (url.pathname === '/api/auth') {
    try {
      return await context.next()
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
  }

  // Resolve user ID from token
  const userId = await getUserId(context.request, context.env)
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  // Attach userId to context.data for route handlers
  context.data = context.data || {}
  context.data.userId = userId

  try {
    return await context.next()
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
}
