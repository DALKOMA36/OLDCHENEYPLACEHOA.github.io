import { json, error, parseBody } from './_helpers'

async function ensureTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      name TEXT,
      color TEXT,
      frequency TEXT,
      log TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run()
}

export async function onRequestGet({ env, data }) {
  await ensureTable(env)
  const { results } = await env.DB.prepare(
    'SELECT * FROM habits WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(data.userId).all()
  return json(results)
}

export async function onRequestPost({ env, request, data }) {
  await ensureTable(env)
  const body = await parseBody(request)
  if (!body.name) return error('name required')

  const result = await env.DB.prepare(
    'INSERT INTO habits (user_id, name, color, frequency, log) VALUES (?, ?, ?, ?, ?)'
  ).bind(data.userId, body.name, body.color || '', body.frequency || 'daily', body.log || '{}').run()

  return json({ id: result.meta.last_row_id, ...body }, 201)
}

export async function onRequestPut({ env, request, data }) {
  await ensureTable(env)
  const body = await parseBody(request)
  if (!body.id) return error('id required')

  await env.DB.prepare(
    'UPDATE habits SET name = ?, color = ?, frequency = ?, log = ? WHERE id = ? AND user_id = ?'
  ).bind(body.name, body.color || '', body.frequency || 'daily', body.log || '{}', body.id, data.userId).run()

  return json({ success: true })
}

export async function onRequestDelete({ env, request, data }) {
  await ensureTable(env)
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return error('id required')

  await env.DB.prepare('DELETE FROM habits WHERE id = ? AND user_id = ?').bind(id, data.userId).run()
  return json({ success: true })
}
