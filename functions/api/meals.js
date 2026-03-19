import { json, error, parseBody } from './_helpers'

// GET /api/meals - returns meal plan as { slot: meal } map
export async function onRequestGet({ env, data }) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM meal_plans WHERE user_id = ?'
  ).bind(data.userId).all()

  const mealPlan = {}
  for (const row of results) {
    mealPlan[row.slot] = {
      id: row.id,
      name: row.name,
      time: row.time,
      cal: row.cal,
      ingredients: JSON.parse(row.ingredients || '[]'),
    }
  }
  return json(mealPlan)
}

// POST /api/meals - upsert a meal slot
export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  if (!body.slot || !body.name) return error('slot and name required')

  await env.DB.prepare(
    `INSERT INTO meal_plans (user_id, slot, name, time, cal, ingredients)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, slot) DO UPDATE SET name = ?, time = ?, cal = ?, ingredients = ?`
  ).bind(
    data.userId, body.slot, body.name, body.time || '', body.cal || 0, JSON.stringify(body.ingredients || []),
    body.name, body.time || '', body.cal || 0, JSON.stringify(body.ingredients || [])
  ).run()

  return json({ success: true }, 201)
}

// PUT /api/meals - bulk upsert entire meal plan
export async function onRequestPut({ env, request, data }) {
  const mealPlan = await parseBody(request)

  const stmts = []
  for (const [slot, meal] of Object.entries(mealPlan)) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO meal_plans (user_id, slot, name, time, cal, ingredients)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, slot) DO UPDATE SET name = ?, time = ?, cal = ?, ingredients = ?`
      ).bind(
        data.userId, slot, meal.name || '', meal.time || '', meal.cal || 0, JSON.stringify(meal.ingredients || []),
        meal.name || '', meal.time || '', meal.cal || 0, JSON.stringify(meal.ingredients || [])
      )
    )
  }

  if (stmts.length > 0) await env.DB.batch(stmts)
  return json({ success: true })
}

export async function onRequestDelete({ env, request, data }) {
  const url = new URL(request.url)
  const slot = url.searchParams.get('slot')

  if (slot) {
    await env.DB.prepare('DELETE FROM meal_plans WHERE user_id = ? AND slot = ?').bind(data.userId, slot).run()
  } else {
    await env.DB.prepare('DELETE FROM meal_plans WHERE user_id = ?').bind(data.userId).run()
  }
  return json({ success: true })
}
