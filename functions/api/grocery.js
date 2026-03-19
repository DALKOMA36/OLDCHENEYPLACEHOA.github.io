import { json, error, parseBody } from './_helpers'

export async function onRequestGet({ env, data }) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM grocery_items WHERE user_id = ? ORDER BY created_at'
  ).bind(data.userId).all()
  return json(results.map(r => ({ ...r, checked: !!r.checked })))
}

export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  if (!body.name) return error('name required')

  const result = await env.DB.prepare(
    'INSERT INTO grocery_items (user_id, name, count, checked) VALUES (?, ?, ?, ?)'
  ).bind(data.userId, body.name, body.count || 1, 0).run()

  return json({ id: result.meta.last_row_id, ...body }, 201)
}

export async function onRequestPut({ env, request, data }) {
  const body = await parseBody(request)
  if (!body.id) return error('id required')

  await env.DB.prepare(
    'UPDATE grocery_items SET name = ?, count = ?, checked = ? WHERE id = ? AND user_id = ?'
  ).bind(body.name, body.count || 1, body.checked ? 1 : 0, body.id).run()

  return json({ success: true })
}

export async function onRequestDelete({ env, request, data }) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')

  if (id) {
    await env.DB.prepare('DELETE FROM grocery_items WHERE id = ? AND user_id = ?').bind(id).run()
  } else {
    // Delete all checked items
    await env.DB.prepare('DELETE FROM grocery_items WHERE user_id = ? AND checked = 1').bind(data.userId).run()
  }
  return json({ success: true })
}
