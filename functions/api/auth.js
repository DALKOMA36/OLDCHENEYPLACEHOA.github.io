import { json, error, parseBody } from './_helpers'

// Simple hash for PIN
async function hashPin(pin) {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin + '_jarvis_salt_2026')
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Generate a session token
function generateToken() {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Normalize phone: strip everything except digits
function normalizePhone(phone) {
  return phone.replace(/\D/g, '').slice(-10) // last 10 digits
}

export async function onRequestPost({ env, request }) {
  const body = await parseBody(request)
  const { action } = body

  // Ensure sessions table exists
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`
  ).run()

  if (action === 'register') {
    const { name, phone, pin } = body
    if (!name?.trim()) return error('Name required')
    if (!phone || normalizePhone(phone).length < 10) return error('Valid phone number required')
    if (!pin || pin.length < 4) return error('4-digit PIN required')

    const phoneNorm = normalizePhone(phone)
    const pinHash = await hashPin(pin)
    const userId = crypto.randomUUID()
    const token = generateToken()

    // Check if phone already registered
    const existing = await env.DB.prepare('SELECT id FROM users WHERE sync_code = ?').bind(phoneNorm).first()
    if (existing) return error('Phone number already registered. Use Sign In.')

    await env.DB.prepare(
      `INSERT INTO users (id, name, sync_code, pin_hash, onboarded) VALUES (?, ?, ?, ?, 1)`
    ).bind(userId, name.trim(), phoneNorm, pinHash).run()

    await env.DB.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, userId).run()

    return json({ success: true, token, userId, name: name.trim() })
  }

  if (action === 'login') {
    const { phone, pin } = body
    if (!phone || !pin) return error('Phone and PIN required')

    const phoneNorm = normalizePhone(phone)
    const pinHash = await hashPin(pin)

    const user = await env.DB.prepare(
      'SELECT id, name FROM users WHERE sync_code = ? AND pin_hash = ?'
    ).bind(phoneNorm, pinHash).first()

    if (!user) return error('Invalid phone number or PIN', 401)

    const token = generateToken()
    await env.DB.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, user.id).run()

    return json({ success: true, token, userId: user.id, name: user.name })
  }

  if (action === 'verify') {
    const { token } = body
    if (!token) return error('Token required')

    const session = await env.DB.prepare(
      'SELECT s.user_id, u.name FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ?'
    ).bind(token).first()

    if (!session) return error('Invalid session', 401)
    return json({ success: true, userId: session.user_id, name: session.name })
  }

  if (action === 'change_pin') {
    const { token, currentPin, newPin } = body
    if (!token || !currentPin || !newPin) return error('Current PIN and new PIN required')
    if (newPin.length < 4) return error('New PIN must be at least 4 digits')

    // Verify session
    const session = await env.DB.prepare(
      'SELECT s.user_id FROM sessions s WHERE s.token = ?'
    ).bind(token).first()
    if (!session) return error('Invalid session', 401)

    // Verify current PIN
    const currentHash = await hashPin(currentPin)
    const user = await env.DB.prepare(
      'SELECT id FROM users WHERE id = ? AND pin_hash = ?'
    ).bind(session.user_id, currentHash).first()
    if (!user) return error('Current PIN is incorrect', 401)

    // Update PIN
    const newHash = await hashPin(newPin)
    await env.DB.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').bind(newHash, session.user_id).run()

    return json({ success: true })
  }

  return error('Invalid action')
}
