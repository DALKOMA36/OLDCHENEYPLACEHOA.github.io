import { json, error, parseBody, USER_ID } from './_helpers'

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url)
  const date = url.searchParams.get('date')

  let stmt
  if (date) {
    stmt = env.DB.prepare('SELECT * FROM events WHERE user_id = ? AND date = ? ORDER BY time').bind(USER_ID, date)
  } else {
    stmt = env.DB.prepare('SELECT * FROM events WHERE user_id = ? ORDER BY date, time').bind(USER_ID)
  }
  const { results } = await stmt.all()
  return json(results)
}

export async function onRequestPost({ env, request }) {
  const body = await parseBody(request)
  if (!body.title || !body.date) return error('title and date required')

  const result = await env.DB.prepare(
    'INSERT INTO events (user_id, title, time, location, calendar, color, date) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(USER_ID, body.title, body.time || '', body.location || '', body.calendar || 'personal', body.color || '#6c5ce7', body.date).run()

  return json({ id: result.meta.last_row_id, ...body }, 201)
}

export async function onRequestPut({ env, request }) {
  const body = await parseBody(request)
  if (!body.id) return error('id required')

  await env.DB.prepare(
    'UPDATE events SET title = ?, time = ?, location = ?, calendar = ?, color = ?, date = ? WHERE id = ? AND user_id = ?'
  ).bind(body.title, body.time || '', body.location || '', body.calendar || 'personal', body.color || '#6c5ce7', body.date, body.id, USER_ID).run()

  return json({ success: true })
}

export async function onRequestDelete({ env, request }) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return error('id required')

  await env.DB.prepare('DELETE FROM events WHERE id = ? AND user_id = ?').bind(id, USER_ID).run()
  return json({ success: true })
}
