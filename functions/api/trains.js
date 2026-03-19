import { json, error, parseBody } from './_helpers'

export async function onRequestGet({ env, data }) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM train_schedule WHERE user_id = ? ORDER BY created_at'
  ).bind(data.userId).all()
  return json(results.map(r => ({ ...r, days: JSON.parse(r.days || '[]') })))
}

export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  if (!body.train || !body.direction || !body.boardStation && !body.board_station) return error('train, direction, boardStation required')

  const result = await env.DB.prepare(
    'INSERT INTO train_schedule (user_id, train, direction, board_station, exit_station, days, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(data.userId, body.train, body.direction, body.boardStation || body.board_station, body.exitStation || body.exit_station || '', JSON.stringify(body.days || []), body.note || '').run()

  return json({ id: result.meta.last_row_id, ...body }, 201)
}

export async function onRequestPut({ env, request, data }) {
  const body = await parseBody(request)
  if (!body.id) return error('id required')

  await env.DB.prepare(
    'UPDATE train_schedule SET train = ?, direction = ?, board_station = ?, exit_station = ?, days = ?, note = ? WHERE id = ? AND user_id = ?'
  ).bind(body.train, body.direction, body.boardStation || body.board_station, body.exitStation || body.exit_station || '', JSON.stringify(body.days || []), body.note || '', body.id).run()

  return json({ success: true })
}

export async function onRequestDelete({ env, request, data }) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return error('id required')

  await env.DB.prepare('DELETE FROM train_schedule WHERE id = ? AND user_id = ?').bind(id).run()
  return json({ success: true })
}
