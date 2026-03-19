// Shared helpers for Pages Functions

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
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

export const USER_ID = 'default'
