// JARVIS Smart Suggestions Engine
// Analyzes all user data + memory to proactively suggest useful things
// Runs locally — no API call needed

import { loadState } from './constants'

export function generateSuggestions(user) {
  const now = new Date()
  const hour = now.getHours()
  const dayOfWeek = now.getDay() // 0=Sun
  const todayStr = now.toISOString().split('T')[0]
  const suggestions = []

  // ---- From Tasks ----
  const tasks = loadState('tasks', [])
  const pending = tasks.filter(t => !t.completed)
  const overdue = pending.filter(t => t.due_date && t.due_date < todayStr)
  const dueToday = pending.filter(t => t.due_date === todayStr)
  const highPriority = pending.filter(t => t.priority === 'high')

  if (overdue.length > 0) {
    suggestions.push({
      type: 'warning', priority: 10,
      text: `You have ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}: "${overdue[0].title}"${overdue.length > 1 ? ` and ${overdue.length - 1} more` : ''}`,
      action: 'tasks',
    })
  }
  if (dueToday.length > 0) {
    suggestions.push({
      type: 'info', priority: 8,
      text: `${dueToday.length} task${dueToday.length > 1 ? 's' : ''} due today. "${dueToday[0].title}" is first.`,
      action: 'tasks',
    })
  }
  if (highPriority.length > 0 && !dueToday.length && !overdue.length) {
    suggestions.push({
      type: 'info', priority: 5,
      text: `${highPriority.length} high-priority task${highPriority.length > 1 ? 's' : ''} waiting.`,
      action: 'tasks',
    })
  }

  // ---- From Calendar ----
  const events = loadState('events', [])
  const todayEvents = events.filter(e => e.date === todayStr)
  const nextEvent = todayEvents.filter(e => {
    if (!e.time) return false
    const [h, m] = e.time.split(':').map(Number)
    const t = new Date(); t.setHours(h, m, 0, 0)
    return t > now
  }).sort((a, b) => (a.time || '').localeCompare(b.time || ''))[0]

  if (nextEvent) {
    const [h, m] = nextEvent.time.split(':').map(Number)
    const t = new Date(); t.setHours(h, m, 0, 0)
    const diffMin = Math.round((t - now) / 60000)
    if (diffMin <= 60 && diffMin > 0) {
      suggestions.push({
        type: 'alert', priority: 9,
        text: `"${nextEvent.title}" in ${diffMin} minutes${nextEvent.location ? ` at ${nextEvent.location}` : ''}.`,
        action: 'calendar',
      })
    }
  }

  // ---- From Habits ----
  const habits = loadState('habits_data', [])
  if (habits.length > 0) {
    const done = habits.filter(h => h.log?.[todayStr]).length
    const remaining = habits.length - done
    if (remaining > 0 && hour >= 10) {
      suggestions.push({
        type: 'nudge', priority: 4,
        text: `${remaining} habit${remaining > 1 ? 's' : ''} not done today. ${done > 0 ? `${done} already checked off.` : 'Get started!'}`,
        action: 'habits',
      })
    }
    if (remaining === 0 && habits.length > 0) {
      suggestions.push({
        type: 'success', priority: 2,
        text: 'All habits complete today. Keep the streak going.',
        action: 'habits',
      })
    }
  }

  // ---- From Finance ----
  const txns = loadState('finance_txns', [])
  const budgets = loadState('finance_budgets', {})
  const month = todayStr.slice(0, 7)
  const monthSpend = txns.filter(t => t.date?.startsWith(month) && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)

  const totalBudget = Object.values(budgets).reduce((s, v) => s + (v || 0), 0)
  if (totalBudget > 0 && monthSpend > totalBudget * 0.8) {
    const pct = Math.round((monthSpend / totalBudget) * 100)
    suggestions.push({
      type: 'warning', priority: 7,
      text: `You've spent ${pct}% of your monthly budget ($${monthSpend.toFixed(0)} of $${totalBudget.toFixed(0)}).`,
      action: 'finance',
    })
  }

  // ---- From Reminders ----
  const reminders = loadState('reminders', [])
  const activeReminders = reminders.filter(r => !r.dismissed && r.date === todayStr)
  if (activeReminders.length > 0) {
    suggestions.push({
      type: 'info', priority: 6,
      text: `${activeReminders.length} reminder${activeReminders.length > 1 ? 's' : ''} today: "${activeReminders[0].text}"`,
      action: 'reminders',
    })
  }

  // ---- From Memory — pattern-based suggestions ----
  const memory = loadState('jarvis_learned', {})

  // Suggest based on what user usually does at this hour
  if (memory.preferredTimes) {
    const peakHour = Object.entries(memory.preferredTimes)
      .sort((a, b) => b[1] - a[1])[0]
    if (peakHour && Math.abs(parseInt(peakHour[0]) - hour) <= 1 && parseInt(peakHour[0]) !== hour) {
      suggestions.push({
        type: 'insight', priority: 1,
        text: `You're usually most active around ${parseInt(peakHour[0]) > 12 ? parseInt(peakHour[0]) - 12 : parseInt(peakHour[0])}${parseInt(peakHour[0]) >= 12 ? 'pm' : 'am'}. Good time to knock out tasks.`,
      })
    }
  }

  // Long-term memory suggestions
  const longMemory = loadState('longterm_memory', [])
  if (longMemory.length > 0) {
    // Find wishes that haven't been acted on
    const wishes = longMemory.filter(m => m.category === 'wish')
    if (wishes.length > 0) {
      const randomWish = wishes[Math.floor(Math.random() * wishes.length)]
      const age = Math.round((now - new Date(randomWish.createdAt)) / 86400000)
      if (age > 7) { // Only surface wishes older than a week
        suggestions.push({
          type: 'memory', priority: 1,
          text: `${age} days ago you mentioned: "${randomWish.text.slice(0, 80)}". Still on your mind?`,
        })
      }
    }

    // Surface old plans
    const plans = longMemory.filter(m => m.category === 'plan')
    if (plans.length > 0) {
      const oldPlan = plans.find(m => {
        const age = (now - new Date(m.createdAt)) / 86400000
        return age > 14 // Plans older than 2 weeks
      })
      if (oldPlan) {
        suggestions.push({
          type: 'memory', priority: 1,
          text: `You planned: "${oldPlan.text.slice(0, 80)}". Want me to follow up on that?`,
        })
      }
    }
  }

  // ---- Time-based suggestions ----
  if (hour < 9 && todayEvents.length > 0) {
    suggestions.push({
      type: 'info', priority: 3,
      text: `${todayEvents.length} event${todayEvents.length > 1 ? 's' : ''} on your calendar today.`,
      action: 'calendar',
    })
  }

  if (hour >= 21 && pending.length > 0) {
    suggestions.push({
      type: 'nudge', priority: 2,
      text: `End of day — ${pending.length} tasks still pending. Plan for tomorrow?`,
      action: 'tasks',
    })
  }

  // Weekend suggestions
  if ((dayOfWeek === 0 || dayOfWeek === 6) && pending.length > 5) {
    suggestions.push({
      type: 'nudge', priority: 3,
      text: `It's the weekend. Good time to clear some of those ${pending.length} pending tasks.`,
      action: 'tasks',
    })
  }

  // Sort by priority
  return suggestions.sort((a, b) => b.priority - a.priority).slice(0, 5)
}
