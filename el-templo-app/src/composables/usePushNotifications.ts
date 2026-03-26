import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { useNotificationStore } from 'src/stores/useNotificationStore'
import { createLogger } from 'src/utils/logger'

const log = createLogger('PushNotifications')

export function usePushNotifications() {
  const store = useNotificationStore()

  const isNative = Capacitor.isNativePlatform()

  async function checkPermission(): Promise<'prompt' | 'granted' | 'denied'> {
    if (!isNative) return 'denied'
    const result = await PushNotifications.checkPermissions()
    const status =
      result.receive === 'granted'
        ? 'granted'
        : result.receive === 'denied'
          ? 'denied'
          : 'prompt'
    store.setPermissionStatus(status)
    return status
  }

  async function requestPermission(): Promise<boolean> {
    if (!isNative) return false
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
    // On Android 13+, the permission dialog is shown via requestPermissions().
    // For older Android, notifications are always allowed.
    // Re-trigger requestPermission() which shows the OS dialog.
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
