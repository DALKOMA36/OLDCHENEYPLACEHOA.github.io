// D1 Database API client for Jarvis
// Replaces localStorage with Cloudflare D1 via Pages Functions API
// All create actions automatically teach JARVIS via learnFromAction

const API_BASE = '/api'

// Lazy import to avoid circular deps — loaded on first use
let _learnFromAction = null
function learn(type, data) {
  if (!_learnFromAction) {
    try {
      import('./offline.js').then(m => {
        _learnFromAction = m.learnFromAction
        _learnFromAction(type, data)
      })
    } catch {}
  } else {
    try { _learnFromAction(type, data) } catch {}
  }
}

// Auth token management
export function getToken() {
  return localStorage.getItem('jarvis_token')
}
export function setToken(token) {
  localStorage.setItem('jarvis_token', token)
}
export function clearToken() {
  localStorage.removeItem('jarvis_token')
  localStorage.removeItem('jarvis_sync_code')
}
export function getSyncCode() {
  return localStorage.getItem('jarvis_sync_code')
}
export function setSyncCode(code) {
  localStorage.setItem('jarvis_sync_code', code)
}

async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`
  const token = getToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, {
    headers,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (res.status === 401) {
    clearToken()
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `API error ${res.status}`)
  }
  return res.json()
}

// Auth API (no token needed for these)
async function authFetch(body) {
  const res = await fetch(`${API_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Auth error ${res.status}`)
  }
  return res.json()
}

export const auth = {
  register: async (name, phone, pin) => {
    const result = await authFetch({ action: 'register', name, phone, pin })
    setToken(result.token)
    return result
  },
  login: async (phone, pin) => {
    const result = await authFetch({ action: 'login', phone, pin })
    setToken(result.token)
    return result
  },
  verify: async () => {
    const token = getToken()
    if (!token) return null
    try {
      return await authFetch({ action: 'verify', token })
    } catch {
      clearToken()
      return null
    }
  },
  changePin: async (currentPin, newPin) => {
    const token = getToken()
    if (!token) throw new Error('Not logged in')
    return authFetch({ action: 'change_pin', token, currentPin, newPin })
  },
  logout: () => {
    clearToken()
  },
  isLoggedIn: () => !!getToken(),
}

// ---- User ----
export const db = {
  user: {
    get: () => apiFetch('/user'),
    update: (data) => apiFetch('/user', { method: 'PUT', body: data }),
  },

  // ---- Events ----
  events: {
    list: (date) => apiFetch(`/events${date ? `?date=${date}` : ''}`),
    create: (event) => { learn('event_created', event); return apiFetch('/events', { method: 'POST', body: event }) },
    update: (event) => apiFetch('/events', { method: 'PUT', body: event }),
    delete: (id) => apiFetch(`/events?id=${id}`, { method: 'DELETE' }),
  },

  // ---- Tasks ----
  tasks: {
    list: () => apiFetch('/tasks'),
    create: (task) => { learn('task_created', task); return apiFetch('/tasks', { method: 'POST', body: task }) },
    update: (task) => apiFetch('/tasks', { method: 'PUT', body: task }),
    delete: (id) => apiFetch(`/tasks?id=${id}`, { method: 'DELETE' }),
  },

  // ---- Reminders ----
  reminders: {
    list: () => apiFetch('/reminders'),
    create: (reminder) => { learn('reminder_created', reminder); return apiFetch('/reminders', { method: 'POST', body: reminder }) },
    update: (reminder) => apiFetch('/reminders', { method: 'PUT', body: reminder }),
    delete: (id) => apiFetch(`/reminders?id=${id}`, { method: 'DELETE' }),
  },

  // ---- Chat ----
  chat: {
    list: (limit = 50) => apiFetch(`/chat?limit=${limit}`),
    send: (message) => apiFetch('/chat', { method: 'POST', body: message }),
    clear: () => apiFetch('/chat', { method: 'DELETE' }),
  },

  // ---- Meals ----
  meals: {
    get: () => apiFetch('/meals'),
    set: (slot, meal) => apiFetch('/meals', { method: 'POST', body: { slot, ...meal } }),
    bulkSet: (mealPlan) => apiFetch('/meals', { method: 'PUT', body: mealPlan }),
    delete: (slot) => apiFetch(`/meals${slot ? `?slot=${slot}` : ''}`, { method: 'DELETE' }),
  },

  // ---- Grocery ----
  grocery: {
    list: () => apiFetch('/grocery'),
    add: (item) => apiFetch('/grocery', { method: 'POST', body: item }),
    update: (item) => apiFetch('/grocery', { method: 'PUT', body: item }),
    delete: (id) => apiFetch(`/grocery?id=${id}`, { method: 'DELETE' }),
    clearChecked: () => apiFetch('/grocery', { method: 'DELETE' }),
  },

  // ---- Channels ----
  channels: {
    getSent: () => apiFetch('/channels?type=sent'),
    getDrafts: () => apiFetch('/channels?type=drafts'),
    send: (msg) => apiFetch('/channels?type=sent', { method: 'POST', body: msg }),
    saveDraft: (draft) => apiFetch('/channels?type=drafts', { method: 'POST', body: draft }),
    deleteSent: (id) => apiFetch(`/channels?type=sent&id=${id}`, { method: 'DELETE' }),
    deleteDraft: (id) => apiFetch(`/channels?type=drafts&id=${id}`, { method: 'DELETE' }),
  },

  // ---- Scanner ----
  scanner: {
    list: () => apiFetch('/scanner'),
    save: (doc) => apiFetch('/scanner', { method: 'POST', body: doc }),
    delete: (id) => apiFetch(`/scanner?id=${id}`, { method: 'DELETE' }),
  },

  // ---- Trains ----
  trains: {
    list: () => apiFetch('/trains'),
    add: (schedule) => apiFetch('/trains', { method: 'POST', body: schedule }),
    update: (schedule) => apiFetch('/trains', { method: 'PUT', body: schedule }),
    delete: (id) => apiFetch(`/trains?id=${id}`, { method: 'DELETE' }),
  },

  // ---- Trips ----
  trips: {
    list: () => apiFetch('/trips'),
    create: (trip) => { learn('trip_created', trip); return apiFetch('/trips', { method: 'POST', body: trip }) },
    update: (trip) => apiFetch('/trips', { method: 'PUT', body: trip }),
    delete: (id) => apiFetch(`/trips?id=${id}`, { method: 'DELETE' }),
  },

  // ---- Custom Apps ----
  apps: {
    list: () => apiFetch('/apps'),
    create: (app) => apiFetch('/apps', { method: 'POST', body: app }),
    update: (app) => apiFetch('/apps', { method: 'PUT', body: app }),
    addEntry: (appId, data) => apiFetch('/apps', { method: 'PUT', body: { app_id: appId, data } }),
    delete: (id) => apiFetch(`/apps?id=${id}`, { method: 'DELETE' }),
    deleteEntry: (entryId) => apiFetch(`/apps?entry_id=${entryId}`, { method: 'DELETE' }),
  },

  // ---- AI ----
  ai: {
    chat: (message, conversationHistory, context) =>
      apiFetch('/ai', { method: 'POST', body: { message, conversationHistory, context } }),
    scan: (text, source) =>
      apiFetch('/scan', { method: 'POST', body: { text, source } }),
    mealPlan: (diet, days, preferences) =>
      apiFetch('/ai-meal', { method: 'POST', body: { diet, days, preferences } }),
    travel: (tripData) =>
      apiFetch('/ai-travel', { method: 'POST', body: tripData }),
    appBuilder: (description) =>
      apiFetch('/ai-app', { method: 'POST', body: { description } }),
    email: (action, emailData) =>
      apiFetch('/ai-email', { method: 'POST', body: { action, ...emailData } }),
    tts: async (text, voice = 'alloy', speed = 1) => {
      const token = getToken()
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch('/api/tts', {
        method: 'POST', headers,
        body: JSON.stringify({ text, voice, speed }),
      })
      if (res.status === 401) { clearToken(); throw new Error('Session expired') }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'TTS failed' }))
        throw new Error(err.error || 'TTS failed')
      }
      const blob = await res.blob()
      return URL.createObjectURL(blob)
    },
    ocr: async (images) => {
      const token = getToken()
      const headers = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const formData = new FormData()
      for (const img of images) {
        formData.append('images', img)
      }

      const res = await fetch('/api/ocr', { method: 'POST', headers, body: formData })
      if (res.status === 401) { clearToken(); throw new Error('Session expired') }
      if (!res.ok) throw new Error(`OCR error ${res.status}`)
      return res.json()
    },
  },

  // ---- Calendar Sync ----
  ics: {
    import: (url) => apiFetch('/ics', { method: 'POST', body: { url } }),
  },

  // ---- Email ----
  email: {
    accounts: () => apiFetch('/email?action=accounts'),
    emails: (accountId, limit) => apiFetch(`/email?action=emails${accountId ? `&account_id=${accountId}` : ''}${limit ? `&limit=${limit}` : ''}`),
    addAccount: (data) => apiFetch('/email', { method: 'POST', body: data }),
    updateAccount: (data) => apiFetch('/email', { method: 'PUT', body: data }),
    deleteAccount: (id) => apiFetch(`/email?id=${id}`, { method: 'DELETE' }),
    markRead: (emailId, read) => apiFetch('/email', { method: 'PUT', body: { email_id: emailId, read } }),
  },

  // ---- SMS ----
  sms: {
    send: (to, message) =>
      apiFetch('/sms', { method: 'POST', body: { to, message } }),
  },

  // ---- Habits ----
  habits: {
    list: () => apiFetch('/habits'),
    create: (habit) => apiFetch('/habits', { method: 'POST', body: habit }),
    update: (habit) => apiFetch('/habits', { method: 'PUT', body: habit }),
    delete: (id) => apiFetch(`/habits?id=${id}`, { method: 'DELETE' }),
  },

  // ---- Finance ----
  finance: {
    transactions: () => apiFetch('/finance?type=transactions'),
    budgets: () => apiFetch('/finance?type=budgets'),
    addTransaction: (txn) => { learn(txn.amount >= 0 ? 'income_logged' : 'expense_logged', txn); return apiFetch('/finance?type=transaction', { method: 'POST', body: txn }) },
    setBudget: (budget) => apiFetch('/finance?type=budget', { method: 'POST', body: budget }),
    deleteTransaction: (id) => apiFetch(`/finance?id=${id}`, { method: 'DELETE' }),
  },

  // ---- Notes ----
  notes: {
    list: () => apiFetch('/notes'),
    create: (note) => { learn('note_created', note); return apiFetch('/notes', { method: 'POST', body: note }) },
    update: (note) => apiFetch('/notes', { method: 'PUT', body: note }),
    delete: (id) => apiFetch(`/notes?id=${id}`, { method: 'DELETE' }),
  },

  // ---- Media ----
  media: {
    feeds: () => apiFetch('/media?type=feeds'),
    places: () => apiFetch('/media?type=places'),
    addFeed: (feed) => { learn('podcast_added', feed); return apiFetch('/media?type=feed', { method: 'POST', body: feed }) },
    addPlace: (place) => { learn('place_saved', place); return apiFetch('/media?type=place', { method: 'POST', body: place }) },
    updatePlace: (place) => apiFetch('/media', { method: 'PUT', body: place }),
    deleteFeed: (id) => apiFetch(`/media?type=feed&id=${id}`, { method: 'DELETE' }),
    deletePlace: (id) => apiFetch(`/media?type=place&id=${id}`, { method: 'DELETE' }),
  },

  // ---- Push ----
  push: {
    subscribe: (subscription) => apiFetch('/push', { method: 'POST', body: { subscription } }),
  },

  // ---- Sync (migrate localStorage -> D1) ----
  sync: (data) => apiFetch('/sync', { method: 'POST', body: data }),
}

// Migration helper: reads all localStorage data and syncs to D1
export async function migrateLocalStorageToD1() {
  const load = (key) => {
    try {
      const v = localStorage.getItem('jarvis_' + key)
      return v ? JSON.parse(v) : null
    } catch { return null }
  }

  const data = {}
  const user = load('user')
  if (user) data.user = { ...user, onboarded: !!load('onboarded') }

  const briefingTime = load('briefingTime')
  const briefingDays = load('briefingDays')
  const diet = load('diet')
  if (briefingTime) data.briefingTime = briefingTime
  if (briefingDays) data.briefingDays = briefingDays
  if (diet) data.diet = diet

  const events = load('events')
  if (events?.length) data.events = events

  const tasks = load('tasks')
  if (tasks?.length) data.tasks = tasks

  const reminders = load('reminders')
  if (reminders?.length) data.reminders = reminders

  const chatMessages = load('chatMessages')
  if (chatMessages?.length) data.chatMessages = chatMessages

  const mealPlan = load('mealPlan')
  if (mealPlan && Object.keys(mealPlan).length) data.mealPlan = mealPlan

  const groceryList = load('groceryList')
  if (groceryList?.length) data.groceryList = groceryList

  const sentMessages = load('sentMessages')
  if (sentMessages?.length) data.sentMessages = sentMessages

  const drafts = load('drafts')
  if (drafts?.length) data.drafts = drafts

  const scannedDocs = load('scannedDocs')
  if (scannedDocs?.length) data.scannedDocs = scannedDocs

  const trainSchedule = load('trainSchedule')
  if (trainSchedule?.length) data.trainSchedule = trainSchedule

  const trips = load('trips')
  if (trips?.length) data.trips = trips

  const customApps = load('customApps')
  if (customApps?.length) data.customApps = customApps

  if (Object.keys(data).length === 0) return { migrated: false, reason: 'no localStorage data' }

  const result = await db.sync(data)

  // Mark migration as complete
  localStorage.setItem('jarvis_d1_migrated', 'true')

  return { migrated: true, ...result }
}

export function needsMigration() {
  return localStorage.getItem('jarvis_d1_migrated') !== 'true' &&
    localStorage.getItem('jarvis_user') !== null
}
