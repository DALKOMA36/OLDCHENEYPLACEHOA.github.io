import { json, error, parseBody } from './_helpers'

// POST /api/push/subscribe - Store push subscription
export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  const { subscription, action } = body

  if (action === 'subscribe') {
    if (!subscription?.endpoint) return error('subscription required')

    // Create push_subscriptions table if not exists
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        keys_p256dh TEXT,
        keys_auth TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run()

    await env.DB.prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = ?, keys_p256dh = ?, keys_auth = ?`
    ).bind(
      data.userId, subscription.endpoint,
      subscription.keys?.p256dh || '', subscription.keys?.auth || '',
      data.userId, subscription.keys?.p256dh || '', subscription.keys?.auth || ''
    ).run()

    return json({ success: true })
  }

  if (action === 'unsubscribe') {
    if (!subscription?.endpoint) return error('endpoint required')
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')
      .bind(subscription.endpoint, data.userId).run()
    return json({ success: true })
  }

  return error('action required: subscribe or unsubscribe')
}
