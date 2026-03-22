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
import Notes from './screens/Notes'
import FlightTracker from './screens/FlightTracker'
import JarvisCheckin from './JarvisCheckin'
import CalendarSync from './CalendarSync'
import BootSequence from './BootSequence'
import StatusBar from './StatusBar'
import JarvisAssistant from './JarvisAssistant'
import FocusMode from './FocusMode'
import UniversalSearch from './UniversalSearch'
import ScreenTransition from './ScreenTransition'
import { syncQueue, isOffline } from './offline'
import { db, auth } from './db'
import { colors, loadState, saveState } from './constants'

const SCREENS = {
  dashboard: { label: 'Home', icon: 'H', component: Dashboard },
  trains: { label: 'Trains', icon: 'TR', component: TrainTracker },
  chat: { label: 'Chat', icon: 'AI', component: Chat },
  calendar: { label: 'Calendar', icon: 'CA', component: Calendar },
  tasks: { label: 'Tasks', icon: 'TK', component: Tasks },
  meals: { label: 'Meals', icon: 'ML', component: MealPlanner },
  scanner: { label: 'Scanner', icon: 'SC', component: Scanner },
  channels: { label: 'Messages', icon: 'MS', component: Channels },
  voice: { label: 'Voice', icon: 'VC', component: Voice },
  reader: { label: 'Reader', icon: 'RD', component: Reader },
  travel: { label: 'Travel', icon: 'TV', component: TravelPlanner },
  builder: { label: 'Custom Apps', icon: 'AP', component: AppBuilder },
  reminders: { label: 'Reminders', icon: 'RM', component: Reminders },
  habits: { label: 'Habits', icon: 'HB', component: HabitTracker },
  finance: { label: 'Finance', icon: 'FN', component: Finance },
  media: { label: 'Media', icon: 'MD', component: MediaHub },
  notes: { label: 'Notes', icon: 'NT', component: Notes },
  flights: { label: 'Flights', icon: 'FL', component: FlightTracker },
  settings: { label: 'Settings', icon: 'SY', component: Settings },
}

// Bottom nav — just the 3 essentials
const NAV_ITEMS = ['dashboard', 'chat', 'voice']

export { colors, loadState, saveState }

export default function App() {
  const [screen, setScreen] = useState('dashboard')
  const [menuOpen, setMenuOpen] = useState(false) // kept for backwards compat
  const [loading, setLoading] = useState(true)
  const [booting, setBooting] = useState(true)
  const [focusMode, setFocusMode] = useState(false)
  const [assistantActive, setAssistantActive] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [transitionTarget, setTransitionTarget] = useState(null)
  const [isOfflineState, setIsOfflineState] = useState(!navigator.onLine)
  const [syncToast, setSyncToast] = useState(null) // null | { message, fading }
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

  const navigate = useCallback((s) => {
    if (s === screen) return
    setTransitionTarget(s)
    setTransitioning(true)
    setMenuOpen(false)
  }, [screen])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // Don't trigger in input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return

      if (e.key === 'Escape') { navigate('dashboard'); setAssistantActive(false); setFocusMode(false); setSearchOpen(false) }
      else if (e.key === '/' || e.key === 's' || e.key === 'S') { setSearchOpen(true); e.preventDefault(); return }
      else if (e.key === 'j' || e.key === 'J') setAssistantActive(prev => !prev)
      else if (e.key === 'f' && !e.ctrlKey && !e.metaKey) setFocusMode(prev => !prev)
      else if (e.key === 'v' || e.key === 'V') navigate('voice')
      else if (e.key === 'c' && !e.ctrlKey && !e.metaKey) navigate('chat')
      else if (e.key === 'h' || e.key === 'H') navigate('dashboard')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Online/offline sync
  useEffect(() => {
    const handleOffline = () => setIsOfflineState(true)
    const handleOnline = async () => {
      setIsOfflineState(false)
      try {
        const results = await syncQueue(db)
        if (results && results.length > 0) {
          setSyncToast({ message: `Back online — syncing ${results.length} queued actions...`, fading: false })
          setTimeout(() => {
            setSyncToast({ message: 'Synced!', fading: false })
            setTimeout(() => setSyncToast(prev => prev ? { ...prev, fading: true } : null), 2000)
            setTimeout(() => setSyncToast(null), 3000)
          }, 1000)
        } else {
          setSyncToast({ message: 'Back online!', fading: false })
          setTimeout(() => setSyncToast(prev => prev ? { ...prev, fading: true } : null), 2000)
          setTimeout(() => setSyncToast(null), 3000)
        }
      } catch {
        setSyncToast({ message: 'Back online — sync failed', fading: false })
        setTimeout(() => setSyncToast(prev => prev ? { ...prev, fading: true } : null), 2000)
        setTimeout(() => setSyncToast(null), 3000)
      }
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

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
      {/* Header — clean, big tap targets */}
      <div style={{
        background: colors.surface,
        borderBottom: `1px solid ${colors.border}`,
        position: 'relative', zIndex: 100,
        paddingTop: 'env(safe-area-inset-top, 0)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 12px',
        }}>
          {/* Back button — big and obvious */}
          {screen !== 'dashboard' ? (
            <button onClick={() => navigate('dashboard')} style={{
              background: 'rgba(0, 212, 255, 0.08)', border: `1px solid ${colors.border}`,
              color: colors.primary, borderRadius: 12,
              fontSize: 20, cursor: 'pointer', padding: '10px 16px',
              fontFamily: "'JetBrains Mono', monospace",
              WebkitTapHighlightColor: 'rgba(0,212,255,0.3)',
              minWidth: 50, minHeight: 48, touchAction: 'manipulation',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{'←'}</button>
          ) : (
            <div style={{ width: 50 }} />
          )}

          {/* JARVIS button — center, very obvious */}
          <button
            onClick={() => setAssistantActive(!assistantActive)}
            style={{
              background: assistantActive ? 'rgba(0, 230, 118, 0.15)' : 'rgba(0, 212, 255, 0.08)',
              border: `2px solid ${assistantActive ? colors.success : colors.primary}`,
              borderRadius: 16, cursor: 'pointer',
              padding: '12px 28px',
              color: assistantActive ? colors.success : colors.primary,
              fontSize: 18, fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: 4,
              textShadow: `0 0 12px ${assistantActive ? colors.success : colors.primary}40`,
              WebkitTapHighlightColor: 'rgba(0,212,255,0.3)',
              minHeight: 48, touchAction: 'manipulation',
              transition: 'all 0.2s ease',
              boxShadow: assistantActive ? `0 0 20px ${colors.success}30` : `0 0 15px ${colors.primary}15`,
            }}
          >
            {assistantActive ? '● JARVIS' : 'JARVIS'}
          </button>

          {/* Settings — gear icon, big target */}
          <button
            onClick={() => navigate('settings')}
            style={{
              background: 'rgba(255,255,255,0.03)', border: `1px solid ${colors.border}`,
              color: colors.textMuted, fontSize: 16, cursor: 'pointer', borderRadius: 12,
              padding: '10px 14px', minWidth: 50, minHeight: 48,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'rgba(0,212,255,0.2)',
              touchAction: 'manipulation',
            }}
          >⚙</button>
        </div>

        {/* Screen name — only when not on dashboard */}
        {screen !== 'dashboard' && (
          <div style={{
            textAlign: 'center', padding: '0 16px 8px',
            color: colors.textSecondary, fontSize: 13, fontWeight: 500,
            fontFamily: "'Exo 2', sans-serif",
            letterSpacing: 1,
          }}>{SCREENS[screen]?.label}</div>
        )}
      </div>

      {/* Offline indicator bar */}
      {isOfflineState && (
        <div style={{
          background: '#d32f2f', color: '#fff', textAlign: 'center',
          padding: '4px 0', fontSize: 11, fontWeight: 700,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: 2, zIndex: 99,
        }}>OFFLINE</div>
      )}

      {/* Sync toast notification */}
      {syncToast && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: colors.surface, color: colors.primary,
          border: `1px solid ${colors.primary}`, borderRadius: 8,
          padding: '10px 20px', fontSize: 12, fontWeight: 600,
          fontFamily: "'JetBrains Mono', monospace",
          zIndex: 10000, boxShadow: `0 4px 20px rgba(0,0,0,0.5), ${colors.glow}`,
          transition: 'opacity 1s ease',
          opacity: syncToast.fading ? 0 : 1,
          whiteSpace: 'nowrap',
        }}>{syncToast.message}</div>
      )}

      {/* Screen transition */}
      <ScreenTransition active={transitioning} onComplete={() => {
        if (transitionTarget) setScreen(transitionTarget)
        setTransitioning(false)
        setTransitionTarget(null)
      }} />

      {/* Full-screen overlays */}
      {booting && <BootSequence user={user} onComplete={() => setBooting(false)} />}
      {focusMode && <FocusMode onExit={() => setFocusMode(false)} />}
      {searchOpen && <UniversalSearch active={searchOpen} onClose={() => setSearchOpen(false)} navigate={navigate} />}

      {/* Main content */}
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>
        <CurrentScreen user={user} updateUser={updateUser} addMemory={addMemory} navigate={navigate} startFocusMode={() => setFocusMode(true)} />
      </main>

      {/* JARVIS always-on assistant */}
      <JarvisAssistant active={assistantActive} onClose={() => setAssistantActive(false)} currentScreen={screen} user={user} />

      {/* Background systems */}
      <JarvisCheckin user={user} />
      <CalendarSync />

      {/* No bottom nav — Dashboard is the hub, header has back button */}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes glow { 0%, 100% { box-shadow: 0 0 5px ${colors.primary}20; } 50% { box-shadow: 0 0 15px ${colors.primary}40; } }
        @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }

        /* Make ALL screens animate in — longer, more dramatic */
        main > * { animation: fadeIn 0.5s ease; }

        /* Big touch targets everywhere */
        button { min-height: 36px; }

        /* Smooth borders */
        * { border-radius: inherit; }

        /* Input focus glow */
        input:focus, textarea:focus, select:focus {
          outline: none;
          border-color: ${colors.primary} !important;
          box-shadow: 0 0 0 2px ${colors.primary}25 !important;
        }

        /* Nice scrollbars */
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
