import { useState, useRef, useEffect } from 'react'
import { colors } from '../constants'
import { db } from '../db'

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2]

export default function Reader({ user }) {
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState('text') // text, url, scan
  const [pages, setPages] = useState([]) // captured page images
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState('')
  const fileInputRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [progress, setProgress] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const [currentChunk, setCurrentChunk] = useState(0)
  const [loading, setLoading] = useState(false)
  const [voices, setVoices] = useState([])
  const [selectedVoice, setSelectedVoice] = useState(null)
  const [error, setError] = useState('')
  const utterRef = useRef(null)
  const chunksRef = useRef([])
  const currentIndexRef = useRef(0)
  const cancelledRef = useRef(false)

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const v = window.speechSynthesis?.getVoices() || []
      const english = v.filter(voice => voice.lang.startsWith('en'))
      setVoices(english)
      if (!selectedVoice && english.length) {
        // Prefer high-quality voices
        const preferred = english.find(v => v.name.includes('Google') && v.name.includes('US'))
          || english.find(v => v.name.includes('Samantha'))
          || english.find(v => v.name.includes('Daniel'))
          || english.find(v => !v.localService && v.lang === 'en-US')
          || english.find(v => v.lang === 'en-US')
          || english[0]
        setSelectedVoice(preferred?.name || null)
      }
    }
    loadVoices()
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices)
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices)
  }, [])

  // Split text into readable chunks (by sentence, ~200 chars each)
  const splitIntoChunks = (fullText) => {
    const sentences = fullText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [fullText]
    const chunks = []
    let current = ''

    for (const sentence of sentences) {
      if ((current + sentence).length > 200 && current.length > 0) {
        chunks.push(current.trim())
        current = sentence
      } else {
        current += sentence
      }
    }
    if (current.trim()) chunks.push(current.trim())
    return chunks
  }

  const fetchUrl = async () => {
    if (!url.trim()) return
    setLoading(true)
    setError('')
    try {
      const result = await db.ai.chat(
        `Extract and return ONLY the main article/content text from this URL. Remove all navigation, ads, headers, footers. Just the readable content:\n\n${url}`,
        [], { userName: user.name }
      )
      if (result.response) {
        setText(result.response)
      }
    } catch (err) {
      setError('Failed to fetch URL content')
    }
    setLoading(false)
  }

  const handlePhotos = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setPages(prev => [...prev, ...files])
  }

  const removePage = (index) => {
    setPages(prev => prev.filter((_, i) => i !== index))
  }

  const processPages = async () => {
    if (pages.length === 0) return
    setScanning(true)
    setScanProgress(`Processing ${pages.length} page${pages.length > 1 ? 's' : ''}...`)
    setError('')

    try {
      const result = await db.ai.ocr(pages)
      if (result.text) {
        setText(prev => prev ? prev + '\n\n' + result.text : result.text)
        setScanProgress(`Extracted text from ${result.pages || pages.length} page(s)`)
        setPages([])
      } else {
        setError(result.error || 'No text extracted')
        setScanProgress('')
      }
    } catch (err) {
      setError(err.message)
      setScanProgress('')
    }
    setScanning(false)
  }

  const speak = (startIndex = 0) => {
    if (!text.trim()) return
    if (!('speechSynthesis' in window)) { setError('Speech synthesis not supported'); return }

    window.speechSynthesis.cancel()
    cancelledRef.current = false

    const chunks = splitIntoChunks(text)
    chunksRef.current = chunks
    setTotalChunks(chunks.length)
    currentIndexRef.current = startIndex

    setPlaying(true)
    setPaused(false)

    const speakChunk = (index) => {
      if (index >= chunks.length || cancelledRef.current) {
        setPlaying(false)
        setPaused(false)
        setProgress(100)
        return
      }

      const utter = new SpeechSynthesisUtterance(chunks[index])
      utter.rate = speed
      utter.pitch = 1.0

      const voice = voices.find(v => v.name === selectedVoice)
      if (voice) utter.voice = voice

      utter.onstart = () => {
        setCurrentChunk(index)
        setProgress(Math.round((index / chunks.length) * 100))
        currentIndexRef.current = index
      }

      utter.onend = () => {
        if (!cancelledRef.current) {
          speakChunk(index + 1)
        }
      }

      utter.onerror = (e) => {
        if (e.error !== 'canceled' && e.error !== 'interrupted') {
          setError(`Speech error: ${e.error}`)
        }
      }

      utterRef.current = utter
      window.speechSynthesis.speak(utter)
    }

    speakChunk(startIndex)
  }

  const pause = () => {
    window.speechSynthesis.pause()
    setPaused(true)
  }

  const resume = () => {
    window.speechSynthesis.resume()
    setPaused(false)
  }

  const stop = () => {
    cancelledRef.current = true
    window.speechSynthesis.cancel()
    setPlaying(false)
    setPaused(false)
  }

  const skipForward = () => {
    const next = Math.min(currentIndexRef.current + 1, chunksRef.current.length - 1)
    cancelledRef.current = true
    window.speechSynthesis.cancel()
    cancelledRef.current = false
    speak(next)
  }

  const skipBack = () => {
    const prev = Math.max(currentIndexRef.current - 1, 0)
    cancelledRef.current = true
    window.speechSynthesis.cancel()
    cancelledRef.current = false
    speak(prev)
  }

  const changeSpeed = () => {
    const idx = SPEEDS.indexOf(speed)
    const newSpeed = SPEEDS[(idx + 1) % SPEEDS.length]
    setSpeed(newSpeed)
    if (playing) {
      const current = currentIndexRef.current
      cancelledRef.current = true
      window.speechSynthesis.cancel()
      cancelledRef.current = false
      setTimeout(() => speak(current), 100)
    }
  }

  // Cleanup on unmount
  useEffect(() => () => {
    cancelledRef.current = true
    window.speechSynthesis?.cancel()
  }, [])

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{
        color: colors.primary, fontSize: 11, fontWeight: 600, marginBottom: 4,
        fontFamily: "'JetBrains Mono', monospace", letterSpacing: 3,
      }}>Reader</h2>
      <p style={{
        color: colors.textMuted, fontSize: 10, marginBottom: 16,
        fontFamily: "'JetBrains Mono', monospace",
      }}>Paste text or a URL — JARVIS reads it aloud</p>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {[['text', 'PASTE TEXT'], ['url', 'FROM URL'], ['scan', 'SCAN PAGES']].map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)} style={{
            flex: 1, padding: '8px 0',
            background: mode === m ? colors.primaryDim : 'transparent',
            color: mode === m ? colors.primary : colors.textMuted,
            border: 'none', borderBottom: mode === m ? `1px solid ${colors.primary}` : '1px solid transparent',
            fontSize: 10, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>{label}</button>
        ))}
      </div>

      {/* Input */}
      {mode === 'text' && (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste any text here — articles, emails, documents, notes..."
          style={{
            width: '100%', minHeight: 120, padding: 12,
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            color: colors.text, fontSize: 13, fontFamily: "'Exo 2', sans-serif",
            resize: 'vertical', lineHeight: 1.6,
          }}
        />
      )}

      {mode === 'url' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://..."
            style={{
              flex: 1, padding: '10px 12px',
              background: colors.surface, border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 13, fontFamily: "'Exo 2', sans-serif",
            }}
          />
          <button onClick={fetchUrl} disabled={loading || !url.trim()} style={{
            padding: '10px 16px', background: colors.primaryDim,
            border: `1px solid ${colors.primary}`, color: colors.primary,
            fontSize: 10, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>{loading ? '...' : 'FETCH'}</button>
        </div>
      )}

      {mode === 'scan' && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={handlePhotos}
            style={{ display: 'none' }}
          />

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={() => fileInputRef.current?.click()} disabled={scanning} style={{
              flex: 1, padding: 14,
              background: 'transparent', border: `1px dashed ${colors.border}`,
              color: colors.textSecondary, fontSize: 10, cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
            }}>
              TAKE PHOTO / SELECT IMAGES
            </button>
          </div>

          {/* Page thumbnails */}
          {pages.length > 0 && (
            <div>
              <div style={{
                color: colors.textMuted, fontSize: 9, marginBottom: 6,
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
              }}>{pages.length} PAGE{pages.length > 1 ? 'S' : ''} QUEUED</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {pages.map((file, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img
                      src={URL.createObjectURL(file)}
                      style={{ width: 60, height: 80, objectFit: 'cover', border: `1px solid ${colors.border}` }}
                    />
                    <button onClick={() => removePage(i)} style={{
                      position: 'absolute', top: -6, right: -6,
                      width: 18, height: 18, borderRadius: '50%',
                      background: colors.danger, border: 'none',
                      color: '#fff', fontSize: 10, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>x</button>
                    <div style={{
                      textAlign: 'center', color: colors.textMuted, fontSize: 8,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>P{i + 1}</div>
                  </div>
                ))}
              </div>

              <button onClick={processPages} disabled={scanning} style={{
                width: '100%', padding: 12,
                background: scanning ? 'transparent' : colors.primaryDim,
                border: `1px solid ${scanning ? colors.border : colors.primary}`,
                color: scanning ? colors.textMuted : colors.primary,
                fontSize: 11, cursor: scanning ? 'wait' : 'pointer',
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2,
              }}>{scanning ? 'EXTRACTING TEXT...' : `EXTRACT TEXT FROM ${pages.length} PAGE${pages.length > 1 ? 'S' : ''}`}</button>
            </div>
          )}

          {scanProgress && (
            <div style={{ color: colors.success, fontSize: 10, marginTop: 8, fontFamily: "'JetBrains Mono', monospace" }}>
              {scanProgress}
            </div>
          )}

          <div style={{
            color: colors.textMuted, fontSize: 8, marginTop: 8,
            fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6,
          }}>
            Take photos of book pages in order. JARVIS uses AI vision to extract the text. Then hit play to listen.
          </div>
        </div>
      )}

      {error && (
        <div style={{ color: colors.danger, fontSize: 10, marginTop: 8, fontFamily: "'JetBrains Mono', monospace" }}>
          {error}
        </div>
      )}

      {/* Word count */}
      {text && (
        <div style={{
          color: colors.textMuted, fontSize: 9, marginTop: 6,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {text.split(/\s+/).length} words // ~{Math.ceil(text.split(/\s+/).length / (150 * speed))} min at {speed}x
        </div>
      )}

      {/* Progress bar */}
      {playing && (
        <div style={{ marginTop: 12 }}>
          <div style={{
            width: '100%', height: 3,
            background: colors.border,
          }}>
            <div style={{
              width: `${progress}%`, height: '100%',
              background: colors.primary,
              boxShadow: `0 0 8px ${colors.primary}`,
              transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', marginTop: 4,
            color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
          }}>
            <span>CHUNK {currentChunk + 1}/{totalChunks}</span>
            <span>{progress}%</span>
          </div>
        </div>
      )}

      {/* Playback controls */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 12, marginTop: 16, padding: 16,
        border: `1px solid ${colors.border}`, background: colors.surfaceLight,
      }}>
        <button onClick={skipBack} disabled={!playing} style={controlBtn}>
          <span style={{ fontSize: 16 }}>&#9664;&#9664;</span>
        </button>

        {!playing ? (
          <button onClick={() => speak(0)} disabled={!text.trim()} style={{
            ...controlBtn,
            width: 56, height: 56,
            background: text.trim() ? colors.primaryDim : 'transparent',
            border: `1px solid ${text.trim() ? colors.primary : colors.border}`,
            color: text.trim() ? colors.primary : colors.textMuted,
          }}>
            <span style={{ fontSize: 22, marginLeft: 3 }}>&#9654;</span>
          </button>
        ) : paused ? (
          <button onClick={resume} style={{
            ...controlBtn, width: 56, height: 56,
            background: colors.primaryDim, border: `1px solid ${colors.primary}`, color: colors.primary,
          }}>
            <span style={{ fontSize: 22, marginLeft: 3 }}>&#9654;</span>
          </button>
        ) : (
          <button onClick={pause} style={{
            ...controlBtn, width: 56, height: 56,
            background: colors.primaryDim, border: `1px solid ${colors.primary}`, color: colors.primary,
          }}>
            <span style={{ fontSize: 18 }}>&#9646;&#9646;</span>
          </button>
        )}

        <button onClick={skipForward} disabled={!playing} style={controlBtn}>
          <span style={{ fontSize: 16 }}>&#9654;&#9654;</span>
        </button>

        <button onClick={stop} disabled={!playing} style={controlBtn}>
          <span style={{ fontSize: 16 }}>&#9632;</span>
        </button>

        <button onClick={changeSpeed} style={{
          ...controlBtn, width: 'auto', padding: '0 12px',
          fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
        }}>
          {speed}x
        </button>
      </div>

      {/* Voice selector */}
      {voices.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <label style={{
            color: colors.textMuted, fontSize: 9, display: 'block', marginBottom: 4,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>VOICE</label>
          <select
            value={selectedVoice || ''}
            onChange={e => setSelectedVoice(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px',
              background: colors.surface, border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 12, fontFamily: "'Exo 2', sans-serif",
              appearance: 'none',
            }}
          >
            {voices.map(v => (
              <option key={v.name} value={v.name}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Currently reading text preview */}
      {playing && chunksRef.current[currentChunk] && (
        <div style={{
          marginTop: 16, padding: 14,
          border: `1px solid ${colors.border}`, background: colors.surfaceLight,
        }}>
          <div style={{
            color: colors.textMuted, fontSize: 9, marginBottom: 6,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>NOW READING</div>
          <p style={{
            color: colors.text, fontSize: 14, lineHeight: 1.7,
            fontFamily: "'Exo 2', sans-serif",
          }}>{chunksRef.current[currentChunk]}</p>
        </div>
      )}
    </div>
  )
}

const controlBtn = {
  width: 42, height: 42,
  background: 'transparent',
  border: `1px solid ${colors.border}`,
  color: colors.textSecondary,
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: "'JetBrains Mono', monospace",
  transition: 'all 0.15s ease',
}
