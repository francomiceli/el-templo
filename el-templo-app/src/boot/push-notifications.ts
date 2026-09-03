import { boot } from 'quasar/wrappers'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { FirebaseMessaging } from '@capacitor-firebase/messaging'
import { useNotificationStore } from 'src/stores/useNotificationStore'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import { APP_SECTIONS, CONTACT_SALES_ROUTE, FALLBACK_ROUTE } from 'src/config/destinations'

const log = createLogger('PushNotificationsBoot')

/**
 * Resuelve la ruta interna a la que navega el tap de una push, en el orden
 * fijo de D-03/D-04 (nunca devuelve `undefined` ni una ruta vacía):
 * 1. `destination === 'whatsapp_sales'` → /contacto-ventas (con ?text= si
 *    vino `whatsappText`, que salta directo a WhatsApp, D-03).
 * 2. `destination === 'app_section'` con `destinationSection` conocida →
 *    la ruta curada de esa sección.
 * 3. `route` (compat app vieja / fallback server-side, D-04).
 * 4. `/mi-templo` — nunca un 404.
 */
export function resolveTapRoute(data: Record<string, string> | undefined): string {
  if (!data) return FALLBACK_ROUTE

  if (data.destination === 'whatsapp_sales') {
    const text = data.whatsappText
    return text ? `${CONTACT_SALES_ROUTE}?text=${encodeURIComponent(text)}` : CONTACT_SALES_ROUTE
  }

  if (data.destination === 'app_section' && data.destinationSection) {
    const section = APP_SECTIONS.find((s) => s.key === data.destinationSection)
    if (section) return section.route
  }

  if (typeof data.route === 'string' && data.route.trim() !== '') {
    return data.route
  }

  return FALLBACK_ROUTE
}

/**
 * Platform strategy:
 * - Android: use @capacitor/push-notifications. The plugin already returns an
 *   FCM token (Firebase SDK is baked into Android plugin builds via
 *   google-services.json), so behavior is unchanged from the pre-iOS setup.
 * - iOS: use @capacitor-firebase/messaging. The built-in @capacitor/push-notifications
 *   returns raw APNs tokens on iOS, which the backend's firebase-admin sender
 *   can't use. The Firebase Messaging plugin handles APNs→FCM token exchange
 *   and returns an FCM token that the backend can send to.
 */
export default boot(async ({ router }) => {
  if (!Capacitor.isNativePlatform()) {
    log.info('Not a native platform, skipping push notification setup')
    return
  }

  const store = useNotificationStore()
  const platform = Capacitor.getPlatform() as 'ios' | 'android'

  async function sendTokenToBackend(token: string) {
    try {
      await api.post('/notifications/token', { token, platform })
      log.info('FCM token registered with backend')
    } catch (err: unknown) {
      log.error(
        'Failed to register FCM token with backend',
        err instanceof Error ? { message: err.message } : { message: String(err) },
      )
    }
  }

  function handleTapNavigation(
    data: Record<string, string> | undefined,
    notificationId: string | undefined,
  ) {
    const route = resolveTapRoute(data)
    log.info('Notification tapped', { route, notificationId })

    // Report opened to backend (per D-32)
    if (notificationId) {
      api
        .post(`/notifications/${notificationId}/opened`)
        .catch((err: unknown) =>
          log.error(
            'Failed to report notification opened',
            err instanceof Error ? { message: err.message } : { message: String(err) },
          ),
        )
    }

    // Navigate to target route (per D-28)
    try {
      router.push(route)
    } catch {
      store.setPendingRoute(route)
    }
  }

  if (platform === 'android') {
    // ── Android: @capacitor/push-notifications ─────────────────────────────

    await PushNotifications.addListener('registration', async (token) => {
      log.info('FCM token received (android)')
      store.setFcmToken(token.value)
      await sendTokenToBackend(token.value)
    })

    await PushNotifications.addListener('registrationError', (error) => {
      log.warn('Push notification registration failed (android)', { error: error.error })
    })

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      log.info('Foreground notification suppressed', { title: notification.title })
      // Per D-29: Do NOT show anything when app is in foreground
    })

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification.data as Record<string, string> | undefined
      handleTapNavigation(data, data?.notificationId)
    })

    const permResult = await PushNotifications.checkPermissions()
    const status =
      permResult.receive === 'granted'
        ? 'granted'
        : permResult.receive === 'denied'
          ? 'denied'
          : 'prompt'
    store.setPermissionStatus(status)

    if (status === 'granted') {
      try {
        await PushNotifications.register()
      } catch (err: unknown) {
        log.error(
          'Failed to register for push notifications (android)',
          err instanceof Error ? { message: err.message } : { message: String(err) },
        )
      }
    }
  } else if (platform === 'ios') {
    // ── iOS: @capacitor-firebase/messaging ─────────────────────────────────

    await FirebaseMessaging.addListener('tokenReceived', async (event) => {
      log.info('FCM token received (ios)')
      store.setFcmToken(event.token)
      await sendTokenToBackend(event.token)
    })

    await FirebaseMessaging.addListener('notificationReceived', (event) => {
      log.info('Foreground notification suppressed', {
        title: event.notification.title,
      })
      // Per D-29: Do NOT show anything when app is in foreground
    })

    await FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
      const data = event.notification.data as Record<string, string> | undefined
      handleTapNavigation(data, data?.notificationId)
    })

    const permResult = await FirebaseMessaging.checkPermissions()
    const status =
      permResult.receive === 'granted'
        ? 'granted'
        : permResult.receive === 'denied'
          ? 'denied'
          : 'prompt'
    store.setPermissionStatus(status)

    // Token delivery is handled exclusively via the `tokenReceived` listener
    // above. Calling getToken() here races APNs registration and throws on
    // fresh boots; the listener fires reliably once the APNs→FCM exchange
    // completes, so the eager fetch is redundant.
  }
})

// deploy: fase 193 comunicaciones (fix de tests de tenancy en el mismo push)
