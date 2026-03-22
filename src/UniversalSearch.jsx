import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { colors, loadState } from './constants';

const RECENT_SEARCHES_KEY = 'universal_search_recent';
const MAX_RECENT = 8;

const SEARCH_CATEGORIES = [
  {
    key: 'tasks',
    label: 'Tasks',
    stateKey: 'tasks',
    color: '#00d4ff',
    icon: '\u2713',
    screen: 'tasks',
    searchFields: (item) => [item.text, item.category, item.priority].filter(Boolean).join(' '),
    renderResult: (item) => item.text || item.title || 'Untitled Task',
    renderSub: (item) => [item.category, item.priority, item.done ? 'Done' : 'Pending'].filter(Boolean).join(' \u2022 '),
  },
  {
    key: 'events',
    label: 'Events',
    stateKey: 'events',
    color: '#f0a500',
    icon: '\u25C8',
    screen: 'calendar',
    searchFields: (item) => [item.title, item.description, item.location, item.date].filter(Boolean).join(' '),
    renderResult: (item) => item.title || 'Untitled Event',
    renderSub: (item) => [item.date, item.time, item.location].filter(Boolean).join(' \u2022 '),
  },
  {
    key: 'reminders',
    label: 'Reminders',
    stateKey: 'reminders',
    color: '#ff6b6b',
    icon: '\u266A',
    screen: 'reminders',
    searchFields: (item) => [item.text, item.title, item.date, item.note].filter(Boolean).join(' '),
    renderResult: (item) => item.text || item.title || 'Untitled Reminder',
    renderSub: (item) => [item.date, item.time].filter(Boolean).join(' \u2022 '),
  },
  {
    key: 'notes',
    label: 'Notes',
    stateKey: 'notes',
    color: '#00e676',
    icon: '\u2630',
    screen: 'notes',
    searchFields: (item) => [item.title, item.content, item.text, item.category].filter(Boolean).join(' '),
    renderResult: (item) => item.title || 'Untitled Note',
    renderSub: (item) => {
      const content = item.content || item.text || '';
      return content.length > 80 ? content.slice(0, 80) + '...' : content;
    },
  },
  {
    key: 'habits',
    label: 'Habits',
    stateKey: 'habits_data',
    color: '#b388ff',
    icon: '\u2605',
    screen: 'habits',
    searchFields: (item) => [item.name, item.title, item.category, item.frequency].filter(Boolean).join(' '),
    renderResult: (item) => item.name || item.title || 'Untitled Habit',
    renderSub: (item) => [item.frequency, item.category, item.streak ? `${item.streak} streak` : null].filter(Boolean).join(' \u2022 '),
  },
  {
    key: 'finance',
    label: 'Finance',
    stateKey: 'finance_txns',
    color: '#ffd740',
    icon: '$',
    screen: 'finance',
    searchFields: (item) => [item.description, item.desc, item.category, item.amount?.toString(), item.date, item.note].filter(Boolean).join(' '),
    renderResult: (item) => item.description || item.desc || item.note || 'Transaction',
    renderSub: (item) => [item.amount != null ? `$${Math.abs(item.amount).toFixed(2)}` : null, item.category, item.date].filter(Boolean).join(' \u2022 '),
  },
  {
    key: 'memory',
    label: 'Long-Term Memory',
    stateKey: 'longterm_memory',
    color: '#80deea',
    icon: '\u2B21',
    screen: 'memory',
    searchFields: (item) => {
      if (typeof item === 'string') return item;
      return [item.text, item.content, item.title, item.key, item.value, item.category].filter(Boolean).join(' ');
    },
    renderResult: (item) => {
      if (typeof item === 'string') return item.length > 60 ? item.slice(0, 60) + '...' : item;
      return item.text || item.title || item.key || 'Memory Entry';
    },
    renderSub: (item) => {
      if (typeof item === 'string') return '';
      return [item.category, item.date, item.value].filter(Boolean).join(' \u2022 ');
    },
  },
  {
    key: 'contacts',
    label: 'Contacts',
    stateKey: 'contacts',
    color: '#ff80ab',
    icon: '\u2302',
    screen: 'contacts',
    searchFields: (item) => [item.name, item.email, item.phone, item.company, item.notes, item.address].filter(Boolean).join(' '),
    renderResult: (item) => item.name || 'Unknown Contact',
    renderSub: (item) => [item.email, item.phone, item.company].filter(Boolean).join(' \u2022 '),
  },
];

function loadRecentSearches() {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query) {
  if (!query || !query.trim()) return;
  const trimmed = query.trim();
  let recent = loadRecentSearches();
  recent = recent.filter((r) => r !== trimmed);
  recent.unshift(trimmed);
  if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent));
  } catch {}
}

export default function UniversalSearch({ active, onClose, navigate }) {
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    if (active) {
      setQuery('');
      setRecentSearches(loadRecentSearches());
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [active]);

  // Listen for Escape key
  useEffect(() => {
    if (!active) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return SEARCH_CATEGORIES.map((cat) => {
      // For contacts, the raw localStorage key is 'jarvis_contacts'
      // but loadState prepends 'jarvis_', so the stateKey is just 'contacts'
      const rawData = loadState(cat.stateKey, []);
      const items = Array.isArray(rawData) ? rawData : Object.values(rawData || {});

      const matched = items.filter((item) => {
        if (!item) return false;
        const haystack = cat.searchFields(item).toLowerCase();
        return q.split(/\s+/).every((word) => haystack.includes(word));
      });

      return { ...cat, results: matched };
    }).filter((cat) => cat.results.length > 0);
  }, [query]);

  const totalResults = results.reduce((sum, cat) => sum + cat.results.length, 0);

  const handleSelect = useCallback(
    (screen, item) => {
      if (query.trim()) saveRecentSearch(query.trim());
      onClose();
      if (navigate) navigate(screen);
    },
    [query, onClose, navigate]
  );

  const handleRecentClick = useCallback((term) => {
    setQuery(term);
  }, []);

  const clearRecent = useCallback(() => {
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {}
    setRecentSearches([]);
  }, []);

  if (!active) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.container} onClick={(e) => e.stopPropagation()}>
        {/* Header / Search Input */}
        <div style={styles.header}>
          <div style={styles.searchRow}>
            <span style={styles.searchIcon}>/</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search everything..."
              style={styles.input}
              autoComplete="off"
              spellCheck={false}
            />
            <button style={styles.closeBtn} onClick={onClose}>
              ESC
            </button>
          </div>
          {query.trim() && (
            <div style={styles.resultCount}>
              {totalResults} result{totalResults !== 1 ? 's' : ''} found
            </div>
          )}
        </div>

        {/* Body */}
        <div style={styles.body}>
          {/* No query — show recent searches */}
          {!query.trim() && recentSearches.length > 0 && (
            <div style={styles.recentSection}>
              <div style={styles.recentHeader}>
                <span style={styles.recentLabel}>RECENT SEARCHES</span>
                <button style={styles.clearBtn} onClick={clearRecent}>
                  Clear
                </button>
              </div>
              {recentSearches.map((term, i) => (
                <button
                  key={i}
                  style={styles.recentItem}
                  onClick={() => handleRecentClick(term)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = colors.surfaceHover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span style={styles.recentIcon}>{'\u21BA'}</span>
                  <span style={styles.recentText}>{term}</span>
                </button>
              ))}
            </div>
          )}

          {/* No query, no recent */}
          {!query.trim() && recentSearches.length === 0 && (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>/</div>
              <div style={styles.emptyText}>
                Search across tasks, events, reminders, notes, habits, finance, memory, and contacts
              </div>
            </div>
          )}

          {/* Has query but no results */}
          {query.trim() && totalResults === 0 && (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>?</div>
              <div style={styles.emptyText}>
                No results found for "{query.trim()}"
              </div>
            </div>
          )}

          {/* Results grouped by category */}
          {results.map((cat) => (
            <div key={cat.key} style={styles.categoryGroup}>
              <div style={{ ...styles.categoryHeader, borderLeftColor: cat.color }}>
                <span style={{ ...styles.categoryIcon, color: cat.color }}>
                  {cat.icon}
                </span>
                <span style={{ ...styles.categoryLabel, color: cat.color }}>
                  {cat.label}
                </span>
                <span style={styles.categoryCount}>
                  {cat.results.length}
                </span>
              </div>
              {cat.results.slice(0, 10).map((item, idx) => (
                <button
                  key={idx}
                  style={styles.resultItem}
                  onClick={() => handleSelect(cat.screen, item)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = colors.surfaceHover;
                    e.currentTarget.style.borderLeftColor = cat.color;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.borderLeftColor = 'transparent';
                  }}
                >
                  <div style={styles.resultMain}>
                    {cat.renderResult(item)}
                  </div>
                  {cat.renderSub(item) && (
                    <div style={styles.resultSub}>
                      {cat.renderSub(item)}
                    </div>
                  )}
                </button>
              ))}
              {cat.results.length > 10 && (
                <div style={styles.moreIndicator}>
                  +{cat.results.length - 10} more results
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    zIndex: 9999,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingTop: '8vh',
    animation: 'fadeIn 0.15s ease-out',
  },
  container: {
    width: '92%',
    maxWidth: 640,
    maxHeight: '80vh',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 16,
    boxShadow: `0 8px 40px rgba(0,0,0,0.6), ${colors.glow}`,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 20px 12px',
    borderBottom: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  searchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  searchIcon: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 22,
    fontWeight: 700,
    color: colors.primary,
    opacity: 0.7,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontFamily: "'Exo 2', sans-serif",
    fontSize: 18,
    color: colors.text,
    caretColor: colors.primary,
    padding: '8px 0',
    letterSpacing: '0.3px',
  },
  closeBtn: {
    background: colors.primaryDim,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    color: colors.textSecondary,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 8px',
    cursor: 'pointer',
    flexShrink: 0,
    letterSpacing: '0.5px',
  },
  resultCount: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 8,
    letterSpacing: '0.5px',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
    WebkitOverflowScrolling: 'touch',
  },
  recentSection: {
    padding: '8px 20px',
  },
  recentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recentLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '1.5px',
  },
  clearBtn: {
    background: 'transparent',
    border: 'none',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    color: colors.textMuted,
    cursor: 'pointer',
    padding: '2px 6px',
    letterSpacing: '0.5px',
  },
  recentItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    padding: '8px 10px',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  recentIcon: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 14,
    color: colors.textMuted,
  },
  recentText: {
    fontFamily: "'Exo 2', sans-serif",
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    gap: 12,
  },
  emptyIcon: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 36,
    color: colors.primaryDim,
    fontWeight: 700,
  },
  emptyText: {
    fontFamily: "'Exo 2', sans-serif",
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 1.5,
    maxWidth: 320,
  },
  categoryGroup: {
    marginBottom: 8,
  },
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 20px',
    borderLeft: '3px solid transparent',
    background: colors.surfaceLight,
  },
  categoryIcon: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 14,
    fontWeight: 700,
    width: 20,
    textAlign: 'center',
    flexShrink: 0,
  },
  categoryLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '1.2px',
    textTransform: 'uppercase',
    flex: 1,
  },
  categoryCount: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    fontWeight: 600,
    color: colors.textMuted,
    background: colors.primaryDim,
    padding: '2px 7px',
    borderRadius: 10,
    letterSpacing: '0.3px',
  },
  resultItem: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    borderLeft: '3px solid transparent',
    padding: '10px 20px 10px 23px',
    cursor: 'pointer',
    transition: 'background 0.12s, border-left-color 0.12s',
  },
  resultMain: {
    fontFamily: "'Exo 2', sans-serif",
    fontSize: 14,
    fontWeight: 500,
    color: colors.text,
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  resultSub: {
    fontFamily: "'Exo 2', sans-serif",
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 1.3,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  moreIndicator: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: colors.textMuted,
    padding: '6px 24px',
    fontStyle: 'italic',
    letterSpacing: '0.3px',
  },
};
