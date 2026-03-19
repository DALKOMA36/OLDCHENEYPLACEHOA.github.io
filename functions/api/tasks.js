import { json, error, parseBody } from './_helpers'

export async function onRequestGet({ env, data }) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(data.userId).all()
  return json(results.map(r => ({ ...r, recurring: !!r.recurring, completed: !!r.completed })))
}

export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  if (!body.title) return error('title required')

  const result = await env.DB.prepare(
    'INSERT INTO tasks (user_id, title, priority, assignee, due_date, recurring, category, completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(data.userId, body.title, body.priority || 'medium', body.assignee || '', body.dueDate || body.due_date || null, body.recurring ? 1 : 0, body.category || 'personal', body.completed ? 1 : 0).run()

  return json({ id: result.meta.last_row_id, ...body }, 201)
}

export async function onRequestPut({ env, request, data }) {
  const body = await parseBody(request)
  if (!body.id) return error('id required')

  await env.DB.prepare(
    'UPDATE tasks SET title = ?, priority = ?, assignee = ?, due_date = ?, recurring = ?, category = ?, completed = ? WHERE id = ? AND user_id = ?'
  ).bind(body.title, body.priority || 'medium', body.assignee || '', body.dueDate || body.due_date || null, body.recurring ? 1 : 0, body.category || 'personal', body.completed ? 1 : 0, body.id).run()

  return json({ success: true })
}

export async function onRequestDelete({ env, request, data }) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return error('id required')

  await env.DB.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').bind(id).run()
  return json({ success: true })
}
