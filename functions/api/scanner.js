import { json, error, parseBody, USER_ID } from './_helpers'

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM scanned_docs WHERE user_id = ? ORDER BY scanned_at DESC'
  ).bind(USER_ID).all()
  return json(results.map(r => ({ ...r, items: JSON.parse(r.items || '[]') })))
}

export async function onRequestPost({ env, request }) {
  const body = await parseBody(request)

  const result = await env.DB.prepare(
    'INSERT INTO scanned_docs (user_id, doc_type, items, source) VALUES (?, ?, ?, ?)'
  ).bind(USER_ID, body.type || body.doc_type || '', JSON.stringify(body.items || []), body.source || '').run()

  return json({ id: result.meta.last_row_id }, 201)
}

export async function onRequestDelete({ env, request }) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return error('id required')

  await env.DB.prepare('DELETE FROM scanned_docs WHERE id = ? AND user_id = ?').bind(id, USER_ID).run()
  return json({ success: true })
}
