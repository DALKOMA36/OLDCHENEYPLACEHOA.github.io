import { json, error, parseBody } from './_helpers'

export async function onRequestGet({ env, request, data }) {
  const url = new URL(request.url)
  const date = url.searchParams.get('date')

  let stmt
  if (date) {
    stmt = env.DB.prepare('SELECT * FROM events WHERE user_id = ? AND date = ? ORDER BY time').bind(data.userId, date)
  } else {
    stmt = env.DB.prepare('SELECT * FROM events WHERE user_id = ? ORDER BY date, time').bind(data.userId)
  }
  const { results } = await stmt.all()
  return json(results)
}

export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  if (!body.title || !body.date) return error('title and date required')

  const result = await env.DB.prepare(
    'INSERT INTO events (user_id, title, time, location, calendar, color, date) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(data.userId, body.title, body.time || '', body.location || '', body.calendar || 'personal', body.color || '#6c5ce7', body.date).run()

  return json({ id: result.meta.last_row_id, ...body }, 201)
}

export async function onRequestPut({ env, request, data }) {
  const body = await parseBody(request)
  if (!body.id) return error('id required')

  await env.DB.prepare(
    'UPDATE events SET title = ?, time = ?, location = ?, calendar = ?, color = ?, date = ? WHERE id = ? AND user_id = ?'
  ).bind(body.title, body.time || '', body.location || '', body.calendar || 'personal', body.color || '#6c5ce7', body.date, body.id).run()

  return json({ success: true })
}

export async function onRequestDelete({ env, request, data }) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return error('id required')

  await env.DB.prepare('DELETE FROM events WHERE id = ? AND user_id = ?').bind(id).run()
  return json({ success: true })
}
