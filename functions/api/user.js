import { json, error, parseBody } from './_helpers'

export async function onRequestGet({ env, data }) {
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(data.userId).first()
  if (!row) {
    await env.DB.prepare('INSERT INTO users (id) VALUES (?)').bind(data.userId).run()
    return json({ id: data.userId, name: 'Friend', preferences: {}, integrations: {}, circle: [], memory: [], onboarded: false, briefing_time: '07:00', briefing_days: ['Monday','Tuesday','Wednesday','Thursday','Friday'], diet: '' })
  }
  return json({
    ...row,
    preferences: JSON.parse(row.preferences || '{}'),
    integrations: JSON.parse(row.integrations || '{}'),
    circle: JSON.parse(row.circle || '[]'),
    memory: JSON.parse(row.memory || '[]'),
    briefing_days: JSON.parse(row.briefing_days || '[]'),
    onboarded: !!row.onboarded,
  })
}

export async function onRequestPut({ env, request, data }) {
  const body = await parseBody(request)
  const fields = []
  const values = []

  const stringFields = ['name', 'diet', 'briefing_time']
  const jsonFields = ['preferences', 'integrations', 'circle', 'memory', 'briefing_days']
  const boolFields = ['onboarded']

  for (const f of stringFields) {
    if (body[f] !== undefined) { fields.push(`${f} = ?`); values.push(body[f]) }
  }
  for (const f of jsonFields) {
    if (body[f] !== undefined) { fields.push(`${f} = ?`); values.push(JSON.stringify(body[f])) }
  }
  for (const f of boolFields) {
    if (body[f] !== undefined) { fields.push(`${f} = ?`); values.push(body[f] ? 1 : 0) }
  }

  if (fields.length === 0) return error('No fields to update')

  fields.push("updated_at = datetime('now')")

  // Upsert: try update first, insert if no rows affected
  const result = await env.DB.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
  if (result.meta.changes === 0) {
    await env.DB.prepare('INSERT INTO users (id) VALUES (?)').bind(data.userId).run()
    await env.DB.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
  }

  return json({ success: true })
}
