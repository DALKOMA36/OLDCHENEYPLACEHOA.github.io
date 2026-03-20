import { json } from './_helpers'

// GET /api/debug - View debug logs
export async function onRequestGet({ env, data }) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM debug_log ORDER BY id DESC LIMIT 50'
  ).all()
  return json(results)
}

// DELETE /api/debug - Clear logs
export async function onRequestDelete({ env, data }) {
  await env.DB.prepare('DELETE FROM debug_log').run()
  return json({ success: true })
}
