import { json, error, parseBody } from './_helpers'

async function ensureTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS finance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      amount REAL,
      description TEXT,
      category TEXT,
      date TEXT,
      time TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      category TEXT UNIQUE,
      amount REAL
    )
  `).run()
}

export async function onRequestGet({ env, request, data }) {
  await ensureTables(env)
  const url = new URL(request.url)
  const type = url.searchParams.get('type')

  if (type === 'budgets') {
    const { results } = await env.DB.prepare(
      'SELECT * FROM budgets WHERE user_id = ?'
    ).bind(data.userId).all()
    return json(results)
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM finance WHERE user_id = ? ORDER BY date DESC, time DESC'
  ).bind(data.userId).all()
  return json(results)
}

export async function onRequestPost({ env, request, data }) {
  await ensureTables(env)
  const url = new URL(request.url)
  const type = url.searchParams.get('type')
  const body = await parseBody(request)

  if (type === 'budget') {
    if (!body.category) return error('category required')
    const result = await env.DB.prepare(
      'INSERT INTO budgets (user_id, category, amount) VALUES (?, ?, ?) ON CONFLICT(category) DO UPDATE SET amount = ?'
    ).bind(data.userId, body.category, body.amount || 0, body.amount || 0).run()
    return json({ id: result.meta.last_row_id, ...body }, 201)
  }

  if (!body.description) return error('description required')
  const result = await env.DB.prepare(
    'INSERT INTO finance (user_id, amount, description, category, date, time) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(data.userId, body.amount || 0, body.description, body.category || '', body.date || '', body.time || '').run()

  return json({ id: result.meta.last_row_id, ...body }, 201)
}

export async function onRequestDelete({ env, request, data }) {
  await ensureTables(env)
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return error('id required')

  await env.DB.prepare('DELETE FROM finance WHERE id = ? AND user_id = ?').bind(id, data.userId).run()
  return json({ success: true })
}
