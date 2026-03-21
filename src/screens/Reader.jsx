import { useState, useRef, useEffect } from 'react'
import { colors } from '../constants'
import { db } from '../db'

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4]
const RSVP_WPM = [200, 300, 400, 500, 600, 700, 800, 1000]
const CLOUD_VOICES = [
  { id: 'alloy', name: 'Alloy (neutral)' },
  { id: 'echo', name: 'Echo (male)' },
  { id: 'fable', name: 'Fable (expressive)' },
  { id: 'onyx', name: 'Onyx (deep male)' },
  { id: 'nova', name: 'Nova (female)' },
  { id: 'shimmer', name: 'Shimmer (soft female)' },
]

// ---- File parsers (lazy-loaded from CDN) ----

async function parsePDF(file) {
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
      s.onload = resolve
      s.onerror = () => {
        // Fallback to unpkg if cdnjs fails
        const s2 = document.createElement('script')
        s2.src = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js'
        s2.onload = resolve
        s2.onerror = reject
        document.head.appendChild(s2)
      }
      document.head.appendChild(s)
    })
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  }
  const buffer = await file.arrayBuffer()
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map(item => item.str).join(' ')
    text += pageText + '\n\n'
  }
  return text.trim()
}

async function parseDOCX(file) {
  if (!window.mammoth) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js'
      s.onload = resolve
      s.onerror = reject
      document.head.appendChild(s)
    })
  }
  const buffer = await file.arrayBuffer()
  const result = await window.mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value.trim()
}

async function parseEPUB(file) {
  if (!window.JSZip) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
      s.onload = resolve
      s.onerror = reject
      document.head.appendChild(s)
    })
  }
  const buffer = await file.arrayBuffer()
  const zip = await window.JSZip.loadAsync(buffer)

  // Find the OPF file from container.xml for correct reading order
  let opfPath = null
  try {
    const container = await zip.file('META-INF/container.xml')?.async('text')
    if (container) {
      const match = container.match(/full-path="([^"]+\.opf)"/)
      if (match) opfPath = match[1]
    }
  } catch {}

  // Read spine order from OPF
  const orderedFiles = []
  if (opfPath) {
    try {
      const opf = await zip.file(opfPath)?.async('text')
      if (opf) {
        const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : ''
        // Parse manifest items
        const manifest = {}
        const itemRegex = /<item\s+[^>]*id="([^"]*)"[^>]*href="([^"]*)"[^>]*/g
        let m
        while ((m = itemRegex.exec(opf)) !== null) {
          manifest[m[1]] = opfDir + decodeURIComponent(m[2])
        }
        // Parse spine order
        const spineRegex = /<itemref\s+[^>]*idref="([^"]*)"/g
        while ((m = spineRegex.exec(opf)) !== null) {
          const href = manifest[m[1]]
          if (href) {
            const entry = zip.file(href)
            if (entry) orderedFiles.push(entry)
          }
        }
      }
    } catch {}
  }

  // Fallback: grab all html files sorted by name
  if (orderedFiles.length === 0) {
    zip.forEach((path, entry) => {
      if (!entry.dir && (path.endsWith('.xhtml') || path.endsWith('.html') || path.endsWith('.htm'))
          && !path.includes('toc') && !path.includes('nav')) {
        orderedFiles.push(entry)
      }
    })
    orderedFiles.sort((a, b) => a.name.localeCompare(b.name))
  }

  let fullText = ''
  for (const entry of orderedFiles) {
    const html = await entry.async('text')
    const div = document.createElement('div')
    div.innerHTML = html
    const text = div.textContent || div.innerText || ''
    if (text.trim()) fullText += text.trim() + '\n\n'
  }
  return fullText.trim()
}

async function parseTXT(file) {
  return await file.text()
}

async function parseFile(file) {
  const name = file.name.toLowerCase()
  const type = file.type

  if (name.endsWith('.pdf') || type === 'application/pdf') return await parsePDF(file)
  if (name.endsWith('.docx') || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return await parseDOCX(file)
  if (name.endsWith('.epub') || type === 'application/epub+zip') return await parseEPUB(file)
  if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.rtf') || type.startsWith('text/')) return await parseTXT(file)

  throw new Error(`Unsupported file type: ${name}`)
}

// ---- Library persistence (localStorage) ----
const LIBRARY_KEY = 'jarvis_reader_library'

function loadLibrary() {
  try {
    return JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]')
  } catch { return [] }
}

function saveLibrary(lib) {
  try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib)) } catch {}
}

// ---- Main Component ----

export default function Reader({ user }) {
  // Input state
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState('text') // text, url, scan, file
  const [pages, setPages] = useState([])
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState('')
  const fileInputRef = useRef(null)
  const docInputRef = useRef(null)

  // Playback state
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

  // Cloud TTS state
  const [voiceMode, setVoiceMode] = useState('browser') // browser, cloud
  const [cloudVoice, setCloudVoice] = useState('nova')
  const audioRef = useRef(null)
  const audioUrlsRef = useRef([])

  // Highlighting state
  const [highlightedWord, setHighlightedWord] = useState(-1)
  const [displayChunkWords, setDisplayChunkWords] = useState([])

  // AI tools state
  const [aiLoading, setAiLoading] = useState('')
  const [aiResult, setAiResult] = useState(null)

  // Quiz state
  const [quiz, setQuiz] = useState(null)
  const [quizAnswers, setQuizAnswers] = useState({})
  const [quizRevealed, setQuizRevealed] = useState(false)

  // RSVP state
  const [rsvpActive, setRsvpActive] = useState(false)
  const [rsvpWpm, setRsvpWpm] = useState(400)
  const [rsvpWord, setRsvpWord] = useState('')
  const [rsvpProgress, setRsvpProgress] = useState(0)
  const [rsvpPaused, setRsvpPaused] = useState(false)
  const rsvpIndexRef = useRef(0)
  const rsvpTimerRef = useRef(null)
  const rsvpWordsRef = useRef([])

  // Library state
  const [library, setLibrary] = useState([])
  const [showLibrary, setShowLibrary] = useState(false)
  const [currentReadingId, setCurrentReadingId] = useState(null)

  // View: 'input' or 'player'
  const [view, setView] = useState('input')

  // Load voices
  useEffect(() => {
    const loadVoices = () => {
      const v = window.speechSynthesis?.getVoices() || []
      const english = v.filter(voice => voice.lang.startsWith('en'))
      setVoices(english)
      if (!selectedVoice && english.length) {
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

  // Load library
  useEffect(() => { setLibrary(loadLibrary()) }, [])

  // ---- Text chunking ----
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

  // ---- Input handlers ----

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
        setTitle(url.replace(/^https?:\/\//, '').split('/')[0])
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
        setTitle('Scanned Document')
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

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const extracted = await parseFile(file)
      setText(extracted)
      setTitle(file.name.replace(/\.[^.]+$/, ''))
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
    if (docInputRef.current) docInputRef.current.value = ''
  }

  // ---- AI Tools ----

  const aiAction = async (action) => {
    if (!text.trim()) return
    setAiLoading(action)
    setAiResult(null)
    setError('')
    try {
      const prompts = {
        clean: `Clean up this text for reading aloud. Remove headers, footers, page numbers, URLs, navigation text, and formatting artifacts. Fix broken sentences from page breaks. Return ONLY the cleaned text:\n\n${text}`,
        summarize: `Provide a clear, comprehensive summary of this text in 3-5 paragraphs. Capture all key points:\n\n${text}`,
        keypoints: `Extract the key points from this text as a numbered list. Be thorough:\n\n${text}`,
        simplify: `Rewrite this text at a 6th grade reading level. Keep all important information but use simpler words and shorter sentences:\n\n${text}`,
      }
      const result = await db.ai.chat(prompts[action], [], { userName: user.name })
      if (result.response) {
        if (action === 'clean') {
          setText(result.response)
        } else {
          setAiResult({ type: action, content: result.response })
        }
      }
    } catch (err) {
      setError(`AI ${action} failed: ${err.message}`)
    }
    setAiLoading('')
  }

  const useAiResult = () => {
    if (aiResult) {
      setText(aiResult.content)
      setAiResult(null)
    }
  }

  // ---- Quiz ----

  const generateQuiz = async () => {
    if (!text.trim()) return
    setAiLoading('quiz')
    setQuiz(null)
    setQuizAnswers({})
    setQuizRevealed(false)
    setError('')
    try {
      const result = await db.ai.chat(
        `Generate a 5-question multiple-choice quiz about this text. Format as JSON array:
[{"q":"question","options":["A","B","C","D"],"answer":0}]
where "answer" is the index of the correct option. Return ONLY the JSON:\n\n${text.slice(0, 3000)}`,
        [], { userName: user.name }
      )
      if (result.response) {
        const jsonMatch = result.response.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          setQuiz(JSON.parse(jsonMatch[0]))
        }
      }
    } catch (err) {
      setError('Quiz generation failed')
    }
    setAiLoading('')
  }

  // ---- TTS Playback ----

  const speak = (startIndex = 0) => {
    if (!text.trim()) return

    if (voiceMode === 'cloud') {
      speakCloud(startIndex)
      return
    }

    // Browser TTS
    if (!('speechSynthesis' in window)) { setError('Speech synthesis not supported'); return }

    window.speechSynthesis.cancel()
    cancelledRef.current = false

    const chunks = splitIntoChunks(text)
    chunksRef.current = chunks
    setTotalChunks(chunks.length)
    currentIndexRef.current = startIndex

    setPlaying(true)
    setPaused(false)
    setView('player')

    const speakChunk = (index) => {
      if (index >= chunks.length || cancelledRef.current) {
        setPlaying(false)
        setPaused(false)
        setProgress(100)
        setHighlightedWord(-1)
        autoSaveProgress(chunks.length, chunks.length)
        return
      }

      const words = chunks[index].split(/\s+/)
      setDisplayChunkWords(words)
      setHighlightedWord(0)

      const utter = new SpeechSynthesisUtterance(chunks[index])
      utter.rate = speedRef.current
      utter.pitch = 1.0

      const voice = voices.find(v => v.name === selectedVoice)
      if (voice) utter.voice = voice

      utter.onboundary = (e) => {
        if (e.name === 'word') {
          const textBefore = chunks[index].substring(0, e.charIndex)
          const wIdx = textBefore.split(/\s+/).length
          setHighlightedWord(Math.min(wIdx, words.length - 1))
        }
      }

      utter.onstart = () => {
        setCurrentChunk(index)
        setProgress(Math.round((index / chunks.length) * 100))
        currentIndexRef.current = index
      }

      utter.onend = () => {
        if (!cancelledRef.current) {
          autoSaveProgress(index + 1, chunks.length)
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

  // Cloud TTS (OpenAI)
  const cloudResolveRef = useRef(null)

  const speakCloud = async (startIndex = 0) => {
    const chunks = splitIntoChunks(text)
    chunksRef.current = chunks
    setTotalChunks(chunks.length)
    currentIndexRef.current = startIndex
    cancelledRef.current = false
    setPlaying(true)
    setPaused(false)
    setView('player')

    // Clean up old audio URLs
    audioUrlsRef.current.forEach(u => URL.revokeObjectURL(u))
    audioUrlsRef.current = []

    for (let i = startIndex; i < chunks.length; i++) {
      if (cancelledRef.current) break

      const words = chunks[i].split(/\s+/)
      setDisplayChunkWords(words)
      setHighlightedWord(0)
      setCurrentChunk(i)
      setProgress(Math.round((i / chunks.length) * 100))
      currentIndexRef.current = i

      try {
        const audioUrl = await db.ai.tts(chunks[i], cloudVoice, speed)
        audioUrlsRef.current.push(audioUrl)

        if (cancelledRef.current) break

        await new Promise((resolve, reject) => {
          // Store resolve so stop/skip can break out of this promise
          cloudResolveRef.current = resolve

          const audio = new Audio(audioUrl)
          audioRef.current = audio
          let highlightTimer = null

          audio.onloadedmetadata = () => {
            const duration = audio.duration * 1000
            const interval = duration / words.length
            let wIdx = 0
            highlightTimer = setInterval(() => {
              if (wIdx < words.length) {
                setHighlightedWord(wIdx)
                wIdx++
              } else {
                clearInterval(highlightTimer)
              }
            }, interval)
          }

          audio.onended = () => {
            if (highlightTimer) clearInterval(highlightTimer)
            cloudResolveRef.current = null
            resolve()
          }
          audio.onerror = () => {
            if (highlightTimer) clearInterval(highlightTimer)
            cloudResolveRef.current = null
            reject(new Error('Audio playback error'))
          }
          // Also resolve on pause event from stop/skip (src set to '')
          audio.onabort = () => {
            if (highlightTimer) clearInterval(highlightTimer)
            cloudResolveRef.current = null
            resolve()
          }

          audio.play().catch(err => {
            cloudResolveRef.current = null
            reject(err)
          })
        })

        autoSaveProgress(i + 1, chunks.length)
      } catch (err) {
        if (!cancelledRef.current) {
          setError(`Cloud TTS error: ${err.message}`)
          break
        }
      }
    }

    if (!cancelledRef.current) {
      setProgress(100)
      autoSaveProgress(chunks.length, chunks.length)
    }
    setPlaying(false)
    setPaused(false)
    setHighlightedWord(-1)
  }

  const pause = () => {
    if (voiceMode === 'cloud' && audioRef.current) {
      audioRef.current.pause()
    } else {
      window.speechSynthesis.pause()
    }
    setPaused(true)
  }

  const resume = () => {
    if (voiceMode === 'cloud' && audioRef.current) {
      audioRef.current.play()
    } else {
      window.speechSynthesis.resume()
    }
    setPaused(false)
  }

  const stopCloudAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    // Resolve any pending promise so the async loop exits
    if (cloudResolveRef.current) {
      cloudResolveRef.current()
      cloudResolveRef.current = null
    }
  }

  const stop = () => {
    cancelledRef.current = true
    if (voiceMode === 'cloud') {
      stopCloudAudio()
    } else {
      window.speechSynthesis.cancel()
    }
    setPlaying(false)
    setPaused(false)
    setHighlightedWord(-1)
  }

  const skipForward = () => {
    const next = Math.min(currentIndexRef.current + 1, chunksRef.current.length - 1)
    cancelledRef.current = true
    if (voiceMode === 'cloud') {
      stopCloudAudio()
    } else {
      window.speechSynthesis.cancel()
    }
    setTimeout(() => {
      cancelledRef.current = false
      speak(next)
    }, 50)
  }

  const skipBack = () => {
    const prev = Math.max(currentIndexRef.current - 1, 0)
    cancelledRef.current = true
    if (voiceMode === 'cloud') {
      stopCloudAudio()
    } else {
      window.speechSynthesis.cancel()
    }
    setTimeout(() => {
      cancelledRef.current = false
      speak(prev)
    }, 50)
  }

  const speedRef = useRef(speed)

  const changeSpeed = () => {
    const idx = SPEEDS.indexOf(speedRef.current)
    const newSpeed = SPEEDS[(idx + 1) % SPEEDS.length]
    setSpeed(newSpeed)
    speedRef.current = newSpeed
    if (playing && voiceMode === 'browser') {
      const current = currentIndexRef.current
      cancelledRef.current = true
      window.speechSynthesis.cancel()
      cancelledRef.current = false
      setTimeout(() => speak(current), 100)
    }
  }

  // ---- RSVP Speed Reader ----

  const startRSVP = () => {
    if (!text.trim()) return
    const words = text.split(/\s+/).filter(w => w)
    rsvpWordsRef.current = words
    rsvpIndexRef.current = 0
    setRsvpActive(true)
    setRsvpPaused(false)
    setView('player')
    runRSVP(words, 0)
  }

  const rsvpWpmRef = useRef(rsvpWpm)

  const runRSVP = (words, startIdx, wpm) => {
    clearInterval(rsvpTimerRef.current)
    const useWpm = wpm || rsvpWpmRef.current
    const interval = 60000 / useWpm
    let idx = startIdx
    rsvpTimerRef.current = setInterval(() => {
      if (idx >= words.length) {
        clearInterval(rsvpTimerRef.current)
        setRsvpActive(false)
        setRsvpWord('Done!')
        return
      }
      setRsvpWord(words[idx])
      setRsvpProgress(Math.round((idx / words.length) * 100))
      rsvpIndexRef.current = idx
      idx++
    }, interval)
  }

  const toggleRSVPPause = () => {
    if (rsvpPaused) {
      setRsvpPaused(false)
      runRSVP(rsvpWordsRef.current, rsvpIndexRef.current)
    } else {
      clearInterval(rsvpTimerRef.current)
      setRsvpPaused(true)
    }
  }

  const stopRSVP = () => {
    clearInterval(rsvpTimerRef.current)
    setRsvpActive(false)
    setRsvpPaused(false)
    setRsvpWord('')
    setRsvpProgress(0)
  }

  const changeRSVPSpeed = () => {
    const idx = RSVP_WPM.indexOf(rsvpWpm)
    const newWpm = RSVP_WPM[(idx + 1) % RSVP_WPM.length]
    setRsvpWpm(newWpm)
    rsvpWpmRef.current = newWpm
    if (rsvpActive && !rsvpPaused) {
      clearInterval(rsvpTimerRef.current)
      runRSVP(rsvpWordsRef.current, rsvpIndexRef.current, newWpm)
    }
  }

  // ---- Library ----

  const saveToLibrary = () => {
    if (!text.trim()) return
    const lib = loadLibrary()
    const entry = {
      id: currentReadingId || Date.now().toString(),
      title: title || 'Untitled',
      text,
      position: currentIndexRef.current,
      totalChunks: chunksRef.current.length || splitIntoChunks(text).length,
      wordCount: text.split(/\s+/).length,
      savedAt: new Date().toISOString(),
    }
    const idx = lib.findIndex(e => e.id === entry.id)
    if (idx >= 0) lib[idx] = entry
    else lib.unshift(entry)
    saveLibrary(lib)
    setLibrary(lib)
    setCurrentReadingId(entry.id)
  }

  const loadFromLibrary = (entry) => {
    setText(entry.text)
    setTitle(entry.title)
    setCurrentReadingId(entry.id)
    currentIndexRef.current = entry.position || 0
    setShowLibrary(false)
    setView('input')
  }

  const deleteFromLibrary = (id) => {
    const lib = loadLibrary().filter(e => e.id !== id)
    saveLibrary(lib)
    setLibrary(lib)
  }

  const autoSaveProgress = (chunkIdx, total) => {
    if (!currentReadingId) return
    const lib = loadLibrary()
    const entry = lib.find(e => e.id === currentReadingId)
    if (entry) {
      entry.position = chunkIdx
      entry.totalChunks = total
      saveLibrary(lib)
    }
  }

  // Cleanup
  useEffect(() => () => {
    cancelledRef.current = true
    window.speechSynthesis?.cancel()
    clearInterval(rsvpTimerRef.current)
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
    audioUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
  }, [])

  // ---- RENDER ----

  // Library view
  if (showLibrary) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ color: colors.primary, fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 3 }}>
            Library
          </h2>
          <button onClick={() => setShowLibrary(false)} style={linkBtn}>BACK</button>
        </div>

        {library.length === 0 ? (
          <p style={{ color: colors.textMuted, fontSize: 12, fontFamily: "'Exo 2', sans-serif" }}>
            No saved readings yet. Save a reading to pick up where you left off.
          </p>
        ) : (
          library.map(entry => (
            <div key={entry.id} style={{
              padding: 12, marginBottom: 8,
              border: `1px solid ${colors.border}`, background: colors.surface,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => loadFromLibrary(entry)}>
                  <div style={{ color: colors.text, fontSize: 13, fontWeight: 600, fontFamily: "'Exo 2', sans-serif", marginBottom: 4 }}>
                    {entry.title}
                  </div>
                  <div style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
                    {entry.wordCount} words
                    {entry.totalChunks > 0 && ` // ${Math.round((entry.position / entry.totalChunks) * 100)}% read`}
                    {' // '}saved {new Date(entry.savedAt).toLocaleDateString()}
                  </div>
                  {entry.totalChunks > 0 && (
                    <div style={{ marginTop: 6, width: '100%', height: 2, background: colors.border }}>
                      <div style={{
                        width: `${Math.round((entry.position / entry.totalChunks) * 100)}%`,
                        height: '100%', background: colors.primary,
                      }} />
                    </div>
                  )}
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteFromLibrary(entry.id) }} style={{
                  ...linkBtn, color: colors.danger, marginLeft: 8, fontSize: 8,
                }}>DEL</button>
              </div>
            </div>
          ))
        )}
      </div>
    )
  }

  // Quiz view
  if (quiz) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ color: colors.primary, fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 3 }}>
            Comprehension Quiz
          </h2>
          <button onClick={() => setQuiz(null)} style={linkBtn}>CLOSE</button>
        </div>

        {quiz.map((q, qi) => (
          <div key={qi} style={{
            padding: 12, marginBottom: 10,
            border: `1px solid ${colors.border}`, background: colors.surface,
          }}>
            <div style={{ color: colors.text, fontSize: 13, fontFamily: "'Exo 2', sans-serif", marginBottom: 10, lineHeight: 1.5 }}>
              {qi + 1}. {q.q}
            </div>
            {q.options.map((opt, oi) => {
              const selected = quizAnswers[qi] === oi
              const isCorrect = q.answer === oi
              let bg = 'transparent'
              let borderColor = colors.border
              if (quizRevealed) {
                if (isCorrect) { bg = 'rgba(0, 230, 118, 0.15)'; borderColor = colors.success }
                else if (selected && !isCorrect) { bg = 'rgba(255, 77, 77, 0.15)'; borderColor = colors.danger }
              } else if (selected) {
                bg = colors.primaryDim; borderColor = colors.primary
              }
              return (
                <button key={oi} onClick={() => !quizRevealed && setQuizAnswers(p => ({ ...p, [qi]: oi }))}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 10px', marginBottom: 4,
                    background: bg, border: `1px solid ${borderColor}`,
                    color: colors.text, fontSize: 12, fontFamily: "'Exo 2', sans-serif",
                    cursor: quizRevealed ? 'default' : 'pointer',
                  }}>
                  {String.fromCharCode(65 + oi)}. {opt}
                </button>
              )
            })}
          </div>
        ))}

        {!quizRevealed ? (
          <button onClick={() => setQuizRevealed(true)}
            disabled={Object.keys(quizAnswers).length < quiz.length}
            style={{
              width: '100%', padding: 14,
              background: Object.keys(quizAnswers).length >= quiz.length ? colors.primaryDim : 'transparent',
              border: `1px solid ${Object.keys(quizAnswers).length >= quiz.length ? colors.primary : colors.border}`,
              color: Object.keys(quizAnswers).length >= quiz.length ? colors.primary : colors.textMuted,
              fontSize: 11, cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2,
            }}>CHECK ANSWERS</button>
        ) : (
          <div style={{
            textAlign: 'center', padding: 16,
            border: `1px solid ${colors.border}`, background: colors.surfaceLight,
          }}>
            <div style={{ color: colors.primary, fontSize: 24, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
              {quiz.filter((q, i) => quizAnswers[i] === q.answer).length}/{quiz.length}
            </div>
            <div style={{ color: colors.textMuted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>
              CORRECT
            </div>
          </div>
        )}
      </div>
    )
  }

  // RSVP view
  if (rsvpActive) {
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', minHeight: '60vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ color: colors.primary, fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 3 }}>
            Speed Reader
          </h2>
          <button onClick={stopRSVP} style={linkBtn}>EXIT</button>
        </div>

        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 200,
        }}>
          <div style={{
            color: colors.text, fontSize: 38, fontWeight: 700,
            fontFamily: "'Exo 2', sans-serif",
            textAlign: 'center',
            letterSpacing: 1,
          }}>
            {rsvpWord}
          </div>
        </div>

        {/* Focus line */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ width: 120, height: 2, background: colors.primary, boxShadow: `0 0 8px ${colors.primary}` }} />
        </div>

        {/* Progress */}
        <div style={{ width: '100%', height: 3, background: colors.border, marginBottom: 12 }}>
          <div style={{
            width: `${rsvpProgress}%`, height: '100%', background: colors.primary,
            transition: 'width 0.1s linear',
          }} />
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <button onClick={toggleRSVPPause} style={{
            ...controlBtn, width: 56, height: 56,
            background: colors.primaryDim, border: `1px solid ${colors.primary}`, color: colors.primary,
          }}>
            <span style={{ fontSize: 20 }}>{rsvpPaused ? '\u25B6' : '\u2016'}</span>
          </button>

          <button onClick={stopRSVP} style={controlBtn}>
            <span style={{ fontSize: 16 }}>{'\u25A0'}</span>
          </button>

          <button onClick={changeRSVPSpeed} style={{
            ...controlBtn, width: 'auto', padding: '0 14px',
            fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
          }}>
            {rsvpWpm} WPM
          </button>
        </div>
      </div>
    )
  }

  // Player view (during TTS playback or when text is loaded)
  if (view === 'player' && text) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ color: colors.primary, fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 3 }}>
            {title || 'Reader'}
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { stop(); setView('input') }} style={linkBtn}>EDIT</button>
            <button onClick={() => setShowLibrary(true)} style={linkBtn}>LIBRARY</button>
          </div>
        </div>

        <div style={{
          color: colors.textMuted, fontSize: 9, marginBottom: 12,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {text.split(/\s+/).length} words // ~{Math.ceil(text.split(/\s+/).length / (150 * speed))} min at {speed}x
        </div>

        {/* Progress bar */}
        {playing && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ width: '100%', height: 3, background: colors.border }}>
              <div style={{
                width: `${progress}%`, height: '100%', background: colors.primary,
                boxShadow: `0 0 8px ${colors.primary}`, transition: 'width 0.3s ease',
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

        {/* Word-level highlighting display */}
        {playing && displayChunkWords.length > 0 && (
          <div style={{
            padding: 16, marginBottom: 12,
            border: `1px solid ${colors.border}`, background: colors.surfaceLight,
            lineHeight: 2, minHeight: 80,
          }}>
            <div style={{
              color: colors.textMuted, fontSize: 9, marginBottom: 8,
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
            }}>NOW READING</div>
            <p style={{ fontFamily: "'Exo 2', sans-serif", fontSize: 15 }}>
              {displayChunkWords.map((word, i) => (
                <span key={i} style={{
                  color: i === highlightedWord ? colors.primary : colors.text,
                  background: i === highlightedWord ? colors.primaryDim : 'transparent',
                  padding: i === highlightedWord ? '2px 4px' : '0',
                  borderRadius: 2,
                  transition: 'all 0.1s ease',
                  fontWeight: i === highlightedWord ? 700 : 400,
                }}>{word} </span>
              ))}
            </p>
          </div>
        )}

        {/* Playback controls */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 12, padding: 16,
          border: `1px solid ${colors.border}`, background: colors.surfaceLight,
        }}>
          <button onClick={skipBack} disabled={!playing} style={controlBtn}>
            <span style={{ fontSize: 16 }}>&#9664;&#9664;</span>
          </button>

          {!playing ? (
            <button onClick={() => speak(currentIndexRef.current || 0)} disabled={!text.trim()} style={{
              ...controlBtn, width: 56, height: 56,
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

        {/* Voice mode toggle */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 0, marginBottom: 8, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
            {[['browser', 'DEVICE VOICES'], ['cloud', 'AI VOICES']].map(([m, label]) => (
              <button key={m} onClick={() => setVoiceMode(m)} style={{
                flex: 1, padding: '6px 0',
                background: voiceMode === m ? colors.primaryDim : 'transparent',
                color: voiceMode === m ? colors.primary : colors.textMuted,
                border: 'none', borderBottom: voiceMode === m ? `1px solid ${colors.primary}` : '1px solid transparent',
                fontSize: 9, cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
              }}>{label}</button>
            ))}
          </div>

          {voiceMode === 'browser' && voices.length > 0 && (
            <div>
              <label style={labelStyle}>VOICE</label>
              <select
                value={selectedVoice || ''}
                onChange={e => setSelectedVoice(e.target.value)}
                style={selectStyle}
              >
                {voices.map(v => (
                  <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                ))}
              </select>
            </div>
          )}

          {voiceMode === 'cloud' && (
            <div>
              <label style={labelStyle}>AI VOICE (OpenAI)</label>
              <select
                value={cloudVoice}
                onChange={e => setCloudVoice(e.target.value)}
                style={selectStyle}
              >
                {CLOUD_VOICES.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <div style={{
                color: colors.textMuted, fontSize: 8, marginTop: 4,
                fontFamily: "'JetBrains Mono', monospace",
              }}>Premium AI voices — natural and expressive</div>
            </div>
          )}
        </div>

        {/* Action buttons row */}
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={startRSVP} style={actionBtn}>SPEED READ</button>
          <button onClick={generateQuiz} disabled={!!aiLoading} style={actionBtn}>
            {aiLoading === 'quiz' ? 'GENERATING...' : 'QUIZ ME'}
          </button>
          <button onClick={saveToLibrary} style={actionBtn}>
            {currentReadingId ? 'UPDATE SAVE' : 'SAVE'}
          </button>
        </div>

        {error && <div style={errorStyle}>{error}</div>}
      </div>
    )
  }

  // Input view (default)
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 style={{
          color: colors.primary, fontSize: 11, fontWeight: 600,
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: 3,
        }}>Reader</h2>
        <button onClick={() => setShowLibrary(true)} style={linkBtn}>LIBRARY ({library.length})</button>
      </div>
      <p style={{
        color: colors.textMuted, fontSize: 10, marginBottom: 16,
        fontFamily: "'JetBrains Mono', monospace",
      }}>Paste text, upload a file, scan pages, or grab a URL — JARVIS reads it aloud</p>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {[['text', 'PASTE'], ['url', 'URL'], ['file', 'FILE'], ['scan', 'SCAN']].map(([m, label]) => (
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

      {/* Title input */}
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Title (optional)"
        style={{
          width: '100%', padding: '8px 12px', marginBottom: 8,
          background: colors.surface, border: `1px solid ${colors.border}`,
          color: colors.text, fontSize: 12, fontFamily: "'Exo 2', sans-serif",
        }}
      />

      {/* Text input */}
      {mode === 'text' && (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste any text here — articles, emails, documents, notes..."
          style={{
            width: '100%', minHeight: 120, padding: 12,
            background: colors.surface, border: `1px solid ${colors.border}`,
            color: colors.text, fontSize: 13, fontFamily: "'Exo 2', sans-serif",
            resize: 'vertical', lineHeight: 1.6,
          }}
        />
      )}

      {/* URL input */}
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

      {/* File upload */}
      {mode === 'file' && (
        <div>
          <input
            ref={docInputRef}
            type="file"
            accept=".pdf,.docx,.epub,.txt,.md,.rtf"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <button onClick={() => docInputRef.current?.click()} disabled={loading} style={{
            width: '100%', padding: 20,
            background: 'transparent', border: `1px dashed ${colors.border}`,
            color: colors.textSecondary, fontSize: 10, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>
            {loading ? 'PROCESSING...' : 'SELECT FILE — PDF, DOCX, EPUB, TXT'}
          </button>
          <div style={{
            color: colors.textMuted, fontSize: 8, marginTop: 8,
            fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6,
          }}>
            Files are processed locally in your browser. Nothing is uploaded to a server.
          </div>
        </div>
      )}

      {/* Scan pages */}
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

          <button onClick={() => fileInputRef.current?.click()} disabled={scanning} style={{
            width: '100%', padding: 14,
            background: 'transparent', border: `1px dashed ${colors.border}`,
            color: colors.textSecondary, fontSize: 10, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>
            TAKE PHOTO / SELECT IMAGES
          </button>

          {pages.length > 0 && (
            <div style={{ marginTop: 10 }}>
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
            Take photos of book pages in order. JARVIS uses AI vision to extract the text.
          </div>
        </div>
      )}

      {error && <div style={errorStyle}>{error}</div>}

      {/* Word count & extracted text preview */}
      {text && (
        <>
          <div style={{
            color: colors.textMuted, fontSize: 9, marginTop: 8,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {text.split(/\s+/).length} words // ~{Math.ceil(text.split(/\s+/).length / (150 * speed))} min at {speed}x
          </div>

          {/* Text preview */}
          <div style={{
            marginTop: 8, padding: 10, maxHeight: 120, overflow: 'auto',
            border: `1px solid ${colors.border}`, background: colors.surface,
            color: colors.textSecondary, fontSize: 12, lineHeight: 1.5,
            fontFamily: "'Exo 2', sans-serif",
          }}>
            {text.slice(0, 500)}{text.length > 500 ? '...' : ''}
          </div>

          {/* AI tools */}
          <div style={{ marginTop: 10 }}>
            <div style={{
              color: colors.textMuted, fontSize: 9, marginBottom: 6,
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
            }}>AI TOOLS</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                ['clean', 'CLEAN UP'],
                ['summarize', 'SUMMARIZE'],
                ['keypoints', 'KEY POINTS'],
                ['simplify', 'SIMPLIFY'],
              ].map(([action, label]) => (
                <button key={action} onClick={() => aiAction(action)} disabled={!!aiLoading} style={{
                  padding: '6px 12px',
                  background: aiLoading === action ? colors.primaryDim : 'transparent',
                  border: `1px solid ${colors.border}`,
                  color: aiLoading === action ? colors.primary : colors.textSecondary,
                  fontSize: 9, cursor: aiLoading ? 'wait' : 'pointer',
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
                }}>{aiLoading === action ? '...' : label}</button>
              ))}
            </div>
          </div>

          {/* AI result */}
          {aiResult && (
            <div style={{
              marginTop: 10, padding: 12,
              border: `1px solid ${colors.primary}`, background: colors.surfaceLight,
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
              }}>
                <span style={{
                  color: colors.primary, fontSize: 9,
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
                }}>{aiResult.type.toUpperCase()}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={useAiResult} style={{ ...linkBtn, color: colors.success }}>USE THIS</button>
                  <button onClick={() => setAiResult(null)} style={linkBtn}>DISMISS</button>
                </div>
              </div>
              <div style={{
                color: colors.text, fontSize: 12, lineHeight: 1.6, maxHeight: 200, overflow: 'auto',
                fontFamily: "'Exo 2', sans-serif", whiteSpace: 'pre-wrap',
              }}>
                {aiResult.content}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <button onClick={() => { setView('player'); speak(0) }} style={{
              flex: 2, padding: 14,
              background: colors.primaryDim, border: `1px solid ${colors.primary}`,
              color: colors.primary, fontSize: 11, cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2,
            }}>LISTEN</button>

            <button onClick={startRSVP} style={{
              flex: 1, padding: 14,
              background: 'transparent', border: `1px solid ${colors.border}`,
              color: colors.textSecondary, fontSize: 10, cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
            }}>SPEED READ</button>

            <button onClick={saveToLibrary} style={{
              flex: 1, padding: 14,
              background: 'transparent', border: `1px solid ${colors.border}`,
              color: colors.textSecondary, fontSize: 10, cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
            }}>SAVE</button>
          </div>
        </>
      )}
    </div>
  )
}

// ---- Shared styles ----

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

const linkBtn = {
  background: 'none', border: 'none',
  color: colors.textMuted, fontSize: 9, cursor: 'pointer',
  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
}

const actionBtn = {
  flex: 1, padding: '10px 8px',
  background: 'transparent', border: `1px solid ${colors.border}`,
  color: colors.textSecondary, fontSize: 9, cursor: 'pointer',
  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
}

const labelStyle = {
  color: colors.textMuted, fontSize: 9, display: 'block', marginBottom: 4,
  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
}

const selectStyle = {
  width: '100%', padding: '8px 10px',
  background: colors.surface, border: `1px solid ${colors.border}`,
  color: colors.text, fontSize: 12, fontFamily: "'Exo 2', sans-serif",
  appearance: 'none',
}

const errorStyle = {
  color: colors.danger, fontSize: 10, marginTop: 8,
  fontFamily: "'JetBrains Mono', monospace",
}
