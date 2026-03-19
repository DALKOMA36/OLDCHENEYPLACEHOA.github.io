export const colors = {
  bg: '#0a0e17',
  surface: 'rgba(10, 18, 32, 0.85)',
  surfaceLight: 'rgba(15, 25, 45, 0.9)',
  surfaceHover: 'rgba(20, 35, 60, 0.9)',
  border: 'rgba(0, 212, 255, 0.12)',
  borderBright: 'rgba(0, 212, 255, 0.25)',
  primary: '#00d4ff',
  primaryLight: '#4de8ff',
  primaryDim: 'rgba(0, 212, 255, 0.15)',
  secondary: '#f0a500',
  secondaryDim: 'rgba(240, 165, 0, 0.15)',
  accent: '#00d4ff',
  warning: '#f0a500',
  success: '#00e676',
  danger: '#ff3d3d',
  text: '#e0f0ff',
  textSecondary: '#6b8aaa',
  textMuted: '#3a5068',
  glow: '0 0 15px rgba(0, 212, 255, 0.15)',
  glowStrong: '0 0 25px rgba(0, 212, 255, 0.25)',
  gradient1: 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 212, 255, 0.05))',
  gradient2: 'linear-gradient(135deg, rgba(0, 230, 118, 0.2), rgba(0, 230, 118, 0.05))',
  gradient3: 'linear-gradient(135deg, rgba(240, 165, 0, 0.2), rgba(240, 165, 0, 0.05))',
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
