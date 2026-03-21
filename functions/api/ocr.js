import { json, error, parseBody } from './_helpers'

// POST /api/ocr - Extract text from image using Claude vision
export async function onRequestPost({ env, request, data }) {
  const contentType = request.headers.get('content-type') || ''

  let images = []

  if (contentType.includes('multipart/form-data')) {
    // Handle file upload
    const formData = await request.formData()
    const files = formData.getAll('images')

    for (const file of files) {
      if (file instanceof File) {
        const buffer = await file.arrayBuffer()
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
        const mediaType = file.type || 'image/jpeg'
        images.push({ base64, mediaType })
      }
    }
  } else {
    // Handle JSON with base64 images
    const body = await parseBody(request)
    if (body.images) {
      images = body.images // [{ base64, mediaType }]
    } else if (body.image) {
      images = [body.image]
    }
  }

  if (images.length === 0) return error('No images provided')

  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ error: 'no_api_key', text: '' })

  // Build content blocks with all images
  const content = []
  for (const img of images) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mediaType || 'image/jpeg',
        data: img.base64,
      },
    })
  }
  content.push({
    type: 'text',
    text: images.length > 1
      ? 'These are pages from a book or document, in order. Extract ALL the text from every page. Preserve paragraph breaks. Return ONLY the extracted text, no commentary.'
      : 'Extract ALL the text from this image. Preserve paragraph breaks and formatting. Return ONLY the extracted text, no commentary or descriptions.',
  })

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('OCR error:', err)
      return json({ error: 'api_error', text: '' })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text || ''

    return json({ text, pages: images.length })
  } catch (err) {
    return json({ error: err.message, text: '' })
  }
}
