import { json, error, parseBody } from './_helpers'

async function ensureTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      title TEXT,
      body TEXT,
      category TEXT,
      pinned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run()
}

export async function onRequestGet({ env, data }) {
  await ensureTable(env)
  const { results } = await env.DB.prepare(
    'SELECT * FROM notes WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC'
  ).bind(data.userId).all()
  return json(results.map(r => ({ ...r, pinned: !!r.pinned })))
}

export async function onRequestPost({ env, request, data }) {
  await ensureTable(env)
  const body = await parseBody(request)
  if (!body.title) return error('title required')

  const result = await env.DB.prepare(
    'INSERT INTO notes (user_id, title, body, category, pinned) VALUES (?, ?, ?, ?, ?)'
  ).bind(data.userId, body.title, body.body || '', body.category || '', body.pinned ? 1 : 0).run()

  return json({ id: result.meta.last_row_id, ...body }, 201)
}

export async function onRequestPut({ env, request, data }) {
  await ensureTable(env)
  const body = await parseBody(request)
  if (!body.id) return error('id required')

  await env.DB.prepare(
    'UPDATE notes SET title = ?, body = ?, category = ?, pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
  ).bind(body.title, body.body || '', body.category || '', body.pinned ? 1 : 0, body.id, data.userId).run()

  return json({ success: true })
}

export async function onRequestDelete({ env, request, data }) {
  await ensureTable(env)
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return error('id required')

  await env.DB.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').bind(id, data.userId).run()
  return json({ success: true })
}
