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

export function learnPattern(category, data) {
  const memory = loadState('jarvis_learned', {
    topics: {},
    interactionCount: 0,
    preferredTimes: {},
    commonTasks: {},
    commonQueries: [],
  })

  memory.interactionCount = (memory.interactionCount || 0) + 1
  memory.lastActive = new Date().toISOString()

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

// ---- 3-Tier Memory System (inspired by Leon AI) ----
// Short-term: current conversation (expires after session)
// Medium-term: daily summaries (expires after 30 days)
// Long-term: facts, preferences, wishes (NEVER expires)
//
// Deduplication via Jaccard similarity to avoid storing same thing twice
// Weighted recall — long-term memories rank higher than medium-term

const MAX_LONGTERM = 5000
const MAX_MEDIUM = 500
const MEDIUM_TTL_DAYS = 30
const SIMILARITY_THRESHOLD = 0.7 // don't store if 70%+ similar to existing

function jaccard(a, b) {
  const setA = new Set(a.toLowerCase().split(/\s+/))
  const setB = new Set(b.toLowerCase().split(/\s+/))
  const intersection = new Set([...setA].filter(x => setB.has(x)))
  const union = new Set([...setA, ...setB])
  return union.size > 0 ? intersection.size / union.size : 0
}

function isDuplicate(text, memories, threshold = SIMILARITY_THRESHOLD) {
  // Check last 200 memories for near-duplicates
  const recent = memories.slice(-200)
  for (const m of recent) {
    if (jaccard(text, m.text) >= threshold) return true
    // Also check substring containment
    if (m.text.toLowerCase().includes(text.toLowerCase()) || text.toLowerCase().includes(m.text.toLowerCase())) return true
  }
  return false
}

export function addLongTermMemory(text, category = 'general', source = 'chat') {
  if (!text || text.length < 5) return // Don't store tiny fragments

  const memories = loadState('longterm_memory', [])

  // Dedup check
  if (isDuplicate(text, memories)) return

  memories.push({
    id: Date.now().toString(),
    text,
    category, // wish, plan, preference, fact, place, person, query, general
    source,   // chat, task, calendar, note, travel, habit, finance, voice
    createdAt: new Date().toISOString(),
    lastRecalled: null,
    recallCount: 0,
  })
  saveState('longterm_memory', memories.slice(-MAX_LONGTERM))
}

// Medium-term: daily activity log
export function addMediumTermMemory(text, source = 'system') {
  const memories = loadState('medium_memory', [])
  if (isDuplicate(text, memories, 0.8)) return

  memories.push({
    text, source,
    createdAt: new Date().toISOString(),
  })

  // Expire old entries
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - MEDIUM_TTL_DAYS)
  const filtered = memories.filter(m => new Date(m.createdAt) > cutoff)

  saveState('medium_memory', filtered.slice(-MAX_MEDIUM))
}

export function searchMemories(query) {
  const longTerm = loadState('longterm_memory', [])
  const mediumTerm = loadState('medium_memory', [])
  const q = query.toLowerCase()
  const words = q.split(/\s+/).filter(w => w.length > 2)

  // Score and weight — long-term memories rank 1.5x higher
  const score = (memories, weight) => memories.map(m => {
    const text = m.text.toLowerCase()
    let s = 0
    for (const w of words) {
      if (text.includes(w)) s++
    }
    return { ...m, score: s * weight, tier: weight > 1 ? 'long-term' : 'medium-term' }
  }).filter(m => m.score > 0)

  const results = [
    ...score(longTerm, 1.5),
    ...score(mediumTerm, 0.8),
  ].sort((a, b) => b.score - a.score).slice(0, 10)

  // Track recall — memories that get recalled frequently are more important
  if (results.length > 0) {
    const lt = loadState('longterm_memory', [])
    let changed = false
    for (const r of results) {
      const mem = lt.find(m => m.id === r.id)
      if (mem) {
        mem.lastRecalled = new Date().toISOString()
        mem.recallCount = (mem.recallCount || 0) + 1
        changed = true
      }
    }
    if (changed) saveState('longterm_memory', lt)
  }

  return results
}

export function getAllMemories() {
  return loadState('longterm_memory', [])
}

export function getMemoryStats() {
  const lt = loadState('longterm_memory', [])
  const mt = loadState('medium_memory', [])
  const categories = {}
  lt.forEach(m => { categories[m.category] = (categories[m.category] || 0) + 1 })
  const mostRecalled = lt.filter(m => m.recallCount > 0).sort((a, b) => (b.recallCount || 0) - (a.recallCount || 0)).slice(0, 5)
  return {
    longTermCount: lt.length,
    mediumTermCount: mt.length,
    categories,
    mostRecalled,
    oldestMemory: lt[0]?.createdAt,
    newestMemory: lt[lt.length - 1]?.createdAt,
  }
}

export function getMemoriesForContext(context) {
  const longTerm = loadState('longterm_memory', [])
  const mediumTerm = loadState('medium_memory', [])
  if (longTerm.length === 0 && mediumTerm.length === 0) return []

  const words = context.toLowerCase().split(/\s+/).filter(w => w.length > 3)

  const score = (memories, weight) => memories.map(m => {
    const text = m.text.toLowerCase()
    let s = 0
    for (const w of words) {
      if (text.includes(w)) s++
    }
    // Boost frequently recalled memories
    const recallBoost = Math.min((m.recallCount || 0) * 0.1, 0.5)
    return { ...m, score: (s + recallBoost) * weight }
  }).filter(m => m.score > 0)

  const all = [
    ...score(longTerm, 1.5),
    ...score(mediumTerm, 0.8),
  ].sort((a, b) => b.score - a.score).slice(0, 8)

  return all
}

// ---- Learn from ALL app actions, not just chat ----

export function learnFromAction(actionType, data) {
  const now = new Date()

  // Log to medium-term memory (daily activity)
  switch (actionType) {
    case 'task_created':
      addMediumTermMemory(`Created task: "${data.title}"${data.category ? ` [${data.category}]` : ''}`, 'tasks')
      break
    case 'task_completed':
      addMediumTermMemory(`Completed task: "${data.title}"`, 'tasks')
      break
    case 'event_created':
      addMediumTermMemory(`Added event: "${data.title}" on ${data.date}${data.location ? ` at ${data.location}` : ''}`, 'calendar')
      // If event has a location, remember it as a place
      if (data.location) addLongTermMemory(`Visited/planned to visit: ${data.location} for ${data.title}`, 'place', 'calendar')
      break
    case 'reminder_created':
      addMediumTermMemory(`Set reminder: "${data.text}" for ${data.date}`, 'reminders')
      break
    case 'habit_completed':
      addMediumTermMemory(`Completed habit: "${data.name}"`, 'habits')
      break
    case 'expense_logged':
      addMediumTermMemory(`Spent $${Math.abs(data.amount).toFixed(2)} on ${data.description} [${data.category}]`, 'finance')
      break
    case 'income_logged':
      addMediumTermMemory(`Received $${data.amount.toFixed(2)}: ${data.description}`, 'finance')
      break
    case 'note_created':
      addMediumTermMemory(`Created note: "${data.title}"`, 'notes')
      // Notes might contain important facts — store in long-term
      if (data.body && data.body.length > 20) {
        addLongTermMemory(`Note "${data.title}": ${data.body.slice(0, 200)}`, 'fact', 'notes')
      }
      break
    case 'trip_created':
      addLongTermMemory(`Planning trip to ${data.destination}${data.start_date ? ` on ${data.start_date}` : ''}`, 'plan', 'travel')
      break
    case 'contact_added':
      addLongTermMemory(`Added contact: ${data.name}${data.phone ? ` (${data.phone})` : ''}${data.email ? ` — ${data.email}` : ''}`, 'person', 'contacts')
      break
    case 'message_sent':
      addMediumTermMemory(`Sent message to ${data.to}: "${data.message?.slice(0, 50)}"`, 'messages')
      break
    case 'meal_planned':
      addMediumTermMemory(`Planned meal: ${data.name} for ${data.slot}`, 'meals')
      break
    case 'podcast_added':
      addLongTermMemory(`Subscribed to podcast: ${data.title}`, 'preference', 'media')
      break
    case 'place_saved':
      if (data.name && data.address) {
        addLongTermMemory(`Saved place "${data.name}": ${data.address}`, 'place', 'media')
      }
      break
  }

  // Also update the learning patterns
  learnPattern('action', { type: actionType })
}

// Auto-extract memories from AI conversations
export function extractMemoriesFromChat(userText, aiResponse) {
  const lower = userText.toLowerCase()

  // Detect wishes: "I want to...", "I'd like to...", "I wish..."
  if (/i (?:want|wanna|wish|'d like|would like|hope) to\s+/i.test(lower)) {
    addLongTermMemory(userText, 'wish', 'chat')
  }

  // Detect preferences: "I prefer...", "I like...", "I hate...", "I love..."
  if (/i (?:prefer|like|love|hate|can't stand|always|never)\s+/i.test(lower)) {
    addLongTermMemory(userText, 'preference', 'chat')
  }

  // Detect plans: "I'm going to...", "We're planning...", "Next year..."
  if (/(?:i'm going|we're planning|next (?:year|month|week)|planning to|scheduled|booked)\s+/i.test(lower)) {
    addLongTermMemory(userText, 'plan', 'chat')
  }

  // Detect facts about people: "My [relation] is...", "[Name] works at..."
  if (/(?:my (?:wife|husband|partner|mom|dad|brother|sister|boss|friend|kid|son|daughter))\s+/i.test(lower)) {
    addLongTermMemory(userText, 'person', 'chat')
  }

  // Detect place mentions: "I visited...", "I live...", "My favorite restaurant..."
  if (/(?:i (?:visited|live|went|traveled)|my favorite (?:restaurant|place|spot|bar|cafe))\s+/i.test(lower)) {
    addLongTermMemory(userText, 'place', 'chat')
  }
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
