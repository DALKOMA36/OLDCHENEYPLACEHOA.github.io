import { json, error, parseBody, USER_ID } from './_helpers'

// GET /api/channels?type=sent|drafts
export async function onRequestGet({ env, request }) {
  const url = new URL(request.url)
  const type = url.searchParams.get('type') || 'sent'

  if (type === 'drafts') {
    const { results } = await env.DB.prepare(
      'SELECT * FROM drafts WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(USER_ID).all()
    return json(results)
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM sent_messages WHERE user_id = ? ORDER BY sent_at DESC'
  ).bind(USER_ID).all()
  return json(results)
}

// POST /api/channels?type=sent|drafts
export async function onRequestPost({ env, request }) {
  const url = new URL(request.url)
  const type = url.searchParams.get('type') || 'sent'
  const body = await parseBody(request)

  if (type === 'drafts') {
    const result = await env.DB.prepare(
      'INSERT INTO drafts (user_id, recipient, message, channel) VALUES (?, ?, ?, ?)'
    ).bind(USER_ID, body.recipient || body.to || '', body.message || '', body.channel || 'sms').run()
    return json({ id: result.meta.last_row_id }, 201)
  }

  if (!body.message) return error('message required')
  const result = await env.DB.prepare(
    'INSERT INTO sent_messages (user_id, recipient, message, channel) VALUES (?, ?, ?, ?)'
  ).bind(USER_ID, body.recipient || body.to || '', body.message, body.channel || 'sms').run()
  return json({ id: result.meta.last_row_id }, 201)
}

export async function onRequestDelete({ env, request }) {
  const url = new URL(request.url)
  const type = url.searchParams.get('type') || 'sent'
  const id = url.searchParams.get('id')

  if (!id) return error('id required')

  const table = type === 'drafts' ? 'drafts' : 'sent_messages'
  await env.DB.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).bind(id, USER_ID).run()
  return json({ success: true })
}
