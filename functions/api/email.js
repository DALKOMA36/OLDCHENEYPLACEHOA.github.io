import { json, error, parseBody } from './_helpers'

// Known IMAP configurations
const IMAP_PRESETS = {
  'outlook.com': { host: 'outlook.office365.com', port: 993 },
  'hotmail.com': { host: 'outlook.office365.com', port: 993 },
  'live.com': { host: 'outlook.office365.com', port: 993 },
  'gmail.com': { host: 'imap.gmail.com', port: 993 },
  'yahoo.com': { host: 'imap.mail.yahoo.com', port: 993 },
  'aol.com': { host: 'imap.aol.com', port: 993 },
  'icloud.com': { host: 'imap.mail.me.com', port: 993 },
  'protonmail.com': { host: 'imap.protonmail.ch', port: 993, note: 'Requires Proton Bridge running locally' },
  'proton.me': { host: 'imap.protonmail.ch', port: 993, note: 'Requires Proton Bridge running locally' },
}

function getPreset(email) {
  const domain = email.split('@')[1]?.toLowerCase()
  return IMAP_PRESETS[domain] || null
}

// GET /api/email - List email accounts or fetch emails
export async function onRequestGet({ env, request, data }) {
  const url = new URL(request.url)
  const action = url.searchParams.get('action') || 'accounts'

  if (action === 'accounts') {
    const { results } = await env.DB.prepare(
      'SELECT id, email, display_name, imap_host, enabled, last_sync, created_at FROM email_accounts WHERE user_id = ? ORDER BY created_at'
    ).bind(data.userId).all()
    return json(results)
  }

  if (action === 'emails') {
    const accountId = url.searchParams.get('account_id')
    const limit = parseInt(url.searchParams.get('limit') || '50')

    let stmt
    if (accountId) {
      stmt = env.DB.prepare('SELECT * FROM emails WHERE user_id = ? AND account_id = ? ORDER BY date DESC LIMIT ?')
        .bind(data.userId, accountId, limit)
    } else {
      stmt = env.DB.prepare('SELECT e.*, ea.email as account_email FROM emails e JOIN email_accounts ea ON e.account_id = ea.id WHERE e.user_id = ? ORDER BY e.date DESC LIMIT ?')
        .bind(data.userId, limit)
    }
    const { results } = await stmt.all()
    return json(results)
  }

  if (action === 'presets') {
    return json(IMAP_PRESETS)
  }

  return error('Invalid action')
}

// POST /api/email - Add email account
export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  const { email, password, imap_host, imap_port, display_name } = body

  if (!email || !password) return error('email and password required')

  // Auto-detect IMAP settings
  const preset = getPreset(email)
  const host = imap_host || preset?.host
  const port = imap_port || preset?.port || 993

  if (!host) return error('Could not detect IMAP server. Please provide imap_host manually.')

  const result = await env.DB.prepare(
    'INSERT INTO email_accounts (user_id, email, display_name, imap_host, imap_port, username, password) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(data.userId, email, display_name || email, host, port, email, password).run()

  return json({
    success: true,
    id: result.meta.last_row_id,
    imap_host: host,
    imap_port: port,
    note: preset?.note || null,
  }, 201)
}

// PUT /api/email - Update account or mark email read
export async function onRequestPut({ env, request, data }) {
  const body = await parseBody(request)

  if (body.email_id && body.read !== undefined) {
    await env.DB.prepare('UPDATE emails SET read = ? WHERE id = ? AND user_id = ?')
      .bind(body.read ? 1 : 0, body.email_id, data.userId).run()
    return json({ success: true })
  }

  if (body.id) {
    const fields = []
    const values = []
    if (body.display_name !== undefined) { fields.push('display_name = ?'); values.push(body.display_name) }
    if (body.password !== undefined) { fields.push('password = ?'); values.push(body.password) }
    if (body.enabled !== undefined) { fields.push('enabled = ?'); values.push(body.enabled ? 1 : 0) }
    if (body.imap_host) { fields.push('imap_host = ?'); values.push(body.imap_host) }

    if (fields.length > 0) {
      await env.DB.prepare(`UPDATE email_accounts SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`)
        .bind(...values, body.id, data.userId).run()
    }
    return json({ success: true })
  }

  return error('id required')
}

// DELETE /api/email - Remove email account
export async function onRequestDelete({ env, request, data }) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return error('id required')

  await env.DB.prepare('DELETE FROM email_accounts WHERE id = ? AND user_id = ?').bind(id, data.userId).run()
  // Cascade delete emails
  await env.DB.prepare('DELETE FROM emails WHERE account_id = ?').bind(id).run()
  return json({ success: true })
}
