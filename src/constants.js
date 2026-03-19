export const colors = {
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
