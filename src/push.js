// Web Push Notification helpers
import { db } from './db'

// VAPID public key - generate with: npx web-push generate-vapid-keys
// For now using a placeholder - needs to be replaced with real key
let VAPID_PUBLIC_KEY = null

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function getPermissionState() {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission // 'default', 'granted', 'denied'
}

export async function requestPermission() {
  if (!isPushSupported()) return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export async function subscribeToPush() {
  if (!isPushSupported()) return null

  const permission = await requestPermission()
  if (!permission) return null

  try {
    const registration = await navigator.serviceWorker.ready

    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      // Subscribe without VAPID for now (local notifications only)
      // Full push requires VAPID keys + push server
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // applicationServerKey would go here with VAPID public key
      }).catch(() => null)
    }

    if (subscription) {
      // Store subscription on server
      await db.push?.subscribe?.(subscription.toJSON()).catch(() => {})
    }

    return subscription
  } catch (err) {
    console.error('Push subscription failed:', err)
    return null
  }
}

// Send a local notification (doesn't need push server)
export async function sendLocalNotification(title, body, options = {}) {
  if (Notification.permission !== 'granted') return false

  try {
    const registration = await navigator.serviceWorker.ready
    await registration.showNotification(title, {
      body,
      icon: './icon-192.svg',
      badge: './icon-192.svg',
      tag: options.tag || 'jarvis-' + Date.now(),
      vibrate: [100, 50, 100],
      ...options,
    })
    return true
  } catch {
    // Fallback to basic Notification API
    try {
      new Notification(title, { body, icon: './icon-192.svg' })
      return true
    } catch {
      return false
    }
  }
}

// Schedule a notification (uses setTimeout - only works while app is open)
// For real scheduled notifications, use server-side cron
export function scheduleNotification(title, body, delayMs, options = {}) {
  const timer = setTimeout(() => {
    sendLocalNotification(title, body, options)
  }, delayMs)
  return () => clearTimeout(timer)
}
