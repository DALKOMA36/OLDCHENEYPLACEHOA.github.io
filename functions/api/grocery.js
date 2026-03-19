import { json, error, parseBody, USER_ID } from './_helpers'

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM grocery_items WHERE user_id = ? ORDER BY created_at'
  ).bind(USER_ID).all()
  return json(results.map(r => ({ ...r, checked: !!r.checked })))
}

export async function onRequestPost({ env, request }) {
  const body = await parseBody(request)
  if (!body.name) return error('name required')

  const result = await env.DB.prepare(
    'INSERT INTO grocery_items (user_id, name, count, checked) VALUES (?, ?, ?, ?)'
  ).bind(USER_ID, body.name, body.count || 1, 0).run()

  return json({ id: result.meta.last_row_id, ...body }, 201)
}

export async function onRequestPut({ env, request }) {
  const body = await parseBody(request)
  if (!body.id) return error('id required')

  await env.DB.prepare(
    'UPDATE grocery_items SET name = ?, count = ?, checked = ? WHERE id = ? AND user_id = ?'
  ).bind(body.name, body.count || 1, body.checked ? 1 : 0, body.id, USER_ID).run()

  return json({ success: true })
}

export async function onRequestDelete({ env, request }) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')

  if (id) {
    await env.DB.prepare('DELETE FROM grocery_items WHERE id = ? AND user_id = ?').bind(id, USER_ID).run()
  } else {
    // Delete all checked items
    await env.DB.prepare('DELETE FROM grocery_items WHERE user_id = ? AND checked = 1').bind(USER_ID).run()
  }
  return json({ success: true })
}
