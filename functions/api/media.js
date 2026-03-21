import { json, error, parseBody } from './_helpers'

async function ensureTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS podcast_feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      url TEXT,
      title TEXT,
      image TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS saved_places (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      name TEXT,
      address TEXT
    )
  `).run()
}

export async function onRequestGet({ env, request, data }) {
  await ensureTables(env)
  const url = new URL(request.url)
  const type = url.searchParams.get('type')

  if (type === 'places') {
    const { results } = await env.DB.prepare(
      'SELECT * FROM saved_places WHERE user_id = ?'
    ).bind(data.userId).all()
    return json(results)
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM podcast_feeds WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(data.userId).all()
  return json(results)
}

export async function onRequestPost({ env, request, data }) {
  await ensureTables(env)
  const url = new URL(request.url)
  const type = url.searchParams.get('type')
  const body = await parseBody(request)

  if (type === 'place') {
    if (!body.name) return error('name required')
    const result = await env.DB.prepare(
      'INSERT INTO saved_places (user_id, name, address) VALUES (?, ?, ?)'
    ).bind(data.userId, body.name, body.address || '').run()
    return json({ id: result.meta.last_row_id, ...body }, 201)
  }

  if (!body.url) return error('url required')
  const result = await env.DB.prepare(
    'INSERT INTO podcast_feeds (user_id, url, title, image) VALUES (?, ?, ?, ?)'
  ).bind(data.userId, body.url, body.title || '', body.image || '').run()

  return json({ id: result.meta.last_row_id, ...body }, 201)
}

export async function onRequestPut({ env, request, data }) {
  await ensureTables(env)
  const body = await parseBody(request)
  if (!body.id) return error('id required')

  await env.DB.prepare(
    'UPDATE saved_places SET name = ?, address = ? WHERE id = ? AND user_id = ?'
  ).bind(body.name, body.address || '', body.id, data.userId).run()

  return json({ success: true })
}

export async function onRequestDelete({ env, request, data }) {
  await ensureTables(env)
  const url = new URL(request.url)
  const type = url.searchParams.get('type')
  const id = url.searchParams.get('id')
  if (!id) return error('id required')

  if (type === 'place') {
    await env.DB.prepare('DELETE FROM saved_places WHERE id = ? AND user_id = ?').bind(id, data.userId).run()
    return json({ success: true })
  }

  await env.DB.prepare('DELETE FROM podcast_feeds WHERE id = ? AND user_id = ?').bind(id, data.userId).run()
  return json({ success: true })
}
