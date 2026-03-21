import { error, getUserId } from './_helpers'

// POST /api/tts - Generate speech audio using OpenAI TTS
export async function onRequestPost({ env, request, data }) {
  const userId = await getUserId(request, env)
  if (!userId) return error('Unauthorized', 401)

  const body = await request.json()
  const { text, voice = 'alloy', speed = 1 } = body

  if (!text || !text.trim()) return error('No text provided')
  if (text.length > 4096) return error('Text too long (max 4096 chars). Split into chunks.')

  const apiKey = env.OPENAI_API_KEY
  if (!apiKey) return error('OpenAI TTS not configured')

  // Valid OpenAI TTS voices
  const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
  const safeVoice = validVoices.includes(voice) ? voice : 'alloy'
  const safeSpeed = Math.max(0.25, Math.min(4.0, Number(speed) || 1))

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: safeVoice,
        speed: safeSpeed,
        response_format: 'mp3',
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('TTS error:', err)
      return error('TTS generation failed')
    }

    // Stream the audio back
    return new Response(response.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err) {
    return error(err.message)
  }
}
