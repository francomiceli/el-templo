import { boot } from 'quasar/wrappers'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { useNotificationStore } from 'src/stores/useNotificationStore'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'

const log = createLogger('PushNotificationsBoot')

export default boot(async ({ router }) => {
  if (!Capacitor.isNativePlatform()) {
    log.info('Not a native platform, skipping push notification setup')
    return
  }

  const store = useNotificationStore()

  // Listener: FCM token received after registration (per D-26)
  await PushNotifications.addListener('registration', async (token) => {
    log.info('FCM token received')
    store.setFcmToken(token.value)
    try {
      await api.post('/notifications/token', {
        token: token.value,
        platform: Capacitor.getPlatform(), // 'android' or 'ios'
      })
      log.info('FCM token registered with backend')
    } catch (err: unknown) {
      log.error(
        'Failed to register FCM token with backend',
        err instanceof Error ? { message: err.message } : { message: String(err) },
      )
    }
  })

  // Listener: Registration error
  await PushNotifications.addListener('registrationError', (error) => {
    log.error('Push notification registration failed', { error: error.error })
  })

  // Listener: Notification received while app in foreground (per D-29 -- suppress)
  await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    log.info('Foreground notification suppressed', {
      title: notification.title,
    })
    // Per D-29: Do NOT show anything when app is in foreground
  })

  // Listener: Notification tapped (background or cold start) (per D-28, D-30, D-32)
  await PushNotifications.addListener('pushNotificationActionPerformed', async (action) => {
    const data = action.notification.data as Record<string, string> | undefined
    const route = data?.route || '/mi-templo'
    const notificationId = data?.notificationId

    log.info('Notification tapped', { route, notificationId })

    // Report opened to backend (per D-32)
    if (notificationId) {
      try {
        await api.post(`/notifications/${notificationId}/opened`)
      } catch (err: unknown) {
        log.error(
          'Failed to report notification opened',
          err instanceof Error ? { message: err.message } : { message: String(err) },
        )
      }
    }

    // Navigate to target route (per D-28)
    // If router is ready, navigate immediately. Otherwise store as pending.
    try {
      router.push(route)
    } catch {
      store.setPendingRoute(route)
    }
  })

  // Check current permission status
  const permResult = await PushNotifications.checkPermissions()
  store.setPermissionStatus(
    permResult.receive === 'granted'
      ? 'granted'
      : permResult.receive === 'denied'
        ? 'denied'
        : 'prompt',
  )

  // If already granted, register to refresh token (per D-26: send on every launch)
  if (permResult.receive === 'granted') {
    try {
      await PushNotifications.register()
    } catch (err: unknown) {
      log.error(
        'Failed to register for push notifications',
        err instanceof Error ? { message: err.message } : { message: String(err) },
      )
    }
  }
})
