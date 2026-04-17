import { boot } from 'quasar/wrappers'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { FirebaseMessaging } from '@capacitor-firebase/messaging'
import { useNotificationStore } from 'src/stores/useNotificationStore'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'

const log = createLogger('PushNotificationsBoot')

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

  function handleTapNavigation(route: string, notificationId: string | undefined) {
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
      handleTapNavigation(data?.route || '/mi-templo', data?.notificationId)
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
      handleTapNavigation(data?.route || '/mi-templo', data?.notificationId)
    })

    const permResult = await FirebaseMessaging.checkPermissions()
    const status =
      permResult.receive === 'granted'
        ? 'granted'
        : permResult.receive === 'denied'
          ? 'denied'
          : 'prompt'
    store.setPermissionStatus(status)

    if (status === 'granted') {
      try {
        const tokenResult = await FirebaseMessaging.getToken()
        store.setFcmToken(tokenResult.token)
        await sendTokenToBackend(tokenResult.token)
      } catch (err: unknown) {
        log.error(
          'Failed to fetch FCM token (ios)',
          err instanceof Error ? { message: err.message } : { message: String(err) },
        )
      }
    }
  }
})
