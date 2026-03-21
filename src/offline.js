// JARVIS Offline Intelligence Engine
// Works without internet — local command parsing, learning, caching, and action queue

import { loadState, saveState } from './constants'

// ---- Offline Detection ----

export function isOffline() {
  return !navigator.onLine
}

// ---- Action Queue (sync when back online) ----

const QUEUE_KEY = 'jarvis_offline_queue'

export function queueAction(action) {
  // action: { type: 'task'|'reminder'|'event'|'sms', data: {...}, timestamp }
  const queue = loadState('offline_queue', [])
  queue.push({ ...action, timestamp: new Date().toISOString(), synced: false })
  saveState('offline_queue', queue)
}

export function getQueue() {
  return loadState('offline_queue', [])
}

export function clearSyncedQueue() {
  const queue = loadState('offline_queue', [])
  saveState('offline_queue', queue.filter(a => !a.synced))
}

export async function syncQueue(db) {
  const queue = loadState('offline_queue', [])
  const results = []

  for (const action of queue) {
    if (action.synced) continue
    try {
      if (action.type === 'task') await db.tasks.create(action.data)
      else if (action.type === 'reminder') await db.reminders.create(action.data)
      else if (action.type === 'event') await db.events.create(action.data)
      else if (action.type === 'sms') await db.sms.send(action.data.to, action.data.message)
      action.synced = true
      results.push({ action, success: true })
    } catch (err) {
      results.push({ action, success: false, error: err.message })
    }
  }

  saveState('offline_queue', queue)
  return results
}

// ---- Response Cache ----

const CACHE_KEY = 'jarvis_response_cache'
const MAX_CACHE = 500

export function cacheResponse(query, response) {
  const cache = loadState('response_cache', [])
  cache.unshift({
    query: query.toLowerCase().trim(),
    response,
    timestamp: new Date().toISOString(),
  })
  // Keep only last N
  saveState('response_cache', cache.slice(0, MAX_CACHE))
}

export function findCachedResponse(query) {
  const cache = loadState('response_cache', [])
  const q = query.toLowerCase().trim()

  // Exact match
  const exact = cache.find(c => c.query === q)
  if (exact) return exact.response

  // Fuzzy match — find most similar
  const words = q.split(/\s+/)
  let bestMatch = null
  let bestScore = 0

  for (const entry of cache) {
    const entryWords = entry.query.split(/\s+/)
    let matches = 0
    for (const w of words) {
      if (entryWords.some(ew => ew.includes(w) || w.includes(ew))) matches++
    }
    const score = matches / Math.max(words.length, entryWords.length)
    if (score > bestScore && score > 0.5) {
      bestScore = score
      bestMatch = entry
    }
  }

  return bestMatch?.response || null
}

// ---- Feature Request Learning ----

const FEATURE_KEY = 'jarvis_feature_requests'

export function logFeatureAttempt(description) {
  const requests = loadState('feature_requests', [])
  const existing = requests.find(r => r.description.toLowerCase() === description.toLowerCase())
  if (existing) {
    existing.count++
    existing.lastAttempt = new Date().toISOString()
  } else {
    requests.push({
      description,
      count: 1,
      firstAttempt: new Date().toISOString(),
      lastAttempt: new Date().toISOString(),
    })
  }
  saveState('feature_requests', requests)
}

export function getFeatureRequests() {
  return loadState('feature_requests', []).sort((a, b) => b.count - a.count)
}

// ---- Local Command Engine ----
// Parses natural language and executes locally WITHOUT any API call

export function parseOfflineCommand(text) {
  const lower = text.toLowerCase().trim()
  const now = new Date()

  // ---- Time queries ----
  if (/what\s*(time|is\s*it|'?s?\s*the\s*time)/.test(lower)) {
    return {
      type: 'answer',
      response: `It's ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.`,
    }
  }

  // ---- Date queries ----
  if (/what\s*(day|date|is\s*today)/.test(lower)) {
    return {
      type: 'answer',
      response: `Today is ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`,
    }
  }

  // ---- Add task ----
  const taskMatch = lower.match(/(?:add|create|new|make)\s+(?:a\s+)?task[:\s]+(.+)/i)
    || lower.match(/(?:add|create|new|make)\s+(?:a\s+)?task\s+(?:to|called|named)\s+(.+)/i)
    || lower.match(/(?:add|create)\s+(.+)\s+(?:to\s+)?(?:my\s+)?tasks?/i)
  if (taskMatch) {
    const title = taskMatch[1].trim().replace(/^["']|["']$/g, '')
    return {
      type: 'create_task',
      data: { title, priority: 'medium', category: 'personal' },
      response: `Task created: "${title}". I'll sync it when we're back online.`,
    }
  }

  // ---- Set reminder ----
  const reminderMatch = lower.match(/(?:set|create|add)\s+(?:a\s+)?reminder[:\s]+(.+)/i)
    || lower.match(/remind\s+me\s+(?:to\s+)?(.+)/i)
  if (reminderMatch) {
    const text = reminderMatch[1].trim()
    const inHour = new Date(now.getTime() + 60 * 60000)
    return {
      type: 'create_reminder',
      data: {
        text,
        date: inHour.toISOString().split('T')[0],
        time: `${String(inHour.getHours()).padStart(2, '0')}:${String(inHour.getMinutes()).padStart(2, '0')}`,
        priority: 'normal',
        repeat: 'none',
      },
      response: `Reminder set for ${inHour.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: "${text}"`,
    }
  }

  // ---- Timer ----
  const timerMatch = lower.match(/(?:set|start)\s+(?:a\s+)?timer\s+(?:for\s+)?(\d+)\s*(min|minute|hour|sec)/i)
  if (timerMatch) {
    const amount = parseInt(timerMatch[1])
    const unit = timerMatch[2].startsWith('hour') ? 'hours' : timerMatch[2].startsWith('sec') ? 'seconds' : 'minutes'
    const ms = unit === 'hours' ? amount * 3600000 : unit === 'seconds' ? amount * 1000 : amount * 60000
    return {
      type: 'timer',
      duration: ms,
      response: `Timer set for ${amount} ${unit}. I'll alert you when it's done.`,
    }
  }

  // ---- Calculator ----
  const calcMatch = lower.match(/(?:what\s*(?:is|'s)\s+)?(\d[\d\s+\-*/().%]+\d)/)
  if (calcMatch) {
    try {
      // Safe eval — only allow numbers and basic operators
      const expr = calcMatch[1].replace(/[^0-9+\-*/().%\s]/g, '')
      if (expr) {
        const result = Function('"use strict"; return (' + expr + ')')()
        return {
          type: 'answer',
          response: `${calcMatch[1].trim()} = ${result}`,
        }
      }
    } catch {}
  }

  // ---- Schedule queries ----
  if (/what'?s?\s*(?:next|coming\s*up|on\s*(?:my\s*)?schedule|on\s*(?:my\s*)?agenda)/i.test(lower)) {
    return {
      type: 'schedule_query',
      response: null, // Caller fills from local data
    }
  }

  if (/how\s*many\s*tasks/i.test(lower)) {
    return {
      type: 'task_count_query',
      response: null, // Caller fills from local data
    }
  }

  // ---- Greetings ----
  if (/^(hey|hi|hello|good\s*(morning|afternoon|evening)|yo|sup)\b/i.test(lower)) {
    const hour = now.getHours()
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
    const greetings = [
      `Good ${timeOfDay}, sir. All systems operational. How may I assist you?`,
      `${timeOfDay === 'morning' ? 'Morning' : 'Good ' + timeOfDay}, sir. Standing by.`,
      `At your service, sir. What do you need?`,
    ]
    return {
      type: 'answer',
      response: greetings[Math.floor(Math.random() * greetings.length)],
    }
  }

  // ---- Weather (offline — give cached or helpful response) ----
  if (/weather/i.test(lower)) {
    return {
      type: 'answer',
      response: "I'm currently offline so I can't check live weather. I'll update you as soon as we reconnect.",
    }
  }

  // ---- Help ----
  if (/what\s*can\s*you\s*do|help|commands/i.test(lower)) {
    return {
      type: 'answer',
      response: `Even offline, I can: add tasks, set reminders, set timers, tell you the time/date, do calculations, check your schedule, and queue messages for later. Everything syncs when we're back online.`,
    }
  }

  // ---- Not recognized — log as feature attempt ----
  return null
}

// ---- Offline Learning Engine ----
// Tracks patterns to get smarter over time

const LEARNING_KEY = 'jarvis_learned'

export function learnPattern(category, data) {
  const memory = loadState('jarvis_learned', {
    topics: {},
    interactionCount: 0,
    preferredTimes: {},
    commonTasks: {},
    commonQueries: [],
    featureAttempts: [],
  })

  memory.interactionCount = (memory.interactionCount || 0) + 1
  memory.lastActive = new Date().toISOString()

  // Track active hours
  const hour = new Date().getHours()
  if (!memory.preferredTimes) memory.preferredTimes = {}
  memory.preferredTimes[hour] = (memory.preferredTimes[hour] || 0) + 1

  if (category === 'task_created' && data.title) {
    if (!memory.commonTasks) memory.commonTasks = {}
    const key = data.title.toLowerCase().split(/\s+/).slice(0, 3).join(' ')
    memory.commonTasks[key] = (memory.commonTasks[key] || 0) + 1
  }

  if (category === 'query') {
    if (!memory.commonQueries) memory.commonQueries = []
    memory.commonQueries.unshift({ q: data.query, time: new Date().toISOString() })
    memory.commonQueries = memory.commonQueries.slice(0, 50)
  }

  if (category === 'topic') {
    if (!memory.topics) memory.topics = {}
    memory.topics[data.topic] = (memory.topics[data.topic] || 0) + 1
  }

  saveState('jarvis_learned', memory)
}

export function getLearned() {
  return loadState('jarvis_learned', {})
}

// ---- Smart Suggestions (offline) ----

export function getSmartSuggestions() {
  const memory = getLearned()
  const suggestions = []
  const hour = new Date().getHours()

  // Suggest based on time patterns
  if (memory.preferredTimes) {
    const peakHour = Object.entries(memory.preferredTimes)
      .sort((a, b) => b[1] - a[1])[0]
    if (peakHour && Math.abs(parseInt(peakHour[0]) - hour) <= 1) {
      suggestions.push("You're usually active around this time. Need anything?")
    }
  }

  // Suggest common tasks
  if (memory.commonTasks) {
    const topTask = Object.entries(memory.commonTasks)
      .sort((a, b) => b[1] - a[1])[0]
    if (topTask && topTask[1] >= 3) {
      suggestions.push(`You frequently create tasks about "${topTask[0]}". Shall I add one?`)
    }
  }

  return suggestions
}
