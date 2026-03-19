import { useState, useRef, useEffect } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

export default function Scanner({ user, addMemory }) {
  const [scannedDocs, setScannedDocs] = useState([])
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState(null)
  const [textInput, setTextInput] = useState('')
  const [mode, setMode] = useState('text') // text, upload, camera
  const [addedItems, setAddedItems] = useState({}) // track which items have been added
  const fileRef = useRef(null)

  useEffect(() => {
    db.scanner.list().then(setScannedDocs).catch(() => setScannedDocs(loadState('scannedDocs', [])))
  }, [])

  const saveDoc = async (doc) => {
    const updated = [doc, ...scannedDocs]
    setScannedDocs(updated)
    try { await db.scanner.save(doc) } catch { saveState('scannedDocs', updated) }
  }

  // Real AI-powered scan
  const scanText = async (text, source) => {
    if (!text.trim()) return
    setScanning(true)
    setResult(null)
    try {
      const extraction = await db.ai.scan(text, source)
      const doc = {
        ...extraction,
        id: Date.now(),
        scannedAt: new Date().toISOString(),
        source: source || 'text input',
      }
      await saveDoc(doc)
      setResult(doc)
      addMemory(`Scanned ${extraction.type || 'document'}: found ${extraction.items?.length || 0} items`)
    } catch (err) {
      setResult({ type: 'Error', items: [{ kind: 'info', title: 'Scan failed', detail: err.message }] })
    }
    setScanning(false)
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Read file as text (works for .txt, .csv, .json, etc.)
    try {
      const text = await file.text()
      if (text.trim()) {
        scanText(text.slice(0, 10000), file.name) // limit to 10k chars
      }
    } catch {
      // For non-text files, note the limitation
      setResult({ type: 'Error', items: [{ kind: 'info', title: 'Unsupported file type', detail: 'Currently supports text-based files. Image/PDF OCR coming soon.' }] })
    }
  }

  const handleCamera = async () => {
    // Use device camera to capture image, then extract text
    // For now, this opens camera and reads any text overlay
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      // Create a quick capture
      const video = document.createElement('video')
      video.srcObject = stream
      await video.play()

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d').drawImage(video, 0, 0)
      stream.getTracks().forEach(t => t.stop())

      setResult({ type: 'Info', items: [{ kind: 'info', title: 'Camera capture', detail: 'Image captured. OCR processing requires additional setup. Use text paste for now.' }] })
    } catch (err) {
      setResult({ type: 'Error', items: [{ kind: 'info', title: 'Camera access denied', detail: err.message }] })
    }
  }

  // Add extracted item to the appropriate app section
  const addItem = async (item, docIndex) => {
    const key = `${docIndex}-${item.title || item.kind}`
    if (addedItems[key]) return

    try {
      if (item.kind === 'event' && item.title) {
        await db.events.create({ title: item.title, date: item.date || '', time: item.time || '', location: item.location || '' })
      } else if (item.kind === 'task' && item.title) {
        await db.tasks.create({ title: item.title, priority: item.priority || 'medium' })
      } else if ((item.kind === 'reminder' || item.kind === 'deadline') && item.title) {
        await db.reminders.create({ text: item.title, date: item.date || new Date().toISOString().split('T')[0], time: '09:00' })
      } else if (item.kind === 'grocery' && item.items?.length) {
        for (const name of item.items) {
          await db.grocery.add({ name })
        }
      }
      setAddedItems(prev => ({ ...prev, [key]: true }))
      addMemory(`Added ${item.kind}: ${item.title || item.items?.join(', ')}`)
    } catch (err) {
      console.error('Failed to add item:', err)
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{
        color: colors.primary, fontSize: 11, fontWeight: 600, marginBottom: 4,
        fontFamily: "'JetBrains Mono', monospace", letterSpacing: 3,
      }}>Document Scanner</h2>
      <p style={{
        color: colors.textMuted, fontSize: 11, marginBottom: 20,
        fontFamily: "'JetBrains Mono', monospace",
      }}>AI-powered extraction. Paste text, upload files, or capture.</p>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {[['text', 'PASTE TEXT'], ['upload', 'UPLOAD FILE'], ['camera', 'CAMERA']].map(([m, label]) => (
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

      {/* Input area */}
      {mode === 'text' && (
        <div>
          <textarea
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            placeholder="Paste an email, flyer, recipe, message, or any text here..."
            style={{
              width: '100%', minHeight: 120, padding: 12,
              background: 'rgba(10, 18, 32, 0.8)',
              border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 13, fontFamily: "'Exo 2', sans-serif",
              resize: 'vertical',
            }}
          />
          <button onClick={() => scanText(textInput, 'text paste')} disabled={!textInput.trim() || scanning} style={{
            width: '100%', padding: 10, marginTop: 8,
            background: textInput.trim() && !scanning ? colors.primaryDim : 'transparent',
            border: `1px solid ${textInput.trim() && !scanning ? colors.primary : colors.border}`,
            color: textInput.trim() && !scanning ? colors.primary : colors.textMuted,
            fontSize: 11, cursor: textInput.trim() && !scanning ? 'pointer' : 'default',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2,
          }}>{scanning ? 'ANALYZING...' : 'SCAN & EXTRACT'}</button>
        </div>
      )}

      {mode === 'upload' && (
        <div>
          <input ref={fileRef} type="file" accept=".txt,.csv,.json,.md,.html,.xml,.eml" onChange={handleFile} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} disabled={scanning} style={{
            width: '100%', padding: 24,
            background: 'transparent',
            border: `1px dashed ${colors.border}`,
            color: colors.textMuted, fontSize: 11, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>{scanning ? 'ANALYZING...' : 'TAP TO SELECT FILE'}</button>
          <p style={{ color: colors.textMuted, fontSize: 9, marginTop: 6, fontFamily: "'JetBrains Mono', monospace" }}>
            Supports: .txt, .csv, .json, .md, .html, .xml, .eml
          </p>
        </div>
      )}

      {mode === 'camera' && (
        <button onClick={handleCamera} disabled={scanning} style={{
          width: '100%', padding: 24,
          background: 'transparent',
          border: `1px dashed ${colors.border}`,
          color: colors.textMuted, fontSize: 11, cursor: 'pointer',
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
        }}>{scanning ? 'ANALYZING...' : 'OPEN CAMERA'}</button>
      )}

      {/* Scanning indicator */}
      {scanning && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{
            width: 40, height: 40, margin: '0 auto 12px',
            border: `2px solid ${colors.primary}`,
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <div style={{ color: colors.primary, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2 }}>
            AI PROCESSING
          </div>
        </div>
      )}

      {/* Results */}
      {result && !scanning && (
        <div style={{ marginTop: 16, border: `1px solid ${colors.border}`, background: 'rgba(15, 25, 45, 0.5)' }}>
          <div style={{
            padding: '8px 14px', borderBottom: `1px solid ${colors.border}`,
            background: colors.primaryDim, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ color: colors.primary, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>
              {result.type || 'EXTRACTED DATA'}
            </span>
            <span style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
              {result.items?.length || 0} items
            </span>
          </div>
          {result.items?.map((item, i) => {
            const key = `${result.id || 0}-${item.title || item.kind}`
            const added = addedItems[key]
            const canAdd = ['event', 'task', 'reminder', 'deadline', 'grocery'].includes(item.kind)
            return (
              <div key={i} style={{
                padding: '10px 14px', borderBottom: `1px solid ${colors.border}`,
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <span style={{
                  fontSize: 9, padding: '2px 6px',
                  background: colors.primaryDim,
                  border: `1px solid ${colors.border}`,
                  color: colors.primary,
                  fontFamily: "'JetBrains Mono', monospace",
                  textTransform: 'uppercase', whiteSpace: 'nowrap',
                }}>{item.kind}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: colors.text, fontSize: 12, fontFamily: "'Exo 2', sans-serif" }}>
                    {item.title || item.detail || item.items?.join(', ')}
                  </div>
                  {(item.date || item.time || item.location) && (
                    <div style={{ color: colors.textMuted, fontSize: 10, marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
                      {[item.date, item.time, item.location].filter(Boolean).join(' / ')}
                    </div>
                  )}
                </div>
                {canAdd && (
                  <button onClick={() => addItem(item, result.id || 0)} disabled={added} style={{
                    padding: '4px 10px',
                    background: added ? colors.primaryDim : 'transparent',
                    border: `1px solid ${added ? colors.primary : colors.border}`,
                    color: added ? colors.primary : colors.textMuted,
                    fontSize: 9, cursor: added ? 'default' : 'pointer',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>{added ? 'ADDED' : 'ADD'}</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* History */}
      {scannedDocs.length > 0 && !result && (
        <div style={{ marginTop: 20 }}>
          <div style={{
            color: colors.textMuted, fontSize: 9, marginBottom: 8,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2,
          }}>SCAN HISTORY</div>
          {scannedDocs.slice(0, 10).map((doc, i) => (
            <button key={doc.id || i} onClick={() => setResult(doc)} style={{
              width: '100%', padding: '10px 14px', marginBottom: 4,
              background: 'transparent',
              border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 12, cursor: 'pointer',
              fontFamily: "'Exo 2', sans-serif",
              textAlign: 'left', display: 'flex', justifyContent: 'space-between',
            }}>
              <span>{doc.type || doc.doc_type || 'Document'} — {doc.items?.length || 0} items</span>
              <span style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
                {doc.source || ''}
              </span>
            </button>
          ))}
        </div>
      )}

      {result && (
        <button onClick={() => { setResult(null); setTextInput('') }} style={{
          width: '100%', padding: 8, marginTop: 12,
          background: 'transparent', border: `1px solid ${colors.border}`,
          color: colors.textMuted, fontSize: 10, cursor: 'pointer',
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
        }}>NEW SCAN</button>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
