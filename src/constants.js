const darkColors = {
  bg: '#0a0e17',
  surface: 'rgba(10, 18, 32, 0.95)',
  surfaceLight: 'rgba(15, 25, 50, 0.95)',
  surfaceHover: 'rgba(20, 35, 65, 0.95)',
  border: 'rgba(0, 212, 255, 0.2)',
  borderBright: 'rgba(0, 212, 255, 0.35)',
  primary: '#00d4ff',
  primaryLight: '#66ecff',
  primaryDim: 'rgba(0, 212, 255, 0.2)',
  secondary: '#f0a500',
  secondaryDim: 'rgba(240, 165, 0, 0.2)',
  accent: '#00d4ff',
  warning: '#ffbe30',
  success: '#00e676',
  danger: '#ff4d4d',
  text: '#ffffff',
  textSecondary: '#a0c4e0',
  textMuted: '#6890b0',
  glow: '0 0 15px rgba(0, 212, 255, 0.2)',
  glowStrong: '0 0 25px rgba(0, 212, 255, 0.3)',
  gradient1: 'linear-gradient(135deg, rgba(0, 212, 255, 0.25), rgba(0, 212, 255, 0.08))',
  gradient2: 'linear-gradient(135deg, rgba(0, 230, 118, 0.25), rgba(0, 230, 118, 0.08))',
  gradient3: 'linear-gradient(135deg, rgba(240, 165, 0, 0.25), rgba(240, 165, 0, 0.08))',
}

const sunColors = {
  bg: '#f0f2f5',
  surface: 'rgba(255, 255, 255, 0.95)',
  surfaceLight: 'rgba(240, 245, 250, 0.95)',
  surfaceHover: 'rgba(230, 238, 245, 0.95)',
  border: 'rgba(0, 120, 180, 0.2)',
  borderBright: 'rgba(0, 120, 180, 0.35)',
  primary: '#0077b6',
  primaryLight: '#0096d6',
  primaryDim: 'rgba(0, 119, 182, 0.1)',
  secondary: '#c57800',
  secondaryDim: 'rgba(197, 120, 0, 0.1)',
  accent: '#0077b6',
  warning: '#c57800',
  success: '#00875a',
  danger: '#cc2020',
  text: '#1a1a2e',
  textSecondary: '#3a5068',
  textMuted: '#6b7d8e',
  glow: '0 0 10px rgba(0, 119, 182, 0.1)',
  glowStrong: '0 0 15px rgba(0, 119, 182, 0.15)',
  gradient1: 'linear-gradient(135deg, rgba(0, 119, 182, 0.12), rgba(0, 119, 182, 0.04))',
  gradient2: 'linear-gradient(135deg, rgba(0, 135, 90, 0.12), rgba(0, 135, 90, 0.04))',
  gradient3: 'linear-gradient(135deg, rgba(197, 120, 0, 0.12), rgba(197, 120, 0, 0.04))',
}

// Theme state — reactive
let _currentTheme = 'auto'
let _colors = darkColors
let _listeners = []

function detectSunMode() {
  // Use ambient light sensor if available
  if ('AmbientLightSensor' in window) {
    try {
      const sensor = new AmbientLightSensor()
      sensor.addEventListener('reading', () => {
        if (_currentTheme === 'auto') {
          setActiveColors(sensor.illuminance > 10000 ? sunColors : darkColors)
        }
      })
      sensor.start()
    } catch {}
  }

  // Fallback: check time of day (6am-7pm = potential sun)
  // and prefer-color-scheme
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    if (_currentTheme === 'auto' && mq.matches) {
      setActiveColors(sunColors)
    }
    mq.addEventListener('change', (e) => {
      if (_currentTheme === 'auto') {
        setActiveColors(e.matches ? sunColors : darkColors)
      }
    })
  }
}

function setActiveColors(c) {
  Object.assign(_colors, c)
  _listeners.forEach(fn => fn(_colors))
}

export function setTheme(theme) {
  _currentTheme = theme
  try { localStorage.setItem('jarvis_theme', theme) } catch {}
  if (theme === 'dark') setActiveColors(darkColors)
  else if (theme === 'sun') setActiveColors(sunColors)
  else detectSunMode() // auto
}

export function getTheme() {
  return _currentTheme
}

export function onThemeChange(fn) {
  _listeners.push(fn)
  return () => { _listeners = _listeners.filter(f => f !== fn) }
}

// Initialize
try {
  _currentTheme = localStorage.getItem('jarvis_theme') || 'auto'
} catch {}

if (_currentTheme === 'sun') {
  _colors = { ...sunColors }
} else if (_currentTheme === 'dark') {
  _colors = { ...darkColors }
} else {
  // Auto — check system preference
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    _colors = { ...sunColors }
  } else {
    _colors = { ...darkColors }
  }
}

if (typeof window !== 'undefined') {
  detectSunMode()
}

export const colors = _colors

// Persistent storage helpers (localStorage fallback)
export const loadState = (key, fallback) => {
  try {
    const v = localStorage.getItem('jarvis_' + key)
    return v ? JSON.parse(v) : fallback
  } catch { return fallback }
}

export const saveState = (key, value) => {
  try { localStorage.setItem('jarvis_' + key, JSON.stringify(value)) } catch {}
}
