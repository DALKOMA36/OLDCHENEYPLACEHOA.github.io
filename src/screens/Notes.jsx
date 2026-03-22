import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

// ---- Category Definitions ----
const CATEGORIES = [
  { key: 'all', label: 'All', color: colors.primary },
  { key: 'ideas', label: 'Ideas', color: '#f0a500' },
  { key: 'work', label: 'Work', color: '#00e676' },
  { key: 'personal', label: 'Personal', color: '#e040fb' },
  { key: 'code', label: 'Code', color: '#00d4ff' },
  { key: 'research', label: 'Research', color: '#ff6e40' },
]

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'alpha', label: 'A-Z' },
]

// ---- Markdown-Lite Renderer ----
function renderMarkdownLite(text) {
  if (!text) return ''
  const lines = text.split('\n')
  const result = []

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    // Headers
    const h3 = line.match(/^###\s+(.+)/)
    const h2 = line.match(/^##\s+(.+)/)
    const h1 = line.match(/^#\s+(.+)/)
    if (h3) {
      result.push(<h4 key={i} style={{ color: colors.primary, margin: '8px 0 4px', fontFamily: "'Exo 2', sans-serif", fontSize: 14 }}>{inlineFormat(h3[1])}</h4>)
      continue
    }
    if (h2) {
      result.push(<h3 key={i} style={{ color: colors.primary, margin: '10px 0 4px', fontFamily: "'Exo 2', sans-serif", fontSize: 16 }}>{inlineFormat(h2[1])}</h3>)
      continue
    }
    if (h1) {
      result.push(<h2 key={i} style={{ color: colors.primary, margin: '12px 0 6px', fontFamily: "'Exo 2', sans-serif", fontSize: 18 }}>{inlineFormat(h1[1])}</h2>)
      continue
    }

    // Bullet list
    if (line.match(/^[-*]\s+/)) {
      const content = line.replace(/^[-*]\s+/, '')
      result.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginLeft: 8, marginBottom: 2 }}>
          <span style={{ color: colors.primary, flexShrink: 0 }}>&bull;</span>
          <span>{inlineFormat(content)}</span>
        </div>
      )
      continue
    }

    // Empty line
    if (!line.trim()) {
      result.push(<div key={i} style={{ height: 8 }} />)
      continue
    }

    // Regular paragraph
    result.push(<div key={i} style={{ marginBottom: 2 }}>{inlineFormat(line)}</div>)
  }

  return result
}

function inlineFormat(text) {
  // Split by code, bold, italic patterns and build spans
  const parts = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    // Code: `text`
    const codeMatch = remaining.match(/^(.*?)`([^`]+)`(.*)$/)
    if (codeMatch) {
      if (codeMatch[1]) parts.push(<span key={key++}>{codeMatch[1]}</span>)
      parts.push(
        <code key={key++} style={{
          background: 'rgba(0, 212, 255, 0.15)',
          color: colors.primary,
          padding: '1px 5px',
          borderRadius: 3,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.9em',
        }}>{codeMatch[2]}</code>
      )
      remaining = codeMatch[3]
      continue
    }

    // Bold: **text**
    const boldMatch = remaining.match(/^(.*?)\*\*([^*]+)\*\*(.*)$/)
    if (boldMatch) {
      if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>)
      parts.push(<strong key={key++} style={{ color: colors.text, fontWeight: 700 }}>{boldMatch[2]}</strong>)
      remaining = boldMatch[3]
      continue
    }

    // Italic: *text*
    const italicMatch = remaining.match(/^(.*?)\*([^*]+)\*(.*)$/)
    if (italicMatch) {
      if (italicMatch[1]) parts.push(<span key={key++}>{italicMatch[1]}</span>)
      parts.push(<em key={key++} style={{ color: colors.textSecondary, fontStyle: 'italic' }}>{italicMatch[2]}</em>)
      remaining = italicMatch[3]
      continue
    }

    // No match, push remaining
    parts.push(<span key={key++}>{remaining}</span>)
    break
  }

  return parts.length === 1 ? parts[0] : parts
}

// ---- Unique ID Generator ----
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ---- Main Component ----
export default function Notes({ user }) {
  const [notes, setNotes] = useState(() => loadState('notes', []))
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [editingNote, setEditingNote] = useState(null)
  const [showEditor, setShowEditor] = useState(false)
  const [summarizing, setSummarizing] = useState(null) // note id or 'all'
  const [summaryText, setSummaryText] = useState('')
  const [showSummary, setShowSummary] = useState(false)
  const titleRef = useRef(null)

  // Auto-save whenever notes change
  useEffect(() => {
    saveState('notes', notes)
  }, [notes])

  // Load from D1
  useEffect(() => {
    db.notes.list().then(rows => {
      if (rows?.length) setNotes(rows.map(r => ({ ...r, pinned: !!r.pinned })))
    }).catch(() => {})
  }, [])

  // ---- CRUD ----
  const createNote = useCallback(() => {
    const newNote = {
      id: uid(),
      title: '',
      body: '',
      category: activeCategory === 'all' ? 'ideas' : activeCategory,
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setEditingNote(newNote)
    setShowEditor(true)
    setTimeout(() => titleRef.current?.focus(), 50)
  }, [activeCategory])

  const saveNote = useCallback(() => {
    if (!editingNote) return
    const trimmedTitle = (editingNote.title || '').trim()
    const trimmedBody = (editingNote.body || '').trim()
    if (!trimmedTitle && !trimmedBody) {
      setShowEditor(false)
      setEditingNote(null)
      return
    }

    setNotes(prev => {
      const existing = prev.findIndex(n => n.id === editingNote.id)
      const updated = {
        ...editingNote,
        title: trimmedTitle || 'Untitled Note',
        body: trimmedBody,
        updatedAt: Date.now(),
      }
      if (existing >= 0) {
        const copy = [...prev]
        copy[existing] = updated
        db.notes.update(updated).catch(() => {})
        return copy
      }
      db.notes.create(updated).catch(() => {})
      return [updated, ...prev]
    })
    setShowEditor(false)
    setEditingNote(null)
  }, [editingNote])

  const deleteNote = useCallback((id) => {
    setNotes(prev => prev.filter(n => n.id !== id))
    db.notes.delete(id).catch(() => {})
    if (editingNote?.id === id) {
      setShowEditor(false)
      setEditingNote(null)
    }
  }, [editingNote])

  const togglePin = useCallback((id) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned: !n.pinned, updatedAt: Date.now() } : n))
  }, [])

  const openNote = useCallback((note) => {
    setEditingNote({ ...note })
    setShowEditor(true)
    setTimeout(() => titleRef.current?.focus(), 50)
  }, [])

  // ---- AI Summarize ----
  const summarizeNote = useCallback(async (note) => {
    setSummarizing(note.id)
    setSummaryText('')
    setShowSummary(true)
    try {
      const prompt = `Summarize this note concisely. Title: "${note.title}". Content: "${note.body}"`
      const result = await db.ai.chat(prompt, [], { role: 'You are JARVIS, a concise AI assistant. Provide a brief summary.' })
      setSummaryText(result.response || result.message || JSON.stringify(result))
    } catch (err) {
      setSummaryText('Summary unavailable: ' + err.message)
    }
    setSummarizing(null)
  }, [])

  const summarizeAll = useCallback(async () => {
    setSummarizing('all')
    setSummaryText('')
    setShowSummary(true)
    try {
      const allText = notes.map(n => `[${n.title}]: ${n.body}`).join('\n\n')
      const prompt = `Summarize all of these notes into key themes and action items:\n\n${allText}`
      const result = await db.ai.chat(prompt, [], { role: 'You are JARVIS. Provide a structured summary with key themes and action items.' })
      setSummaryText(result.response || result.message || JSON.stringify(result))
    } catch (err) {
      setSummaryText('Summary unavailable: ' + err.message)
    }
    setSummarizing(null)
  }, [notes])

  // ---- Filtered & Sorted Notes ----
  const filteredNotes = useMemo(() => {
    let result = [...notes]

    // Category filter
    if (activeCategory !== 'all') {
      result = result.filter(n => n.category === activeCategory)
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(n =>
        (n.title || '').toLowerCase().includes(q) ||
        (n.body || '').toLowerCase().includes(q)
      )
    }

    // Sort
    if (sortBy === 'newest') {
      result.sort((a, b) => b.createdAt - a.createdAt)
    } else if (sortBy === 'oldest') {
      result.sort((a, b) => a.createdAt - b.createdAt)
    } else if (sortBy === 'alpha') {
      result.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    }

    // Pinned always on top
    const pinned = result.filter(n => n.pinned)
    const unpinned = result.filter(n => !n.pinned)
    return [...pinned, ...unpinned]
  }, [notes, activeCategory, search, sortBy])

  // ---- Helpers ----
  const getCategoryColor = (key) => CATEGORIES.find(c => c.key === key)?.color || colors.primary
  const getCategoryLabel = (key) => CATEGORIES.find(c => c.key === key)?.label || key

  const formatTime = (ts) => {
    const d = new Date(ts)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago'
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago'
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago'
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
  }

  // ---- Styles ----
  const s = {
    container: {
      minHeight: '100vh',
      background: colors.bg,
      color: colors.text,
      fontFamily: "'Exo 2', sans-serif",
      padding: '0 0 100px',
    },
    header: {
      background: colors.surface,
      borderBottom: `1px solid ${colors.border}`,
      padding: '16px 20px 12px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backdropFilter: 'blur(20px)',
    },
    headerTop: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    title: {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 20,
      fontWeight: 700,
      color: colors.primary,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    headerActions: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
    },
    iconBtn: {
      background: 'rgba(0, 212, 255, 0.1)',
      border: `1px solid ${colors.border}`,
      borderRadius: 8,
      color: colors.primary,
      padding: '10px 16px', minHeight: 44,
      cursor: 'pointer',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 12,
      fontWeight: 600,
      transition: 'all 0.2s',
    },
    searchBar: {
      display: 'flex',
      gap: 8,
      marginBottom: 10,
    },
    searchInput: {
      flex: 1,
      background: 'rgba(0, 212, 255, 0.05)',
      border: `1px solid ${colors.border}`,
      borderRadius: 8,
      color: colors.text,
      padding: '8px 12px',
      fontFamily: "'Exo 2', sans-serif",
      fontSize: 14,
      outline: 'none',
    },
    categoryBar: {
      display: 'flex',
      gap: 6,
      overflowX: 'auto',
      paddingBottom: 4,
    },
    categoryPill: (active, color) => ({
      padding: '8px 14px', minHeight: 36,
      borderRadius: 20,
      border: `1px solid ${active ? color : colors.border}`,
      background: active ? color + '22' : 'transparent',
      color: active ? color : colors.textMuted,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 11,
      fontWeight: 600,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      transition: 'all 0.2s',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    }),
    sortRow: {
      display: 'flex',
      gap: 6,
      marginTop: 8,
      alignItems: 'center',
    },
    sortLabel: {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 10,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    sortBtn: (active) => ({
      padding: '6px 12px', minHeight: 36, borderRadius: 8,
      borderRadius: 4,
      border: 'none',
      background: active ? 'rgba(0, 212, 255, 0.15)' : 'transparent',
      color: active ? colors.primary : colors.textMuted,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 10,
      cursor: 'pointer',
      fontWeight: active ? 700 : 400,
    }),
    notesList: {
      padding: '12px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    },
    noteCard: (catColor, pinned) => ({
      background: colors.surface,
      border: `1px solid ${pinned ? catColor + '55' : colors.border}`,
      borderLeft: `3px solid ${catColor}`,
      borderRadius: 10,
      padding: '14px 16px',
      cursor: 'pointer',
      transition: 'all 0.2s',
      position: 'relative',
      boxShadow: pinned ? `0 0 12px ${catColor}15` : 'none',
    }),
    noteTitle: {
      fontFamily: "'Exo 2', sans-serif",
      fontSize: 15,
      fontWeight: 700,
      color: colors.text,
      marginBottom: 4,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    },
    notePreview: {
      fontFamily: "'Exo 2', sans-serif",
      fontSize: 14,
      color: colors.textMuted,
      lineHeight: 1.4,
      maxHeight: 40,
      overflow: 'hidden',
      marginBottom: 8,
    },
    noteMeta: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    noteTime: {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 10,
      color: colors.textMuted,
    },
    noteActions: {
      display: 'flex',
      gap: 6,
    },
    smallBtn: (color) => ({
      background: 'transparent',
      border: 'none',
      color: color || colors.textMuted,
      cursor: 'pointer',
      fontSize: 12,
      padding: '8px 10px',
      minHeight: 36,
      borderRadius: 8,
      fontFamily: "'JetBrains Mono', monospace",
      fontWeight: 600,
    }),
    pinBadge: {
      fontSize: 10,
      color: '#f0a500',
    },
    categoryTag: (color) => ({
      display: 'inline-block',
      padding: '4px 8px',
      borderRadius: 6,
      background: color + '22',
      color: color,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    }),
    emptyState: {
      textAlign: 'center',
      padding: '60px 20px',
      color: colors.textMuted,
    },
    emptyIcon: {
      fontSize: 48,
      marginBottom: 12,
      opacity: 0.3,
    },
    emptyText: {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 14,
      letterSpacing: 1,
    },
    // Editor overlay
    editorOverlay: {
      position: 'fixed',
      inset: 0,
      background: colors.bg,
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
    },
    editorHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      borderBottom: `1px solid ${colors.border}`,
      background: colors.surface,
    },
    editorTitleInput: {
      width: '100%',
      background: 'transparent',
      border: 'none',
      color: colors.text,
      fontFamily: "'Exo 2', sans-serif",
      fontSize: 20,
      fontWeight: 700,
      outline: 'none',
      padding: '12px 16px 4px',
    },
    editorBody: {
      flex: 1,
      background: 'transparent',
      border: 'none',
      color: colors.text,
      fontFamily: "'Exo 2', sans-serif",
      fontSize: 14,
      lineHeight: 1.6,
      outline: 'none',
      padding: '8px 16px',
      resize: 'none',
      width: '100%',
    },
    editorCategoryRow: {
      display: 'flex',
      gap: 6,
      padding: '8px 16px',
      borderTop: `1px solid ${colors.border}`,
      overflowX: 'auto',
    },
    // Summary modal
    summaryOverlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      zIndex: 300,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    summaryBox: {
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: 12,
      padding: 24,
      maxWidth: 500,
      width: '100%',
      maxHeight: '70vh',
      overflowY: 'auto',
    },
    summaryTitle: {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 14,
      fontWeight: 700,
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 12,
    },
    summaryContent: {
      fontFamily: "'Exo 2', sans-serif",
      fontSize: 14,
      lineHeight: 1.6,
      color: colors.textSecondary,
    },
    fab: {
      position: 'fixed',
      bottom: 80,
      right: 20,
      width: 54,
      height: 54,
      borderRadius: '50%',
      background: `linear-gradient(135deg, ${colors.primary}, #0099cc)`,
      border: 'none',
      color: '#fff',
      fontSize: 28,
      fontWeight: 300,
      cursor: 'pointer',
      boxShadow: `0 4px 20px rgba(0, 212, 255, 0.3)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 150,
      transition: 'transform 0.2s',
    },
    noteCount: {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 11,
      color: colors.textMuted,
      padding: '4px 16px',
    },
  }

  // ---- Render ----
  return (
    <div style={s.container}>
      {/* ---- Header ---- */}
      <div style={s.header}>
        <div style={s.headerTop}>
          <div style={s.title}>NOTES LAB</div>
          <div style={s.headerActions}>
            {notes.length > 0 && (
              <button
                style={{
                  ...s.iconBtn,
                  opacity: summarizing === 'all' ? 0.5 : 1,
                }}
                onClick={summarizeAll}
                disabled={summarizing === 'all'}
              >
                {summarizing === 'all' ? 'ANALYZING...' : 'AI SUMMARY'}
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div style={s.searchBar}>
          <input
            style={s.searchInput}
            placeholder="Search notes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Categories */}
        <div style={s.categoryBar}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              style={s.categoryPill(activeCategory === cat.key, cat.color)}
              onClick={() => setActiveCategory(cat.key)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div style={s.sortRow}>
          <span style={s.sortLabel}>Sort:</span>
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.key}
              style={s.sortBtn(sortBy === opt.key)}
              onClick={() => setSortBy(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Notes Count ---- */}
      <div style={s.noteCount}>
        {filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''}
        {activeCategory !== 'all' && ` in ${getCategoryLabel(activeCategory)}`}
        {search && ` matching "${search}"`}
      </div>

      {/* ---- Notes List ---- */}
      <div style={s.notesList}>
        {filteredNotes.length === 0 && (
          <div style={s.emptyState}>
            <div style={s.emptyIcon}>{search ? '?' : '>'}_</div>
            <div style={s.emptyText}>
              {search ? 'No matching notes found' : 'No notes yet. Start documenting, sir.'}
            </div>
          </div>
        )}

        {filteredNotes.map(note => {
          const catColor = getCategoryColor(note.category)
          return (
            <div
              key={note.id}
              style={s.noteCard(catColor, note.pinned)}
              onClick={() => openNote(note)}
            >
              <div style={s.noteTitle}>
                {note.pinned && <span style={s.pinBadge} title="Pinned">[PIN]</span>}
                {note.title || 'Untitled Note'}
              </div>
              <div style={s.notePreview}>
                {note.body?.slice(0, 120) || 'Empty note'}
                {(note.body?.length || 0) > 120 ? '...' : ''}
              </div>
              <div style={s.noteMeta}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={s.categoryTag(catColor)}>{getCategoryLabel(note.category)}</span>
                  <span style={s.noteTime}>{formatTime(note.createdAt)}</span>
                  {note.updatedAt !== note.createdAt && (
                    <span style={{ ...s.noteTime, fontStyle: 'italic' }}>edited</span>
                  )}
                </div>
                <div style={s.noteActions} onClick={e => e.stopPropagation()}>
                  <button
                    style={s.smallBtn(note.pinned ? '#f0a500' : colors.textMuted)}
                    onClick={() => togglePin(note.id)}
                    title={note.pinned ? 'Unpin' : 'Pin'}
                  >
                    {note.pinned ? '[UNPIN]' : '[PIN]'}
                  </button>
                  <button
                    style={s.smallBtn(colors.primary)}
                    onClick={() => summarizeNote(note)}
                    disabled={summarizing === note.id}
                    title="AI Summarize"
                  >
                    {summarizing === note.id ? '...' : '[AI]'}
                  </button>
                  <button
                    style={s.smallBtn(colors.danger)}
                    onClick={() => { if (confirm('Delete this note?')) deleteNote(note.id) }}
                    title="Delete"
                  >
                    [DEL]
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ---- FAB: New Note ---- */}
      {!showEditor && (
        <button style={s.fab} onClick={createNote} title="New Note">+</button>
      )}

      {/* ---- Editor Overlay ---- */}
      {showEditor && editingNote && (
        <div style={s.editorOverlay}>
          <div style={s.editorHeader}>
            <button
              style={{ ...s.iconBtn, background: 'transparent', border: 'none', fontSize: 14 }}
              onClick={saveNote}
            >
              SAVE & CLOSE
            </button>
            <button
              style={{ ...s.iconBtn, background: 'transparent', border: 'none', color: colors.textMuted, fontSize: 12 }}
              onClick={() => { setShowEditor(false); setEditingNote(null) }}
            >
              DISCARD
            </button>
          </div>

          <input
            ref={titleRef}
            style={s.editorTitleInput}
            placeholder="Note title..."
            value={editingNote.title}
            onChange={e => setEditingNote(prev => ({ ...prev, title: e.target.value }))}
          />

          <textarea
            style={s.editorBody}
            placeholder="Start typing... Supports **bold**, *italic*, `code`, # headers, and - bullet lists."
            value={editingNote.body}
            onChange={e => setEditingNote(prev => ({ ...prev, body: e.target.value }))}
          />

          {/* Preview */}
          {editingNote.body && (
            <div style={{
              borderTop: `1px solid ${colors.border}`,
              padding: '12px 16px',
              maxHeight: 200,
              overflowY: 'auto',
              background: 'rgba(0, 212, 255, 0.03)',
            }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                color: colors.textMuted,
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 6,
              }}>
                PREVIEW
              </div>
              <div style={{ fontFamily: "'Exo 2', sans-serif", fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
                {renderMarkdownLite(editingNote.body)}
              </div>
            </div>
          )}

          {/* Category selector */}
          <div style={s.editorCategoryRow}>
            {CATEGORIES.filter(c => c.key !== 'all').map(cat => (
              <button
                key={cat.key}
                style={s.categoryPill(editingNote.category === cat.key, cat.color)}
                onClick={() => setEditingNote(prev => ({ ...prev, category: cat.key }))}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---- Summary Modal ---- */}
      {showSummary && (
        <div style={s.summaryOverlay} onClick={() => setShowSummary(false)}>
          <div style={s.summaryBox} onClick={e => e.stopPropagation()}>
            <div style={s.summaryTitle}>
              JARVIS ANALYSIS
            </div>
            <div style={s.summaryContent}>
              {summarizing ? (
                <div style={{ color: colors.primary, fontFamily: "'JetBrains Mono', monospace" }}>
                  Processing neural summary...
                </div>
              ) : (
                renderMarkdownLite(summaryText)
              )}
            </div>
            {!summarizing && (
              <button
                style={{ ...s.iconBtn, marginTop: 16, width: '100%', textAlign: 'center' }}
                onClick={() => setShowSummary(false)}
              >
                DISMISS
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
