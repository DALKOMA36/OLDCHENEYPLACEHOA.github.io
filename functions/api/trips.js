import { json, error, parseBody, USER_ID } from './_helpers'

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM trips WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(USER_ID).all()
  return json(results.map(r => ({
    ...r,
    interests: JSON.parse(r.interests || '[]'),
    itinerary: JSON.parse(r.itinerary || '{}'),
  })))
}

export async function onRequestPost({ env, request }) {
  const body = await parseBody(request)
  if (!body.destination) return error('destination required')

  const result = await env.DB.prepare(
    'INSERT INTO trips (user_id, destination, start_date, end_date, travelers, style, interests, budget, status, itinerary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    USER_ID, body.destination, body.startDate || body.start_date || null, body.endDate || body.end_date || null,
    body.travelers || 1, body.style || 'mixed', JSON.stringify(body.interests || []),
    body.budget || 'moderate', body.status || 'planned', JSON.stringify(body.itinerary || {})
  ).run()

  return json({ id: result.meta.last_row_id, ...body }, 201)
}

export async function onRequestPut({ env, request }) {
  const body = await parseBody(request)
  if (!body.id) return error('id required')

  await env.DB.prepare(
    'UPDATE trips SET destination = ?, start_date = ?, end_date = ?, travelers = ?, style = ?, interests = ?, budget = ?, status = ?, itinerary = ? WHERE id = ? AND user_id = ?'
  ).bind(
    body.destination, body.startDate || body.start_date || null, body.endDate || body.end_date || null,
    body.travelers || 1, body.style || 'mixed', JSON.stringify(body.interests || []),
    body.budget || 'moderate', body.status || 'planned', JSON.stringify(body.itinerary || {}),
    body.id, USER_ID
  ).run()

  return json({ success: true })
}

export async function onRequestDelete({ env, request }) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return error('id required')

  await env.DB.prepare('DELETE FROM trips WHERE id = ? AND user_id = ?').bind(id, USER_ID).run()
  return json({ success: true })
}
