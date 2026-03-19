import { json, parseBody } from './_helpers'

// POST /api/sync - bulk import from localStorage to D1
// Accepts the full localStorage dump and populates all tables
export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  const results = {}

  // User profile
  if (body.user) {
    const u = body.user
    await env.DB.prepare(
      `INSERT INTO users (id, name, preferences, integrations, circle, memory, onboarded)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = ?, preferences = ?, integrations = ?, circle = ?, memory = ?, onboarded = ?, updated_at = datetime('now')`
    ).bind(
      data.userId, u.name || 'Friend', JSON.stringify(u.preferences || {}), JSON.stringify(u.integrations || {}),
      JSON.stringify(u.circle || []), JSON.stringify(u.memory || []), u.onboarded ? 1 : 0,
      u.name || 'Friend', JSON.stringify(u.preferences || {}), JSON.stringify(u.integrations || {}),
      JSON.stringify(u.circle || []), JSON.stringify(u.memory || []), u.onboarded ? 1 : 0
    ).run()
    results.user = 'synced'
  }

  // Settings
  if (body.briefingTime !== undefined || body.briefingDays !== undefined || body.diet !== undefined) {
    const fields = []
    const values = []
    if (body.briefingTime !== undefined) { fields.push('briefing_time = ?'); values.push(body.briefingTime) }
    if (body.briefingDays !== undefined) { fields.push('briefing_days = ?'); values.push(JSON.stringify(body.briefingDays)) }
    if (body.diet !== undefined) { fields.push('diet = ?'); values.push(body.diet) }
    if (fields.length > 0) {
      await env.DB.prepare(`UPDATE users SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...values).run()
    }
    results.settings = 'synced'
  }

  // Events
  if (body.events?.length) {
    const stmts = body.events.map(e =>
      env.DB.prepare('INSERT INTO events (user_id, title, time, location, calendar, color, date) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(data.userId, e.title, e.time || '', e.location || '', e.calendar || 'personal', e.color || '#6c5ce7', e.date)
    )
    await env.DB.batch(stmts)
    results.events = stmts.length
  }

  // Tasks
  if (body.tasks?.length) {
    const stmts = body.tasks.map(t =>
      env.DB.prepare('INSERT INTO tasks (user_id, title, priority, assignee, due_date, recurring, category, completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(data.userId, t.title, t.priority || 'medium', t.assignee || '', t.dueDate || t.due_date || null, t.recurring ? 1 : 0, t.category || 'personal', t.completed ? 1 : 0)
    )
    await env.DB.batch(stmts)
    results.tasks = stmts.length
  }

  // Reminders
  if (body.reminders?.length) {
    const stmts = body.reminders.map(r =>
      env.DB.prepare('INSERT INTO reminders (user_id, text, date, time, repeat, priority, dismissed) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(data.userId, r.text, r.date, r.time || '09:00', r.repeat || 'none', r.priority || 'normal', r.dismissed ? 1 : 0)
    )
    await env.DB.batch(stmts)
    results.reminders = stmts.length
  }

  // Chat messages
  if (body.chatMessages?.length) {
    const stmts = body.chatMessages.map(m =>
      env.DB.prepare('INSERT INTO chat_messages (user_id, role, text, time) VALUES (?, ?, ?, ?)')
        .bind(data.userId, m.role, m.text, m.time || '')
    )
    await env.DB.batch(stmts)
    results.chatMessages = stmts.length
  }

  // Meal plan
  if (body.mealPlan && typeof body.mealPlan === 'object') {
    const stmts = Object.entries(body.mealPlan).map(([slot, meal]) =>
      env.DB.prepare(
        `INSERT INTO meal_plans (user_id, slot, name, time, cal, ingredients)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, slot) DO UPDATE SET name = ?, time = ?, cal = ?, ingredients = ?`
      ).bind(
        data.userId, slot, meal.name || '', meal.time || '', meal.cal || 0, JSON.stringify(meal.ingredients || []),
        meal.name || '', meal.time || '', meal.cal || 0, JSON.stringify(meal.ingredients || [])
      )
    )
    if (stmts.length) await env.DB.batch(stmts)
    results.mealPlan = stmts.length
  }

  // Grocery list
  if (body.groceryList?.length) {
    const stmts = body.groceryList.map(g =>
      env.DB.prepare('INSERT INTO grocery_items (user_id, name, count, checked) VALUES (?, ?, ?, ?)')
        .bind(data.userId, g.name, g.count || 1, g.checked ? 1 : 0)
    )
    await env.DB.batch(stmts)
    results.groceryList = stmts.length
  }

  // Sent messages
  if (body.sentMessages?.length) {
    const stmts = body.sentMessages.map(m =>
      env.DB.prepare('INSERT INTO sent_messages (user_id, recipient, message, channel) VALUES (?, ?, ?, ?)')
        .bind(data.userId, m.to || m.recipient || '', m.message, m.channel || 'sms')
    )
    await env.DB.batch(stmts)
    results.sentMessages = stmts.length
  }

  // Drafts
  if (body.drafts?.length) {
    const stmts = body.drafts.map(d =>
      env.DB.prepare('INSERT INTO drafts (user_id, recipient, message, channel) VALUES (?, ?, ?, ?)')
        .bind(data.userId, d.to || d.recipient || '', d.message || '', d.channel || 'sms')
    )
    await env.DB.batch(stmts)
    results.drafts = stmts.length
  }

  // Scanned docs
  if (body.scannedDocs?.length) {
    const stmts = body.scannedDocs.map(d =>
      env.DB.prepare('INSERT INTO scanned_docs (user_id, doc_type, items, source) VALUES (?, ?, ?, ?)')
        .bind(data.userId, d.type || d.doc_type || '', JSON.stringify(d.items || []), d.source || '')
    )
    await env.DB.batch(stmts)
    results.scannedDocs = stmts.length
  }

  // Train schedule
  if (body.trainSchedule?.length) {
    const stmts = body.trainSchedule.map(s =>
      env.DB.prepare('INSERT INTO train_schedule (user_id, train, direction, board_station, exit_station, days, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(data.userId, s.train, s.direction, s.boardStation || s.board_station, s.exitStation || s.exit_station || '', JSON.stringify(s.days || []), s.note || '')
    )
    await env.DB.batch(stmts)
    results.trainSchedule = stmts.length
  }

  // Trips
  if (body.trips?.length) {
    const stmts = body.trips.map(t =>
      env.DB.prepare('INSERT INTO trips (user_id, destination, start_date, end_date, travelers, style, interests, budget, status, itinerary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(data.userId, t.destination, t.startDate || t.start_date || null, t.endDate || t.end_date || null, t.travelers || 1, t.style || 'mixed', JSON.stringify(t.interests || []), t.budget || 'moderate', t.status || 'planned', JSON.stringify(t.itinerary || {}))
    )
    await env.DB.batch(stmts)
    results.trips = stmts.length
  }

  // Custom apps
  if (body.customApps?.length) {
    for (const app of body.customApps) {
      const appResult = await env.DB.prepare(
        'INSERT INTO custom_apps (user_id, name, icon, fields) VALUES (?, ?, ?, ?)'
      ).bind(data.userId, app.name, app.icon || '📋', JSON.stringify(app.fields || [])).run()

      if (app.entries?.length) {
        const stmts = app.entries.map(e =>
          env.DB.prepare('INSERT INTO custom_app_entries (app_id, data) VALUES (?, ?)')
            .bind(appResult.meta.last_row_id, JSON.stringify(e.data || {}))
        )
        await env.DB.batch(stmts)
      }
    }
    results.customApps = body.customApps.length
  }

  return json({ success: true, imported: results })
}
