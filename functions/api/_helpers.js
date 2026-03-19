// Shared helpers for Pages Functions

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS,
  })
}

export function error(message, status = 400) {
  return json({ error: message }, status)
}

export async function parseBody(request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

// Get user ID from Authorization header (Bearer token)
export async function getUserId(request, env) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  const token = authHeader.slice(7)

  // Ensure sessions table exists
  try {
    const session = await env.DB.prepare(
      'SELECT user_id FROM sessions WHERE token = ?'
    ).bind(token).first()
    return session?.user_id || null
  } catch {
    return null
  }
}

// Legacy fallback
export const USER_ID = 'default'
