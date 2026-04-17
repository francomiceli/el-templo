import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { FirebaseMessaging } from '@capacitor-firebase/messaging'
import { useNotificationStore } from 'src/stores/useNotificationStore'
import { createLogger } from 'src/utils/logger'

const log = createLogger('PushNotifications')

/**
 * Cross-platform push permission + registration surface.
 * - Android: delegates to @capacitor/push-notifications (FCM via Firebase Android SDK).
 * - iOS: delegates to @capacitor-firebase/messaging (handles APNs→FCM exchange).
 */
export function usePushNotifications() {
  const store = useNotificationStore()
  const isNative = Capacitor.isNativePlatform()
  const platform = isNative ? (Capacitor.getPlatform() as 'ios' | 'android') : null

  function mapReceive(receive: string): 'prompt' | 'granted' | 'denied' {
    if (receive === 'granted') return 'granted'
    if (receive === 'denied') return 'denied'
    return 'prompt'
  }

  async function checkPermission(): Promise<'prompt' | 'granted' | 'denied'> {
    if (!isNative) return 'denied'
    const result =
      platform === 'ios'
        ? await FirebaseMessaging.checkPermissions()
        : await PushNotifications.checkPermissions()
    const status = mapReceive(result.receive)
    store.setPermissionStatus(status)
    return status
  }

  async function requestPermission(): Promise<boolean> {
    if (!isNative) return false

    if (platform === 'ios') {
      const result = await FirebaseMessaging.requestPermissions()
      const granted = result.receive === 'granted'
      store.setPermissionStatus(granted ? 'granted' : 'denied')
      if (granted) {
        try {
          const tokenResult = await FirebaseMessaging.getToken()
          store.setFcmToken(tokenResult.token)
        } catch (err: unknown) {
          log.error('Failed to fetch FCM token after permission grant (ios)', {
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
      return granted
    }

    const result = await PushNotifications.requestPermissions()
    const granted = result.receive === 'granted'
    store.setPermissionStatus(granted ? 'granted' : 'denied')
    if (granted) {
      await PushNotifications.register()
    }
    return granted
  }

  /** Open device notification settings (for denied permission recovery per D-24) */
  async function openNotificationSettings(): Promise<void> {
    if (!isNative) return
    // On Android 13+ and iOS, re-requesting from denied state shows nothing —
    // the OS requires the user to go to Settings. Re-triggering requestPermission
    // is cheap and correctly no-ops when already denied.
    const granted = await requestPermission()
    if (!granted) {
      log.info('User denied notification permission again')
    }
  }

  function cleanup() {
    // No active listeners to clean up in composable
    // Boot file manages global listeners
  }

  return {
    isNative,
    checkPermission,
    requestPermission,
    openNotificationSettings,
    cleanup,
  }
}
