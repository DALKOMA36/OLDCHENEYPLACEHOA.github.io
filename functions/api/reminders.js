import { json, error, parseBody, USER_ID } from './_helpers'

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM reminders WHERE user_id = ? ORDER BY date, time'
  ).bind(USER_ID).all()
  return json(results.map(r => ({ ...r, dismissed: !!r.dismissed })))
}

export async function onRequestPost({ env, request }) {
  const body = await parseBody(request)
  if (!body.text || !body.date) return error('text and date required')

  const result = await env.DB.prepare(
    'INSERT INTO reminders (user_id, text, date, time, repeat, priority, dismissed) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(USER_ID, body.text, body.date, body.time || '09:00', body.repeat || 'none', body.priority || 'normal', 0).run()

  return json({ id: result.meta.last_row_id, ...body }, 201)
}

export async function onRequestPut({ env, request }) {
  const body = await parseBody(request)
  if (!body.id) return error('id required')

  await env.DB.prepare(
    'UPDATE reminders SET text = ?, date = ?, time = ?, repeat = ?, priority = ?, dismissed = ? WHERE id = ? AND user_id = ?'
  ).bind(body.text, body.date, body.time || '09:00', body.repeat || 'none', body.priority || 'normal', body.dismissed ? 1 : 0, body.id, USER_ID).run()

  return json({ success: true })
}

export async function onRequestDelete({ env, request }) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return error('id required')

  await env.DB.prepare('DELETE FROM reminders WHERE id = ? AND user_id = ?').bind(id, USER_ID).run()
  return json({ success: true })
}
