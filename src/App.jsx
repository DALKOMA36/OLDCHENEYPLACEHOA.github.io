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
import Reader from './screens/Reader'
import HabitTracker from './screens/HabitTracker'
import Finance from './screens/Finance'
import MediaHub from './screens/MediaHub'
import JarvisCheckin from './JarvisCheckin'
import CalendarSync from './CalendarSync'
import { db, auth } from './db'
import { colors, loadState, saveState } from './constants'

const SCREENS = {
  dashboard: { label: 'Home', icon: 'H', component: Dashboard },
  trains: { label: 'Trains', icon: 'TR', component: TrainTracker },
  chat: { label: 'Chat', icon: 'AI', component: Chat },
  calendar: { label: 'Calendar', icon: 'CA', component: Calendar },
  tasks: { label: 'Tasks', icon: 'TK', component: Tasks },
  meals: { label: 'Meals', icon: 'ML', component: MealPlanner },
  scanner: { label: 'Scan', icon: 'SC', component: Scanner },
  channels: { label: 'Channels', icon: 'CH', component: Channels },
  voice: { label: 'Voice', icon: 'VC', component: Voice },
  reader: { label: 'Reader', icon: 'RD', component: Reader },
  travel: { label: 'Travel', icon: 'TV', component: TravelPlanner },
  builder: { label: 'Builder', icon: 'BD', component: AppBuilder },
  reminders: { label: 'Remind', icon: 'RM', component: Reminders },
  habits: { label: 'Habits', icon: 'HB', component: HabitTracker },
  finance: { label: 'Finance', icon: 'FN', component: Finance },
  media: { label: 'Media', icon: 'MD', component: MediaHub },
  settings: { label: 'Settings', icon: 'SY', component: Settings },
}

const NAV_ITEMS = ['dashboard', 'trains', 'chat', 'tasks', 'settings']
const MENU_ITEMS = ['meals', 'scanner', 'channels', 'voice', 'reader', 'travel', 'builder', 'reminders', 'habits', 'finance', 'media']

export { colors, loadState, saveState }

export default function App() {
  const [screen, setScreen] = useState('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [authState, setAuthState] = useState('checking') // checking, login, register, authenticated
  const [user, setUser] = useState({
    name: '',
    preferences: {},
    memory: [],
    integrations: { google: false, apple: false, outlook: false, slack: false, whatsapp: false },
    circle: [],
  })

  // Auth form state
  const [authName, setAuthName] = useState('')
  const [authPin, setAuthPin] = useState('')
  const [authPhone, setAuthPhone] = useState('')
  const [authError, setAuthError] = useState('')
  const [authMode, setAuthMode] = useState('register') // register or login

  // Check auth on mount
  useEffect(() => {
    (async () => {
      if (auth.isLoggedIn()) {
        const session = await auth.verify()
        if (session) {
          // Load user data
          try {
            const userData = await db.user.get()
            setUser({
              name: userData.name || session.name || '',
              preferences: userData.preferences || {},
              memory: userData.memory || [],
              integrations: userData.integrations || { google: false, apple: false, outlook: false, slack: false, whatsapp: false },
              circle: userData.circle || [],
            })
          } catch {
            setUser({ name: session.name, preferences: {}, memory: [], integrations: {}, circle: [] })
          }
          setAuthState('authenticated')
          setLoading(false)
          return
        }
      }
      setAuthState('login')
      setLoading(false)
    })()
  }, [])

  // Persist user changes to D1 (debounced)
  const userRef = useRef(user)
  const saveTimer = useRef(null)
  useEffect(() => {
    userRef.current = user
    if (authState !== 'authenticated') return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      db.user.update(userRef.current).catch(() => {})
    }, 500)
  }, [user, authState])

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

  const handleRegister = async () => {
    setAuthError('')
    if (!authName.trim()) { setAuthError('Please enter your name'); return }
    if (!authPhone || authPhone.replace(/\D/g, '').length < 10) { setAuthError('Please enter a valid phone number'); return }
    if (!authPin || authPin.length < 4) { setAuthError('PIN must be at least 4 digits'); return }

    try {
      const result = await auth.register(authName.trim(), authPhone, authPin)
      setUser({ name: result.name, preferences: {}, memory: [], integrations: {}, circle: [] })
      setAuthState('authenticated')
    } catch (err) {
      setAuthError(err.message)
    }
  }

  const handleLogin = async () => {
    setAuthError('')
    if (!authPhone || authPhone.replace(/\D/g, '').length < 10) { setAuthError('Please enter your phone number'); return }
    if (!authPin) { setAuthError('Please enter your PIN'); return }

    try {
      const result = await auth.login(authPhone, authPin)
      try {
        const userData = await db.user.get()
        setUser({
          name: userData.name || result.name || '',
          preferences: userData.preferences || {},
          memory: userData.memory || [],
          integrations: userData.integrations || { google: false, apple: false, outlook: false, slack: false, whatsapp: false },
          circle: userData.circle || [],
        })
      } catch {
        setUser({ name: result.name, preferences: {}, memory: [], integrations: {}, circle: [] })
      }
      setAuthState('authenticated')
    } catch (err) {
      setAuthError(err.message)
    }
  }

  const handleLogout = () => {
    auth.logout()
    setAuthState('login')
    setUser({ name: '', preferences: {}, memory: [], integrations: {}, circle: [] })
    setAuthPin('')
    setAuthPhone('')
    setAuthName('')
  }

  // Loading screen
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 60, height: 60, margin: '0 auto 20px',
            border: `2px solid ${colors.primary}`,
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            boxShadow: colors.glow,
          }} />
          <div style={{
            color: colors.primary, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: 3, textTransform: 'uppercase',
          }}>Initializing</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // Auth screen (login/register)
  if (authState !== 'authenticated') {
    return (
      <div style={{
        minHeight: '100vh', minHeight: '100dvh', background: colors.bg, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Scan line animation */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
          background: `linear-gradient(90deg, transparent, ${colors.primary}, transparent)`,
          animation: 'scanLine 3s ease-in-out infinite',
          opacity: 0.4,
        }} />

        <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
          {/* JARVIS logo ring */}
          <div style={{
            width: 80, height: 80, margin: '0 auto 24px',
            border: `1px solid ${colors.primary}`,
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `${colors.glow}, inset ${colors.glow}`,
            animation: 'fadeIn 0.8s ease',
          }}>
            <div style={{
              width: 50, height: 50,
              border: `1px solid rgba(0, 212, 255, 0.3)`,
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: colors.primary,
                boxShadow: `0 0 10px ${colors.primary}`,
              }} />
            </div>
          </div>

          <h1 style={{
            color: colors.primary, fontSize: 20, fontWeight: 400,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: 8, marginBottom: 4,
          }}>J.A.R.V.I.S.</h1>
          <p style={{
            color: colors.textSecondary, fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: 2, marginBottom: 32, textTransform: 'uppercase',
          }}>Secure Interface Terminal</p>

          {/* Toggle between register and login */}
          <div style={{
            display: 'flex', gap: 0, marginBottom: 24,
            border: `1px solid ${colors.border}`, overflow: 'hidden',
          }}>
            <button onClick={() => { setAuthMode('register'); setAuthError('') }} style={{
              flex: 1, padding: '10px 0',
              background: authMode === 'register' ? colors.primaryDim : 'transparent',
              color: authMode === 'register' ? colors.primary : colors.textMuted,
              border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, textTransform: 'uppercase',
              borderBottom: authMode === 'register' ? `1px solid ${colors.primary}` : '1px solid transparent',
            }}>New Account</button>
            <button onClick={() => { setAuthMode('login'); setAuthError('') }} style={{
              flex: 1, padding: '10px 0',
              background: authMode === 'login' ? colors.primaryDim : 'transparent',
              color: authMode === 'login' ? colors.primary : colors.textMuted,
              border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, textTransform: 'uppercase',
              borderLeft: `1px solid ${colors.border}`,
              borderBottom: authMode === 'login' ? `1px solid ${colors.primary}` : '1px solid transparent',
            }}>Sign In</button>
          </div>

          {authMode === 'register' ? (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              <input
                value={authName}
                onChange={e => setAuthName(e.target.value)}
                placeholder="IDENTIFIER (NAME)"
                style={{ ...inputStyle, marginBottom: 12 }}
                autoFocus
              />
              <input
                value={authPhone}
                onChange={e => setAuthPhone(e.target.value)}
                placeholder="COMM LINK (PHONE)"
                type="tel"
                inputMode="tel"
                style={{ ...inputStyle, marginBottom: 12 }}
              />
              <input
                value={authPin}
                onChange={e => setAuthPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="ACCESS CODE (4+ DIGITS)"
                type="password"
                inputMode="numeric"
                style={{ ...inputStyle, marginBottom: 20 }}
                onKeyDown={e => e.key === 'Enter' && handleRegister()}
              />
              <button onClick={handleRegister} style={btnStyle}>AUTHORIZE</button>
            </div>
          ) : (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              <input
                value={authPhone}
                onChange={e => setAuthPhone(e.target.value)}
                placeholder="COMM LINK (PHONE)"
                type="tel"
                inputMode="tel"
                style={{ ...inputStyle, marginBottom: 12 }}
                autoFocus
              />
              <input
                value={authPin}
                onChange={e => setAuthPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="ACCESS CODE"
                type="password"
                inputMode="numeric"
                style={{ ...inputStyle, marginBottom: 20 }}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
              <button onClick={handleLogin} style={btnStyle}>AUTHENTICATE</button>
            </div>
          )}

          {authError && (
            <p style={{
              color: colors.danger, fontSize: 11, marginTop: 14,
              fontFamily: "'JetBrains Mono', monospace",
            }}>[ERROR] {authError}</p>
          )}
        </div>
        <style>{`
          @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes scanLine { 0%, 100% { top: 0; } 50% { top: 100%; } }
        `}</style>
      </div>
    )
  }

  // Main app
  const CurrentScreen = SCREENS[screen]?.component || Dashboard

  return (
    <div style={{ minHeight: '100vh', minHeight: '100dvh', background: colors.bg, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        background: colors.surface,
        borderBottom: `1px solid ${colors.border}`,
        position: 'sticky', top: 0, zIndex: 100,
        backdropFilter: 'blur(12px)',
        boxShadow: `0 1px 20px rgba(0, 212, 255, 0.05)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Animated pulse dot */}
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: colors.primary,
            boxShadow: `0 0 8px ${colors.primary}`,
            animation: 'pulse 2s ease-in-out infinite',
          }} />
          <span style={{
            color: colors.primary, fontSize: 14, fontWeight: 500,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: 3,
          }}>JARVIS</span>
        </div>
        <div style={{
          color: colors.textSecondary, fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: 1, textTransform: 'uppercase',
        }}>
          {SCREENS[screen]?.label}
        </div>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            background: 'none', border: `1px solid ${colors.border}`,
            color: colors.textSecondary, fontSize: 14, cursor: 'pointer',
            padding: '4px 8px', fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {menuOpen ? 'X' : '///'}
        </button>
      </header>

      {/* Slide-out menu */}
      {menuOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99,
          background: 'rgba(0,0,0,0.7)', animation: 'fadeIn 0.2s ease',
          backdropFilter: 'blur(4px)',
        }} onClick={() => setMenuOpen(false)}>
          <div style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: 280,
            background: colors.surface,
            borderLeft: `1px solid ${colors.border}`,
            padding: '60px 0 20px', overflowY: 'auto', animation: 'slideIn 0.25s ease',
            backdropFilter: 'blur(20px)',
            boxShadow: '-5px 0 30px rgba(0, 0, 0, 0.5)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              padding: '0 16px 16px',
              borderBottom: `1px solid ${colors.border}`, marginBottom: 8,
            }}>
              <div style={{
                color: colors.text, fontSize: 14, fontWeight: 500,
                fontFamily: "'JetBrains Mono', monospace",
              }}>{user.name}</div>
              <div style={{
                color: colors.textMuted, fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: 1, marginTop: 4,
              }}>SYSTEM MODULES</div>
            </div>
            {[...NAV_ITEMS, ...MENU_ITEMS].map(key => (
              <button
                key={key}
                onClick={() => navigate(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '11px 20px',
                  background: screen === key ? colors.primaryDim : 'transparent',
                  border: 'none',
                  borderLeft: screen === key ? `2px solid ${colors.primary}` : '2px solid transparent',
                  color: screen === key ? colors.primary : colors.textSecondary,
                  fontSize: 12, cursor: 'pointer', textAlign: 'left',
                  fontFamily: "'Exo 2', sans-serif", letterSpacing: 0.5,
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{
                  fontSize: 10, width: 24, textAlign: 'center',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: screen === key ? colors.primary : colors.textMuted,
                  letterSpacing: 0,
                }}>{SCREENS[key]?.icon}</span>
                {SCREENS[key]?.label}
              </button>
            ))}
            <button
              onClick={handleLogout}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                padding: '11px 20px', background: 'transparent',
                border: 'none', color: colors.danger,
                fontSize: 12, cursor: 'pointer', textAlign: 'left', marginTop: 8,
                borderTop: `1px solid ${colors.border}`,
                borderLeft: '2px solid transparent',
                fontFamily: "'Exo 2', sans-serif",
              }}
            >
              <span style={{
                fontSize: 10, width: 24, textAlign: 'center',
                fontFamily: "'JetBrains Mono', monospace",
              }}>OFF</span>
              Disconnect
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 72 }}>
        <CurrentScreen user={user} updateUser={updateUser} addMemory={addMemory} navigate={navigate} />
      </main>

      {/* Background systems */}
      <JarvisCheckin user={user} />
      <CalendarSync />

      {/* Bottom nav */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        display: 'flex',
        background: colors.surface,
        borderTop: `1px solid ${colors.border}`,
        zIndex: 50,
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 -1px 20px rgba(0, 212, 255, 0.05)',
      }}>
        {NAV_ITEMS.map(key => {
          const active = screen === key
          return (
            <button
              key={key}
              onClick={() => navigate(key)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '8px 0 6px', background: 'none', border: 'none',
                borderTop: active ? `2px solid ${colors.primary}` : '2px solid transparent',
                color: active ? colors.primary : colors.textMuted,
                fontSize: 9, cursor: 'pointer', gap: 2,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: 0.5,
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{
                fontSize: 11, fontWeight: 600,
                textShadow: active ? `0 0 8px ${colors.primary}` : 'none',
              }}>{SCREENS[key]?.icon}</span>
              <span style={{ fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' }}>{SCREENS[key]?.label}</span>
            </button>
          )
        })}
      </nav>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        input:focus, textarea:focus { outline: none; border-color: ${colors.primary} !important; box-shadow: ${colors.glow} !important; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0, 212, 255, 0.15); border-radius: 1px; }
      `}</style>
    </div>
  )
}

const btnStyle = {
  width: '100%', padding: '12px 24px',
  background: 'transparent',
  color: colors.primary,
  border: `1px solid ${colors.primary}`,
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: 3, textTransform: 'uppercase',
  boxShadow: colors.glow,
  transition: 'all 0.2s ease',
}

const inputStyle = {
  width: '100%', padding: '12px 14px',
  background: colors.surface,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  fontSize: 13,
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: 1,
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
}
