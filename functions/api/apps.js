import { json, error, parseBody } from './_helpers'

// GET /api/apps - list all custom apps with their entries
export async function onRequestGet({ env, data }) {
  const { results: apps } = await env.DB.prepare(
    'SELECT * FROM custom_apps WHERE user_id = ? ORDER BY created_at'
  ).bind(data.userId).all()

  const fullApps = []
  for (const app of apps) {
    const { results: entries } = await env.DB.prepare(
      'SELECT * FROM custom_app_entries WHERE app_id = ? ORDER BY created_at'
    ).bind(app.id).all()

    fullApps.push({
      ...app,
      fields: JSON.parse(app.fields || '[]'),
      entries: entries.map(e => ({ ...e, data: JSON.parse(e.data || '{}') })),
    })
  }
  return json(fullApps)
}

// POST /api/apps - create a new custom app
export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  if (!body.name) return error('name required')

  const result = await env.DB.prepare(
    'INSERT INTO custom_apps (user_id, name, icon, fields) VALUES (?, ?, ?, ?)'
  ).bind(data.userId, body.name, body.icon || '📋', JSON.stringify(body.fields || [])).run()

  return json({ id: result.meta.last_row_id, ...body, entries: [] }, 201)
}

// PUT /api/apps - update app or add entry
export async function onRequestPut({ env, request, data }) {
  const body = await parseBody(request)

  // Add entry to an app
  if (body.app_id && body.data) {
    const result = await env.DB.prepare(
      'INSERT INTO custom_app_entries (app_id, data) VALUES (?, ?)'
    ).bind(body.app_id, JSON.stringify(body.data)).run()
    return json({ id: result.meta.last_row_id }, 201)
  }

  // Update app itself
  if (!body.id) return error('id required')
  await env.DB.prepare(
    'UPDATE custom_apps SET name = ?, icon = ?, fields = ? WHERE id = ? AND user_id = ?'
  ).bind(body.name, body.icon || '📋', JSON.stringify(body.fields || []), body.id).run()

  return json({ success: true })
}

export async function onRequestDelete({ env, request, data }) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const entryId = url.searchParams.get('entry_id')

  if (entryId) {
    await env.DB.prepare('DELETE FROM custom_app_entries WHERE id = ?').bind(entryId).run()
    return json({ success: true })
  }

  if (!id) return error('id required')
  // Cascade deletes entries too (FK constraint)
  await env.DB.prepare('DELETE FROM custom_apps WHERE id = ? AND user_id = ?').bind(id).run()
  return json({ success: true })
}
