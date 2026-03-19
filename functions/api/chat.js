import { json, error, parseBody } from './_helpers'

export async function onRequestGet({ env, request, data }) {
  const url = new URL(request.url)
  const limit = parseInt(url.searchParams.get('limit') || '50')

  const { results } = await env.DB.prepare(
    'SELECT * FROM chat_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).bind(data.userId, limit).all()

  return json(results.reverse())
}

export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  if (!body.role || !body.text) return error('role and text required')

  const result = await env.DB.prepare(
    'INSERT INTO chat_messages (user_id, role, text, time) VALUES (?, ?, ?, ?)'
  ).bind(data.userId, body.role, body.text, body.time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })).run()

  return json({ id: result.meta.last_row_id, ...body }, 201)
}

export async function onRequestDelete({ env, data }) {
  await env.DB.prepare('DELETE FROM chat_messages WHERE user_id = ?').bind(data.userId).run()
  return json({ success: true })
}
