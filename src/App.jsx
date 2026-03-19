import { useState, useEffect, useCallback, useRef } from 'react'
import Dashboard from './screens/Dashboard'
import Chat from './screens/Chat'
import Calendar from './screens/Calendar'
import Tasks from './screens/Tasks'
import MealPlanner from './screens/MealPlanner'
import Scanner from './screens/Scanner'
import Channels from './screens/Channels'
import Voice from './screens/Voice'
import TravelPlanner from './screens/TravelPlanner'
import AppBuilder from './screens/AppBuilder'
import Settings from './screens/Settings'
import Reminders from './screens/Reminders'
import TrainTracker from './screens/TrainTracker'
import { db, needsMigration, migrateLocalStorageToD1 } from './db'

const SCREENS = {
  dashboard: { label: 'Home', icon: '⌂', component: Dashboard },
  trains: { label: 'Trains', icon: '🚂', component: TrainTracker },
  chat: { label: 'Chat', icon: '◉', component: Chat },
  calendar: { label: 'Calendar', icon: '▦', component: Calendar },
  tasks: { label: 'Tasks', icon: '✓', component: Tasks },
  meals: { label: 'Meals', icon: '◈', component: MealPlanner },
  scanner: { label: 'Scan', icon: '⊞', component: Scanner },
  channels: { label: 'Channels', icon: '⊶', component: Channels },
  voice: { label: 'Voice', icon: '◎', component: Voice },
  travel: { label: 'Travel', icon: '➤', component: TravelPlanner },
  builder: { label: 'Builder', icon: '⬡', component: AppBuilder },
  reminders: { label: 'Remind', icon: '⏰', component: Reminders },
  settings: { label: 'Settings', icon: '⚙', component: Settings },
}

const NAV_ITEMS = ['dashboard', 'trains', 'chat', 'tasks', 'settings']
const MENU_ITEMS = ['meals', 'scanner', 'channels', 'voice', 'travel', 'builder', 'reminders']

const colors = {
  bg: '#0a0a1a',
  surface: '#12122a',
  surfaceLight: '#1a1a3a',
  surfaceHover: '#22224a',
  border: '#2a2a4a',
  primary: '#6c5ce7',
  primaryLight: '#a29bfe',
  secondary: '#00cec9',
  accent: '#fd79a8',
  warning: '#fdcb6e',
  success: '#00b894',
  danger: '#e17055',
  text: '#f0f0ff',
  textSecondary: '#8888aa',
  textMuted: '#555577',
  gradient1: 'linear-gradient(135deg, #6c5ce7, #a29bfe)',
  gradient2: 'linear-gradient(135deg, #00cec9, #55efc4)',
  gradient3: 'linear-gradient(135deg, #fd79a8, #e17055)',
}

export { colors }

// Persistent storage helpers
const loadState = (key, fallback) => {
  try {
    const v = localStorage.getItem('jarvis_' + key)
    return v ? JSON.parse(v) : fallback
  } catch { return fallback }
}
const saveState = (key, value) => {
  try { localStorage.setItem('jarvis_' + key, JSON.stringify(value)) } catch {}
}

export { loadState, saveState }

export default function App() {
  const [screen, setScreen] = useState('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState({
    name: '',
    preferences: {},
    memory: [],
    integrations: { google: false, apple: false, outlook: false, slack: false, whatsapp: false },
    circle: [],
  })

  const [onboarded, setOnboarded] = useState(false)
  const [onboardStep, setOnboardStep] = useState(0)
  const [onboardName, setOnboardName] = useState('')

  // Load user from D1 on mount, migrate localStorage if needed
  useEffect(() => {
    (async () => {
      try {
        // Migrate localStorage to D1 if needed
        if (needsMigration()) {
          await migrateLocalStorageToD1()
        }
        const userData = await db.user.get()
        setUser({
          name: userData.name || '',
          preferences: userData.preferences || {},
          memory: userData.memory || [],
          integrations: userData.integrations || { google: false, apple: false, outlook: false, slack: false, whatsapp: false },
          circle: userData.circle || [],
        })
        setOnboarded(!!userData.onboarded)
      } catch (err) {
        console.warn('D1 unavailable, falling back to localStorage:', err)
        const stored = loadState('user', null)
        if (stored) setUser(stored)
        setOnboarded(loadState('onboarded', false))
      }
      setLoading(false)
    })()
  }, [])

  // Persist user changes to D1 (debounced)
  const userRef = useRef(user)
  const saveTimer = useRef(null)
  useEffect(() => {
    userRef.current = user
    if (loading) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      db.user.update(userRef.current).catch(() => saveState('user', userRef.current))
    }, 500)
  }, [user, loading])

  const navigate = useCallback((s) => { setScreen(s); setMenuOpen(false) }, [])

  const updateUser = useCallback((updates) => {
    setUser(prev => ({ ...prev, ...updates }))
  }, [])

  const addMemory = useCallback((entry) => {
    setUser(prev => ({
      ...prev,
      memory: [{ text: entry, date: new Date().toISOString() }, ...prev.memory].slice(0, 100)
    }))
  }, [])

  const completeOnboarding = () => {
    const name = onboardName || 'Friend'
    updateUser({ name })
    setOnboarded(true)
    db.user.update({ name, onboarded: true }).catch(() => {
      saveState('onboarded', true)
    })
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, color: colors.primary, marginBottom: 16 }}>◉</div>
          <div style={{ color: colors.textSecondary, fontSize: 14 }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!onboarded) {
    return (
      <div style={{ minHeight: '100vh', minHeight: '100dvh', background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
          {onboardStep === 0 && (
            <div style={{ animation: 'fadeIn 0.6s ease' }}>
              <div style={{ fontSize: 64, marginBottom: 24 }}>◉</div>
              <h1 style={{ color: colors.text, fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Jarvis</h1>
              <p style={{ color: colors.primaryLight, fontSize: 18, marginBottom: 8 }}>Your Personal AI Life Manager</p>
              <p style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 1.6, marginBottom: 32 }}>
                Calendar, tasks, meals, messaging, travel, and more — all managed by AI that learns you.
              </p>
              <button onClick={() => setOnboardStep(1)} style={btnStyle}>Get Started</button>
            </div>
          )}
          {onboardStep === 1 && (
            <div style={{ animation: 'fadeIn 0.6s ease' }}>
              <h2 style={{ color: colors.text, fontSize: 24, marginBottom: 8 }}>What should I call you?</h2>
              <p style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 24 }}>I'll remember your name and preferences over time.</p>
              <input
                value={onboardName}
                onChange={e => setOnboardName(e.target.value)}
                placeholder="Your name"
                style={inputStyle}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && setOnboardStep(2)}
              />
              <button onClick={() => setOnboardStep(2)} style={{ ...btnStyle, marginTop: 16 }}>Continue</button>
            </div>
          )}
          {onboardStep === 2 && (
            <div style={{ animation: 'fadeIn 0.6s ease' }}>
              <h2 style={{ color: colors.text, fontSize: 24, marginBottom: 8 }}>Here's what I can do</h2>
              <div style={{ textAlign: 'left', margin: '24px 0' }}>
                {[
                  ['◉', 'AI Chat & Voice', 'Talk to me anytime — text or voice'],
                  ['▦', 'Smart Calendar', 'Unified calendar with conflict detection'],
                  ['✓', 'Task Delegation', 'Assign tasks to your circle via SMS'],
                  ['◈', 'Meal Planning', 'Personalized meals + grocery lists'],
                  ['⊞', 'Smart Scanning', 'Extract info from photos & documents'],
                  ['⊶', 'Multi-Channel', 'SMS, Email, WhatsApp, Slack — all in one'],
                  ['➤', 'Travel Planning', 'Plan trips with AI assistance'],
                  ['⬡', 'App Builder', 'Create custom mini-apps on the fly'],
                ].map(([icon, title, desc]) => (
                  <div key={title} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
                    <span style={{ fontSize: 20, color: colors.primary, width: 28, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
                    <div>
                      <div style={{ color: colors.text, fontSize: 14, fontWeight: 600 }}>{title}</div>
                      <div style={{ color: colors.textSecondary, fontSize: 12 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={completeOnboarding} style={btnStyle}>Let's Go, {onboardName || 'Friend'}!</button>
            </div>
          )}
        </div>
        <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      </div>
    )
  }

  const CurrentScreen = SCREENS[screen]?.component || Dashboard

  return (
    <div style={{ minHeight: '100vh', minHeight: '100dvh', background: colors.bg, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', background: colors.surface, borderBottom: `1px solid ${colors.border}`,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, color: colors.primary }}>◉</span>
          <span style={{ color: colors.text, fontSize: 16, fontWeight: 600 }}>Jarvis</span>
        </div>
        <div style={{ color: colors.textSecondary, fontSize: 13 }}>
          {SCREENS[screen]?.label}
        </div>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{ background: 'none', border: 'none', color: colors.textSecondary, fontSize: 22, cursor: 'pointer', padding: 4 }}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </header>

      {/* Slide-out menu */}
      {menuOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99,
          background: 'rgba(0,0,0,0.6)', animation: 'fadeIn 0.2s ease',
        }} onClick={() => setMenuOpen(false)}>
          <div style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: 280,
            background: colors.surface, borderLeft: `1px solid ${colors.border}`,
            padding: '60px 0 20px', overflowY: 'auto', animation: 'slideIn 0.25s ease',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '0 16px 16px', borderBottom: `1px solid ${colors.border}`, marginBottom: 8 }}>
              <div style={{ color: colors.text, fontSize: 16, fontWeight: 600 }}>Hi, {user.name}!</div>
              <div style={{ color: colors.textSecondary, fontSize: 12 }}>All Features</div>
            </div>
            {[...NAV_ITEMS, ...MENU_ITEMS].map(key => (
              <button
                key={key}
                onClick={() => navigate(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '12px 20px', background: screen === key ? colors.surfaceHover : 'transparent',
                  border: 'none', color: screen === key ? colors.primary : colors.text,
                  fontSize: 14, cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{SCREENS[key]?.icon}</span>
                {SCREENS[key]?.label}
                {['travel', 'builder'].includes(key) && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: colors.accent, background: `${colors.accent}22`, padding: '2px 6px', borderRadius: 8 }}>NEW</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main content */}
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 72 }}>
        <CurrentScreen user={user} updateUser={updateUser} addMemory={addMemory} navigate={navigate} />
      </main>

      {/* Bottom nav */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        display: 'flex', background: colors.surface, borderTop: `1px solid ${colors.border}`,
        zIndex: 50, paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}>
        {NAV_ITEMS.map(key => (
          <button
            key={key}
            onClick={() => navigate(key)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '8px 0 6px', background: 'none', border: 'none',
              color: screen === key ? colors.primary : colors.textMuted,
              fontSize: 10, cursor: 'pointer', gap: 2,
            }}
          >
            <span style={{ fontSize: 20 }}>{SCREENS[key]?.icon}</span>
            {SCREENS[key]?.label}
          </button>
        ))}
      </nav>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        input:focus, textarea:focus { outline: none; border-color: ${colors.primary} !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${colors.border}; border-radius: 2px; }
      `}</style>
    </div>
  )
}

const btnStyle = {
  width: '100%', padding: '14px 24px', background: colors.gradient1,
  color: '#fff', border: 'none', borderRadius: 12, fontSize: 16,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}

const inputStyle = {
  width: '100%', padding: '14px 16px', background: colors.surfaceLight,
  color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 12,
  fontSize: 16, fontFamily: 'inherit',
}
