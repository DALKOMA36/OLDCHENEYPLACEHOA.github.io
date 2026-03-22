import { json, error, getUserId } from './_helpers'

// Proxy FlightAware AeroAPI — keeps API key server-side
// Set FLIGHTAWARE_API_KEY in Cloudflare Pages env vars

export async function onRequestGet({ env, request, data }) {
  const userId = await getUserId(request, env)
  if (!userId) return error('Unauthorized', 401)

  const apiKey = env.FLIGHTAWARE_API_KEY
  if (!apiKey) return error('FlightAware API key not configured. Set FLIGHTAWARE_API_KEY in Cloudflare Pages environment variables.')

  const url = new URL(request.url)
  const path = url.searchParams.get('path')
  if (!path) return error('path parameter required')

  // Allow all read-only AeroAPI paths available on Personal tier
  const allowedPrefixes = ['/flights/', '/airports/', '/operators/', '/aircraft/', '/schedules/', '/disruption_counts/', '/account/']
  if (!allowedPrefixes.some(p => path.startsWith(p))) {
    return error('Invalid API path')
  }

  try {
    const response = await fetch(`https://aeroapi.flightaware.com/aeroapi${path}`, {
      headers: { 'x-apikey': apiKey },
    })

    if (!response.ok) {
      const errText = await response.text()
      return json({ error: `FlightAware API error: ${response.status}`, details: errText }, response.status)
    }

    const data = await response.json()
    return json(data)
  } catch (err) {
    return error(`FlightAware request failed: ${err.message}`)
  }
}
