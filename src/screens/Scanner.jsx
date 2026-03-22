import { useState, useRef, useEffect, useCallback } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

// --- Scan type icons (SVG inline) ---
const ICONS = {
  document: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  receipt: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2z" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="12" y2="16" />
    </svg>
  ),
  card: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <circle cx="8" cy="10" r="2" />
      <path d="M16 8h2M16 12h2M6 16h12" />
    </svg>
  ),
}

const SCAN_MODES = [
  { key: 'document', label: 'DOCUMENT' },
  { key: 'receipt', label: 'RECEIPT' },
  { key: 'card', label: 'BIZ CARD' },
]

const INPUT_MODES = [
  { key: 'text', label: 'PASTE TEXT' },
  { key: 'upload', label: 'UPLOAD FILE' },
  { key: 'camera', label: 'CAMERA' },
]

// --- Helper: convert canvas to File ---
function canvasToFile(canvas, filename = 'capture.png') {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(new File([blob], filename, { type: 'image/png' }))
    }, 'image/png')
  })
}

// --- Helper: parse receipt from AI text ---
function parseReceipt(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  let merchant = '', date = '', total = ''
  const items = []

  for (const line of lines) {
    const merchantMatch = line.match(/merchant[:\s]*(.+)/i) || line.match(/store[:\s]*(.+)/i) || line.match(/restaurant[:\s]*(.+)/i)
    if (merchantMatch && !merchant) { merchant = merchantMatch[1].trim(); continue }

    const dateMatch = line.match(/date[:\s]*(.+)/i)
    if (dateMatch && !date) { date = dateMatch[1].trim(); continue }

    const totalMatch = line.match(/total[:\s]*\$?([\d,.]+)/i) || line.match(/grand\s*total[:\s]*\$?([\d,.]+)/i)
    if (totalMatch && !total) { total = totalMatch[1].trim(); continue }

    const itemMatch = line.match(/^[-*]?\s*(.+?)\s+\$?([\d,.]+)\s*$/)
    if (itemMatch) {
      items.push({ name: itemMatch[1].trim(), price: itemMatch[2].trim() })
    }
  }

  // If no structured parse, try harder
  if (!merchant && lines.length > 0) merchant = lines[0]

  return { merchant, date, total, items }
}

// --- Helper: parse business card from AI text ---
function parseBusinessCard(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  let name = '', company = '', phone = '', email = '', title = ''

  for (const line of lines) {
    const nameMatch = line.match(/name[:\s]*(.+)/i)
    if (nameMatch && !name) { name = nameMatch[1].trim(); continue }

    const companyMatch = line.match(/company[:\s]*(.+)/i) || line.match(/organization[:\s]*(.+)/i) || line.match(/org[:\s]*(.+)/i)
    if (companyMatch && !company) { company = companyMatch[1].trim(); continue }

    const phoneMatch = line.match(/phone[:\s]*(.+)/i) || line.match(/tel[:\s]*(.+)/i) || line.match(/mobile[:\s]*(.+)/i)
    if (phoneMatch && !phone) { phone = phoneMatch[1].trim(); continue }

    const emailMatch = line.match(/email[:\s]*(.+)/i) || line.match(/e-mail[:\s]*(.+)/i)
    if (emailMatch && !email) { email = emailMatch[1].trim(); continue }

    const titleMatch = line.match(/title[:\s]*(.+)/i) || line.match(/position[:\s]*(.+)/i) || line.match(/role[:\s]*(.+)/i)
    if (titleMatch && !title) { title = titleMatch[1].trim(); continue }

    // Fallback detection
    if (!email && line.match(/[\w.-]+@[\w.-]+\.\w+/)) { email = line.match(/([\w.-]+@[\w.-]+\.\w+)/)[1]; continue }
    if (!phone && line.match(/[\d()+-]{7,}/)) { phone = line.match(/([\d()+-\s]{7,})/)[1].trim(); continue }
  }

  if (!name && lines.length > 0) name = lines[0]

  return { name, company, phone, email, title }
}

export default function Scanner({ user, addMemory }) {
  const [scannedDocs, setScannedDocs] = useState([])
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState('')
  const [result, setResult] = useState(null)
  const [textInput, setTextInput] = useState('')
  const [inputMode, setInputMode] = useState('text') // text, upload, camera
  const [scanType, setScanType] = useState('document') // document, receipt, card
  const [addedItems, setAddedItems] = useState({})
  const [historySearch, setHistorySearch] = useState('')
  const [editingResult, setEditingResult] = useState(null) // editable form state
  const [showCamera, setShowCamera] = useState(false)
  const fileRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    db.scanner.list().then(setScannedDocs).catch(() => setScannedDocs(loadState('scannedDocs', [])))
  }, [])

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  const saveDoc = async (doc) => {
    const updated = [doc, ...scannedDocs]
    setScannedDocs(updated)
    try { await db.scanner.save(doc) } catch { saveState('scannedDocs', updated) }
  }

  // --- OCR: send image file to db.ai.ocr ---
  const ocrImage = async (file) => {
    setScanProgress('RUNNING OCR ON IMAGE...')
    const ocrResult = await db.ai.ocr([file])
    // ocrResult should contain extracted text
    const text = typeof ocrResult === 'string' ? ocrResult : (ocrResult?.text || ocrResult?.result || JSON.stringify(ocrResult))
    return text
  }

  // --- Core scan: text -> AI extraction ---
  const scanText = async (text, source) => {
    if (!text.trim()) return
    setScanning(true)
    setResult(null)
    setEditingResult(null)
    setScanProgress('INITIALIZING SCAN PROTOCOL...')

    try {
      setScanProgress('AI NEURAL NETWORK ANALYZING...')
      const extraction = await db.ai.scan(text, source)
      const doc = {
        ...extraction,
        id: Date.now(),
        scannedAt: new Date().toISOString(),
        source: source || 'text input',
        scanType,
      }
      await saveDoc(doc)

      // For receipt/card modes, parse into structured data
      if (scanType === 'receipt') {
        const receiptData = parseReceipt(text)
        doc.receiptData = receiptData
      } else if (scanType === 'card') {
        const cardData = parseBusinessCard(text)
        doc.cardData = cardData
      }

      // Show editable form before finalizing
      setEditingResult(doc)
      addMemory(`Scanned ${scanType}: found ${extraction.items?.length || 0} items via ${source}`)
    } catch (err) {
      setResult({ type: 'Error', scanType, items: [{ kind: 'info', title: 'Scan failed', detail: err.message }] })
    }
    setScanning(false)
    setScanProgress('')
  }

  // --- Handle file upload (text + image) ---
  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file.name)

    if (isImage) {
      // Image file -> OCR
      setScanning(true)
      setResult(null)
      setEditingResult(null)
      setScanProgress('PROCESSING IMAGE FILE...')
      try {
        const ocrText = await ocrImage(file)
        if (ocrText && ocrText.trim()) {
          await scanText(ocrText.slice(0, 10000), file.name)
        } else {
          setResult({ type: 'Error', scanType, items: [{ kind: 'info', title: 'OCR returned empty', detail: 'No text could be extracted from this image.' }] })
          setScanning(false)
          setScanProgress('')
        }
      } catch (err) {
        setResult({ type: 'Error', scanType, items: [{ kind: 'info', title: 'Image OCR failed', detail: err.message }] })
        setScanning(false)
        setScanProgress('')
      }
    } else {
      // Text-based file
      try {
        const text = await file.text()
        if (text.trim()) {
          scanText(text.slice(0, 10000), file.name)
        }
      } catch {
        setResult({ type: 'Error', scanType, items: [{ kind: 'info', title: 'Unsupported file type', detail: 'Could not read this file. Try a text or image file.' }] })
      }
    }
    // Reset file input so same file can be re-selected
    if (fileRef.current) fileRef.current.value = ''
  }

  // --- Camera: open stream ---
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      setShowCamera(true)
      // Attach to video element after render
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }
      }, 100)
    } catch (err) {
      setResult({ type: 'Error', scanType, items: [{ kind: 'info', title: 'Camera access denied', detail: err.message }] })
    }
  }

  // --- Camera: capture frame and OCR ---
  const capturePhoto = async () => {
    if (!videoRef.current) return

    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    canvas.getContext('2d').drawImage(video, 0, 0)

    // Stop camera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setShowCamera(false)

    // Convert to File and OCR
    setScanning(true)
    setResult(null)
    setEditingResult(null)
    setScanProgress('CONVERTING CAPTURE TO DIGITAL FORMAT...')
    try {
      const file = await canvasToFile(canvas, 'camera_capture.png')
      setScanProgress('RUNNING OCR ON CAPTURED IMAGE...')
      const ocrText = await ocrImage(file)
      if (ocrText && ocrText.trim()) {
        await scanText(ocrText.slice(0, 10000), 'camera capture')
      } else {
        setResult({ type: 'Error', scanType, items: [{ kind: 'info', title: 'OCR returned empty', detail: 'No text detected in captured image. Ensure good lighting and clear text.' }] })
        setScanning(false)
        setScanProgress('')
      }
    } catch (err) {
      setResult({ type: 'Error', scanType, items: [{ kind: 'info', title: 'Camera OCR failed', detail: err.message }] })
      setScanning(false)
      setScanProgress('')
    }
  }

  // --- Cancel camera ---
  const cancelCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setShowCamera(false)
  }

  // --- Confirm edited result ---
  const confirmResult = () => {
    if (!editingResult) return
    setResult(editingResult)
    setEditingResult(null)
  }

  // --- Add extracted item to the appropriate app section ---
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

  // --- Save contact from business card ---
  const saveContact = (cardData) => {
    try {
      const contacts = loadState('contacts', [])
      const contact = {
        id: Date.now(),
        ...cardData,
        addedAt: new Date().toISOString(),
      }
      contacts.unshift(contact)
      saveState('contacts', contacts)
      addMemory(`Saved contact: ${cardData.name} from ${cardData.company || 'unknown company'}`)
      return true
    } catch (err) {
      console.error('Failed to save contact:', err)
      return false
    }
  }

  // --- Update editable field ---
  const updateEditField = (path, value) => {
    setEditingResult(prev => {
      const next = { ...prev }
      if (path.startsWith('receiptData.')) {
        const field = path.replace('receiptData.', '')
        next.receiptData = { ...next.receiptData, [field]: value }
      } else if (path.startsWith('cardData.')) {
        const field = path.replace('cardData.', '')
        next.cardData = { ...next.cardData, [field]: value }
      } else if (path.startsWith('items.')) {
        const parts = path.split('.')
        const idx = parseInt(parts[1])
        const field = parts[2]
        const items = [...(next.items || [])]
        items[idx] = { ...items[idx], [field]: value }
        next.items = items
      } else {
        next[path] = value
      }
      return next
    })
  }

  // --- Filtered history ---
  const filteredHistory = scannedDocs.filter(doc => {
    if (!historySearch.trim()) return true
    const search = historySearch.toLowerCase()
    return (
      (doc.type || '').toLowerCase().includes(search) ||
      (doc.source || '').toLowerCase().includes(search) ||
      (doc.scanType || '').toLowerCase().includes(search) ||
      (doc.items || []).some(item =>
        (item.title || '').toLowerCase().includes(search) ||
        (item.detail || '').toLowerCase().includes(search)
      )
    )
  })

  // =================== RENDER ===================

  const monoFont = "'JetBrains Mono', monospace"
  const bodyFont = "'Exo 2', sans-serif"

  // --- Scanning overlay with JARVIS vibes ---
  const renderScanningOverlay = () => scanning && (
    <div style={{ textAlign: 'center', padding: 30 }}>
      <div style={{ position: 'relative', width: 60, height: 60, margin: '0 auto 16px' }}>
        <div style={{
          position: 'absolute', inset: 0,
          border: `2px solid ${colors.primary}`,
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 6,
          border: `2px solid ${colors.secondary}`,
          borderBottomColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite reverse',
        }} />
        <div style={{
          position: 'absolute', inset: 12,
          border: `2px solid ${colors.primary}`,
          borderLeftColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 1.3s linear infinite',
        }} />
      </div>
      <div style={{
        color: colors.primary, fontSize: 11, fontFamily: monoFont, letterSpacing: 1,
        textShadow: `0 0 10px ${colors.primary}`,
      }}>
        {scanProgress || 'AI PROCESSING'}
      </div>
      <div style={{
        marginTop: 8, height: 2, background: colors.primaryDim, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: '40%', background: colors.primary,
          animation: 'scanBar 1.5s ease-in-out infinite',
        }} />
      </div>
    </div>
  )

  // --- Camera view ---
  const renderCameraView = () => showCamera && (
    <div style={{
      position: 'relative', marginBottom: 16,
      border: `1px solid ${colors.primary}`, overflow: 'hidden',
      boxShadow: colors.glow,
    }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: '100%', display: 'block', maxHeight: 300 }}
      />
      {/* Scan overlay corners */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {/* Corner brackets */}
        {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(corner => {
          const isTop = corner.includes('top')
          const isLeft = corner.includes('left')
          return (
            <div key={corner} style={{
              position: 'absolute',
              [isTop ? 'top' : 'bottom']: 12,
              [isLeft ? 'left' : 'right']: 12,
              width: 24, height: 24,
              borderTop: isTop ? `2px solid ${colors.primary}` : 'none',
              borderBottom: !isTop ? `2px solid ${colors.primary}` : 'none',
              borderLeft: isLeft ? `2px solid ${colors.primary}` : 'none',
              borderRight: !isLeft ? `2px solid ${colors.primary}` : 'none',
            }} />
          )
        })}
        {/* Scan line animation */}
        <div style={{
          position: 'absolute', left: 12, right: 12,
          height: 2, background: colors.primary,
          opacity: 0.6, animation: 'scanLine 2s ease-in-out infinite',
        }} />
      </div>
      <div style={{ display: 'flex', gap: 0 }}>
        <button onClick={capturePhoto} style={{
          flex: 1, padding: '12px 16px', minHeight: 44,
          background: colors.primaryDim,
          border: `1px solid ${colors.primary}`, borderTop: 'none',
          color: colors.primary, fontSize: 13, cursor: 'pointer',
          fontFamily: monoFont, letterSpacing: 1, borderRadius: 8,
        }}>CAPTURE</button>
        <button onClick={cancelCamera} style={{
          flex: 1, padding: '12px 16px', minHeight: 44,
          background: 'transparent',
          border: `1px solid ${colors.border}`, borderTop: 'none',
          color: colors.textMuted, fontSize: 13, cursor: 'pointer',
          fontFamily: monoFont, letterSpacing: 1, borderRadius: 8,
        }}>CANCEL</button>
      </div>
    </div>
  )

  // --- Receipt card ---
  const renderReceiptCard = (data) => (
    <div style={{
      border: `1px solid ${colors.secondary}`,
      background: `linear-gradient(180deg, rgba(240,165,0,0.08) 0%, transparent 100%)`,
      marginTop: 12,
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${colors.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ color: colors.secondary, fontSize: 13, fontFamily: monoFont, letterSpacing: 1 }}>
          RECEIPT SCAN
        </span>
        <span style={{ color: colors.textMuted, fontSize: 11, fontFamily: monoFont }}>
          {data.date || 'No date'}
        </span>
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ color: colors.text, fontSize: 14, fontFamily: bodyFont, fontWeight: 600, marginBottom: 8 }}>
          {data.merchant || 'Unknown Merchant'}
        </div>
        {data.items?.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {data.items.map((item, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', padding: '3px 0',
                borderBottom: `1px solid ${colors.border}`,
              }}>
                <span style={{ color: colors.textSecondary, fontSize: 11, fontFamily: bodyFont }}>{item.name}</span>
                <span style={{ color: colors.text, fontSize: 11, fontFamily: monoFont }}>${item.price}</span>
              </div>
            ))}
          </div>
        )}
        {data.total && (
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '8px 0', borderTop: `2px solid ${colors.secondary}`,
          }}>
            <span style={{ color: colors.secondary, fontSize: 12, fontFamily: monoFont, fontWeight: 700, letterSpacing: 1 }}>TOTAL</span>
            <span style={{ color: colors.secondary, fontSize: 14, fontFamily: monoFont, fontWeight: 700 }}>${data.total}</span>
          </div>
        )}
      </div>
    </div>
  )

  // --- Business card ---
  const ContactCard = ({ data }) => {
    const [saved, setSaved] = useState(false)

    return (
      <div style={{
        border: `1px solid ${colors.primary}`,
        background: `linear-gradient(135deg, rgba(0,212,255,0.08) 0%, transparent 100%)`,
        marginTop: 12,
      }}>
        <div style={{
          padding: '10px 14px', borderBottom: `1px solid ${colors.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: colors.primary, fontSize: 13, fontFamily: monoFont, letterSpacing: 1 }}>
            BUSINESS CARD SCAN
          </span>
          <span style={{ color: colors.textMuted, fontSize: 14 }}>{ICONS.card}</span>
        </div>
        <div style={{ padding: '14px 14px' }}>
          <div style={{ color: colors.text, fontSize: 16, fontFamily: bodyFont, fontWeight: 600 }}>
            {data.name || 'Unknown'}
          </div>
          {data.title && (
            <div style={{ color: colors.primary, fontSize: 11, fontFamily: bodyFont, marginTop: 2 }}>
              {data.title}
            </div>
          )}
          {data.company && (
            <div style={{ color: colors.textSecondary, fontSize: 12, fontFamily: bodyFont, marginTop: 2 }}>
              {data.company}
            </div>
          )}
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.email && (
              <div style={{ color: colors.textSecondary, fontSize: 11, fontFamily: monoFont }}>
                <span style={{ color: colors.textMuted, marginRight: 8 }}>EMAIL</span>{data.email}
              </div>
            )}
            {data.phone && (
              <div style={{ color: colors.textSecondary, fontSize: 11, fontFamily: monoFont }}>
                <span style={{ color: colors.textMuted, marginRight: 8 }}>PHONE</span>{data.phone}
              </div>
            )}
          </div>
          <button
            onClick={() => {
              if (saveContact(data)) setSaved(true)
            }}
            disabled={saved}
            style={{
              width: '100%', marginTop: 12, padding: '12px 16px', minHeight: 44,
              background: saved ? colors.primaryDim : 'transparent',
              border: `1px solid ${saved ? colors.success : colors.primary}`,
              color: saved ? colors.success : colors.primary,
              fontSize: 13, cursor: saved ? 'default' : 'pointer',
              fontFamily: monoFont, letterSpacing: 1, borderRadius: 8,
            }}
          >
            {saved ? 'CONTACT SAVED' : 'ADD TO CONTACTS'}
          </button>
        </div>
      </div>
    )
  }

  // --- Editable form for results before confirm ---
  const renderEditableForm = () => {
    if (!editingResult) return null
    const er = editingResult

    return (
      <div style={{
        marginTop: 16, border: `1px solid ${colors.primary}`,
        background: colors.surfaceLight, boxShadow: colors.glow,
      }}>
        <div style={{
          padding: '8px 14px', borderBottom: `1px solid ${colors.border}`,
          background: colors.primaryDim, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: colors.primary, fontSize: 13, fontFamily: monoFont, letterSpacing: 1 }}>
            REVIEW EXTRACTED DATA
          </span>
          <span style={{ color: colors.textMuted, fontSize: 11, fontFamily: monoFont }}>
            Edit before confirming
          </span>
        </div>

        {/* Receipt editable fields */}
        {er.scanType === 'receipt' && er.receiptData && (
          <div style={{ padding: '12px 14px' }}>
            {[
              { label: 'MERCHANT', field: 'receiptData.merchant', value: er.receiptData.merchant },
              { label: 'DATE', field: 'receiptData.date', value: er.receiptData.date },
              { label: 'TOTAL', field: 'receiptData.total', value: er.receiptData.total },
            ].map(f => (
              <div key={f.field} style={{ marginBottom: 8 }}>
                <label style={{ color: colors.textMuted, fontSize: 11, fontFamily: monoFont, letterSpacing: 1, display: 'block', marginBottom: 2 }}>
                  {f.label}
                </label>
                <input
                  value={f.value || ''}
                  onChange={e => updateEditField(f.field, e.target.value)}
                  style={{
                    width: '100%', padding: '6px 8px', boxSizing: 'border-box',
                    background: colors.surface, border: `1px solid ${colors.border}`,
                    color: colors.text, fontSize: 12, fontFamily: bodyFont,
                  }}
                />
              </div>
            ))}
            <label style={{ color: colors.textMuted, fontSize: 11, fontFamily: monoFont, letterSpacing: 1, display: 'block', marginBottom: 4, marginTop: 8 }}>
              LINE ITEMS
            </label>
            {(er.receiptData.items || []).map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <input
                  value={item.name || ''}
                  onChange={e => {
                    const items = [...(er.receiptData.items || [])]
                    items[i] = { ...items[i], name: e.target.value }
                    updateEditField('receiptData.items', items)
                  }}
                  placeholder="Item name"
                  style={{
                    flex: 1, padding: '4px 6px',
                    background: colors.surface, border: `1px solid ${colors.border}`,
                    color: colors.text, fontSize: 11, fontFamily: bodyFont,
                  }}
                />
                <input
                  value={item.price || ''}
                  onChange={e => {
                    const items = [...(er.receiptData.items || [])]
                    items[i] = { ...items[i], price: e.target.value }
                    updateEditField('receiptData.items', items)
                  }}
                  placeholder="Price"
                  style={{
                    width: 70, padding: '4px 6px',
                    background: colors.surface, border: `1px solid ${colors.border}`,
                    color: colors.text, fontSize: 11, fontFamily: monoFont,
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Business card editable fields */}
        {er.scanType === 'card' && er.cardData && (
          <div style={{ padding: '12px 14px' }}>
            {[
              { label: 'NAME', field: 'cardData.name', value: er.cardData.name },
              { label: 'TITLE', field: 'cardData.title', value: er.cardData.title },
              { label: 'COMPANY', field: 'cardData.company', value: er.cardData.company },
              { label: 'EMAIL', field: 'cardData.email', value: er.cardData.email },
              { label: 'PHONE', field: 'cardData.phone', value: er.cardData.phone },
            ].map(f => (
              <div key={f.field} style={{ marginBottom: 8 }}>
                <label style={{ color: colors.textMuted, fontSize: 11, fontFamily: monoFont, letterSpacing: 1, display: 'block', marginBottom: 2 }}>
                  {f.label}
                </label>
                <input
                  value={f.value || ''}
                  onChange={e => updateEditField(f.field, e.target.value)}
                  style={{
                    width: '100%', padding: '6px 8px', boxSizing: 'border-box',
                    background: colors.surface, border: `1px solid ${colors.border}`,
                    color: colors.text, fontSize: 12, fontFamily: bodyFont,
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Document editable items */}
        {er.scanType === 'document' && er.items?.length > 0 && (
          <div style={{ padding: '12px 14px' }}>
            {er.items.map((item, i) => (
              <div key={i} style={{
                padding: '8px 0', borderBottom: `1px solid ${colors.border}`,
              }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                  <select
                    value={item.kind || 'info'}
                    onChange={e => updateEditField(`items.${i}.kind`, e.target.value)}
                    style={{
                      padding: '4px 6px', width: 100,
                      background: colors.surface, border: `1px solid ${colors.border}`,
                      color: colors.primary, fontSize: 10, fontFamily: monoFont,
                    }}
                  >
                    {['event', 'task', 'reminder', 'deadline', 'grocery', 'info'].map(k => (
                      <option key={k} value={k}>{k.toUpperCase()}</option>
                    ))}
                  </select>
                  <input
                    value={item.title || item.detail || ''}
                    onChange={e => updateEditField(`items.${i}.title`, e.target.value)}
                    style={{
                      flex: 1, padding: '4px 6px',
                      background: colors.surface, border: `1px solid ${colors.border}`,
                      color: colors.text, fontSize: 11, fontFamily: bodyFont,
                    }}
                  />
                </div>
                {(item.date || item.time || item.location) && (
                  <div style={{ display: 'flex', gap: 6, paddingLeft: 106 }}>
                    {item.date !== undefined && (
                      <input
                        value={item.date || ''}
                        onChange={e => updateEditField(`items.${i}.date`, e.target.value)}
                        placeholder="Date"
                        style={{
                          flex: 1, padding: '3px 6px',
                          background: colors.surface, border: `1px solid ${colors.border}`,
                          color: colors.textSecondary, fontSize: 10, fontFamily: monoFont,
                        }}
                      />
                    )}
                    {item.time !== undefined && (
                      <input
                        value={item.time || ''}
                        onChange={e => updateEditField(`items.${i}.time`, e.target.value)}
                        placeholder="Time"
                        style={{
                          width: 70, padding: '3px 6px',
                          background: colors.surface, border: `1px solid ${colors.border}`,
                          color: colors.textSecondary, fontSize: 10, fontFamily: monoFont,
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 0 }}>
          <button onClick={confirmResult} style={{
            flex: 1, padding: '12px 16px', minHeight: 44,
            background: colors.primaryDim,
            border: `1px solid ${colors.primary}`,
            color: colors.primary, fontSize: 13, cursor: 'pointer',
            fontFamily: monoFont, letterSpacing: 1, borderRadius: 8,
          }}>CONFIRM DATA</button>
          <button onClick={() => { setEditingResult(null); setResult(null) }} style={{
            flex: 1, padding: '12px 16px', minHeight: 44,
            background: 'transparent',
            border: `1px solid ${colors.border}`,
            color: colors.textMuted, fontSize: 13, cursor: 'pointer',
            fontFamily: monoFont, letterSpacing: 1, borderRadius: 8,
          }}>DISCARD</button>
        </div>
      </div>
    )
  }

  // --- Confirmed result display ---
  const renderResult = () => {
    if (!result || scanning) return null

    return (
      <div style={{ marginTop: 16 }}>
        {/* Receipt card */}
        {result.scanType === 'receipt' && result.receiptData && renderReceiptCard(result.receiptData)}

        {/* Business card */}
        {result.scanType === 'card' && result.cardData && <ContactCard data={result.cardData} />}

        {/* Standard items display */}
        {result.items?.length > 0 && (
          <div style={{
            border: `1px solid ${colors.border}`, background: colors.surfaceLight,
            marginTop: (result.scanType === 'receipt' || result.scanType === 'card') ? 12 : 0,
          }}>
            <div style={{
              padding: '8px 14px', borderBottom: `1px solid ${colors.border}`,
              background: colors.primaryDim, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ color: colors.primary, fontSize: 10, fontFamily: monoFont, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'flex', alignItems: 'center', color: colors.primary }}>
                  {ICONS[result.scanType] || ICONS.document}
                </span>
                {result.type || 'EXTRACTED DATA'}
              </span>
              <span style={{ color: colors.textMuted, fontSize: 11, fontFamily: monoFont }}>
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
                    fontSize: 11, padding: '4px 8px',
                    background: colors.primaryDim,
                    border: `1px solid ${colors.border}`,
                    color: colors.primary,
                    fontFamily: monoFont,
                    textTransform: 'uppercase', whiteSpace: 'nowrap',
                  }}>{item.kind}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: colors.text, fontSize: 12, fontFamily: bodyFont }}>
                      {item.title || item.detail || item.items?.join(', ')}
                    </div>
                    {(item.date || item.time || item.location) && (
                      <div style={{ color: colors.textMuted, fontSize: 10, marginTop: 2, fontFamily: monoFont }}>
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
                      fontSize: 11, cursor: added ? 'default' : 'pointer', minHeight: 44, borderRadius: 8,
                      fontFamily: monoFont,
                    }}>{added ? 'ADDED' : 'ADD'}</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // --- History ---
  const renderHistory = () => {
    if (result || editingResult || scanning) return null
    if (scannedDocs.length === 0) return null

    return (
      <div style={{ marginTop: 20 }}>
        <div style={{
          color: colors.textMuted, fontSize: 13, marginBottom: 8,
          fontFamily: monoFont, letterSpacing: 1,
        }}>SCAN HISTORY</div>

        {/* Search within history */}
        <div style={{ marginBottom: 8, position: 'relative' }}>
          <input
            value={historySearch}
            onChange={e => setHistorySearch(e.target.value)}
            placeholder="Search scan history..."
            style={{
              width: '100%', padding: '6px 10px 6px 28px', boxSizing: 'border-box',
              background: colors.surface, border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 11, fontFamily: monoFont,
            }}
          />
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2"
            style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>

        {filteredHistory.slice(0, 15).map((doc, i) => {
          const st = doc.scanType || 'document'
          return (
            <button key={doc.id || i} onClick={() => setResult(doc)} style={{
              width: '100%', padding: '12px 14px', marginBottom: 6, minHeight: 44, borderRadius: 8,
              background: 'transparent',
              border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 12, cursor: 'pointer',
              fontFamily: bodyFont,
              textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', color: colors.textMuted, flexShrink: 0 }}>
                {ICONS[st] || ICONS.document}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {doc.type || doc.doc_type || st.toUpperCase()} — {doc.items?.length || 0} items
              </span>
              <span style={{ color: colors.textMuted, fontSize: 11, fontFamily: monoFont, flexShrink: 0 }}>
                {doc.source || ''}
              </span>
            </button>
          )
        })}
        {filteredHistory.length === 0 && historySearch && (
          <div style={{ color: colors.textMuted, fontSize: 11, fontFamily: monoFont, padding: 12, textAlign: 'center' }}>
            No scans match "{historySearch}"
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{
        color: colors.primary, fontSize: 14, fontWeight: 600, marginBottom: 4,
        fontFamily: monoFont, letterSpacing: 1,
        textShadow: `0 0 8px ${colors.primary}`,
      }}>J.A.R.V.I.S. Document Scanner</h2>
      <p style={{
        color: colors.textMuted, fontSize: 14, marginBottom: 16,
        fontFamily: monoFont,
      }}>Multi-spectrum analysis. Documents, receipts, and business cards.</p>

      {/* Scan type selector */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 8,
        border: `1px solid ${colors.border}`, overflow: 'hidden',
      }}>
        {SCAN_MODES.map(({ key, label }) => (
          <button key={key} onClick={() => setScanType(key)} style={{
            flex: 1, padding: '12px 0', minHeight: 44,
            background: scanType === key ? colors.primaryDim : 'transparent',
            color: scanType === key ? colors.primary : colors.textMuted,
            border: 'none',
            borderBottom: scanType === key ? `2px solid ${colors.primary}` : '2px solid transparent',
            fontSize: 11, cursor: 'pointer',
            fontFamily: monoFont, letterSpacing: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}>
            <span style={{ display: 'flex', alignItems: 'center' }}>{ICONS[key]}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Input mode tabs */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 16,
        border: `1px solid ${colors.border}`, overflow: 'hidden',
      }}>
        {INPUT_MODES.map(({ key, label }) => (
          <button key={key} onClick={() => setInputMode(key)} style={{
            flex: 1, padding: '12px 0', minHeight: 44,
            background: inputMode === key ? colors.primaryDim : 'transparent',
            color: inputMode === key ? colors.primary : colors.textMuted,
            border: 'none',
            borderBottom: inputMode === key ? `1px solid ${colors.primary}` : '1px solid transparent',
            fontSize: 11, cursor: 'pointer',
            fontFamily: monoFont, letterSpacing: 1,
          }}>{label}</button>
        ))}
      </div>

      {/* Camera view */}
      {renderCameraView()}

      {/* Input area */}
      {inputMode === 'text' && !showCamera && (
        <div>
          <textarea
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            placeholder={
              scanType === 'receipt'
                ? 'Paste receipt text here... (merchant, items, prices, total)'
                : scanType === 'card'
                  ? 'Paste business card text here... (name, company, phone, email)'
                  : 'Paste an email, flyer, recipe, message, or any text here...'
            }
            style={{
              width: '100%', minHeight: 120, padding: 12, boxSizing: 'border-box',
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 14, fontFamily: bodyFont,
              resize: 'vertical', borderRadius: 8,
            }}
          />
          <button onClick={() => scanText(textInput, 'text paste')} disabled={!textInput.trim() || scanning} style={{
            width: '100%', padding: '12px 16px', marginTop: 8, minHeight: 44,
            background: textInput.trim() && !scanning ? colors.primaryDim : 'transparent',
            border: `1px solid ${textInput.trim() && !scanning ? colors.primary : colors.border}`,
            color: textInput.trim() && !scanning ? colors.primary : colors.textMuted,
            fontSize: 13, cursor: textInput.trim() && !scanning ? 'pointer' : 'default',
            fontFamily: monoFont, letterSpacing: 1, borderRadius: 8,
          }}>{scanning ? 'ANALYZING...' : `SCAN ${scanType.toUpperCase()}`}</button>
        </div>
      )}

      {inputMode === 'upload' && !showCamera && (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.csv,.json,.md,.html,.xml,.eml,.jpg,.jpeg,.png,.gif,.bmp,.webp"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
          <button onClick={() => fileRef.current?.click()} disabled={scanning} style={{
            width: '100%', padding: 24, minHeight: 44,
            background: 'transparent',
            border: `1px dashed ${colors.border}`,
            color: colors.textMuted, fontSize: 13, cursor: 'pointer',
            fontFamily: monoFont, letterSpacing: 1, borderRadius: 8,
          }}>
            {scanning ? 'ANALYZING...' : `TAP TO SELECT FILE (${scanType.toUpperCase()} MODE)`}
          </button>
          <p style={{ color: colors.textMuted, fontSize: 11, marginTop: 6, fontFamily: monoFont }}>
            Text: .txt, .csv, .json, .md, .html, .xml, .eml | Images: .jpg, .png (OCR)
          </p>
        </div>
      )}

      {inputMode === 'camera' && !showCamera && (
        <button onClick={openCamera} disabled={scanning} style={{
          width: '100%', padding: 24, minHeight: 44,
          background: 'transparent',
          border: `1px dashed ${colors.border}`,
          color: colors.textMuted, fontSize: 13, cursor: 'pointer',
          fontFamily: monoFont, letterSpacing: 1, borderRadius: 8,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <span>{scanning ? 'ANALYZING...' : `OPEN CAMERA (${scanType.toUpperCase()} SCAN)`}</span>
        </button>
      )}

      {/* Scanning overlay */}
      {renderScanningOverlay()}

      {/* Editable form (before confirm) */}
      {renderEditableForm()}

      {/* Confirmed results */}
      {renderResult()}

      {/* History */}
      {renderHistory()}

      {/* New scan button */}
      {(result || editingResult) && !scanning && (
        <button onClick={() => { setResult(null); setEditingResult(null); setTextInput('') }} style={{
          width: '100%', padding: '12px 16px', marginTop: 12, minHeight: 44,
          background: 'transparent', border: `1px solid ${colors.border}`,
          color: colors.textMuted, fontSize: 13, cursor: 'pointer',
          fontFamily: monoFont, letterSpacing: 1, borderRadius: 8,
        }}>NEW SCAN</button>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes scanBar { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }
        @keyframes scanLine { 0%, 100% { top: 12px; opacity: 0.6; } 50% { top: calc(100% - 14px); opacity: 0.3; } }
      `}</style>
    </div>
  )
}
