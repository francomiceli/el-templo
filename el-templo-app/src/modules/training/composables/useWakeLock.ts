import { ref, onMounted, onUnmounted } from 'vue'
import { Capacitor } from '@capacitor/core'

/**
 * Wake lock composable for keeping the screen awake during workouts
 *
 * Provides a unified API for both web (Screen Wake Lock API) and native
 * (Capacitor KeepAwake plugin) platforms. The composable automatically
 * detects the platform and uses the appropriate implementation.
 *
 * Key behaviors:
 * - Automatically re-acquires wake lock on visibility change (when app returns to foreground)
 * - Gracefully handles browsers/platforms that don't support wake lock
 * - Provides reactive state for UI feedback
 *
 * @returns Wake lock control object
 */
export function useWakeLock() {
  /** Whether wake lock is currently active */
  const isActive = ref(false)

  /** Whether wake lock is supported on this platform */
  const isSupported = ref(false)

  /** Internal reference to web WakeLockSentinel */
  let wakeLockSentinel: WakeLockSentinel | null = null

  /** Reference to KeepAwake module (loaded dynamically on native) */
  let KeepAwakeModule: { keepAwake(): Promise<void>; allowSleep(): Promise<void> } | null = null

  /**
   * Initialize wake lock support detection and load native module if needed
   */
  async function initialize(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      // Native platform - try to load KeepAwake plugin
      try {
        const module = await import('@capacitor-community/keep-awake')
        KeepAwakeModule = module.KeepAwake
        isSupported.value = true
      } catch {
        // Plugin not installed or not available
        console.warn('KeepAwake plugin not available on native platform')
        isSupported.value = false
      }
    } else {
      // Web platform - check for Screen Wake Lock API
      isSupported.value = 'wakeLock' in navigator
    }
  }

  /**
   * Request wake lock to keep screen awake
   *
   * On web, uses Screen Wake Lock API
   * On native, uses @capacitor-community/keep-awake plugin
   *
   * @returns true if wake lock was acquired, false otherwise
   */
  async function requestWakeLock(): Promise<boolean> {
    if (!isSupported.value) {
      return false
    }

    try {
      if (Capacitor.isNativePlatform() && KeepAwakeModule) {
        // Native platform
        await KeepAwakeModule.keepAwake()
        isActive.value = true
        return true
      } else if ('wakeLock' in navigator) {
        // Web platform
        wakeLockSentinel = await navigator.wakeLock.request('screen')

        // Listen for wake lock release (e.g., when tab becomes hidden)
        wakeLockSentinel.addEventListener('release', () => {
          isActive.value = false
        })

        isActive.value = true
        return true
      }
    } catch (err) {
      // Wake lock request can fail (e.g., low battery, permission denied)
      console.warn('Failed to acquire wake lock:', err)
      isActive.value = false
    }

    return false
  }

  /**
   * Release wake lock to allow screen to sleep
   */
  async function releaseWakeLock(): Promise<void> {
    if (Capacitor.isNativePlatform() && KeepAwakeModule) {
      try {
        await KeepAwakeModule.allowSleep()
      } catch (err) {
        console.warn('Failed to release native wake lock:', err)
      }
    } else if (wakeLockSentinel) {
      try {
        await wakeLockSentinel.release()
        wakeLockSentinel = null
      } catch (err) {
        console.warn('Failed to release web wake lock:', err)
      }
    }

    isActive.value = false
  }

  /**
   * Handle visibility change to re-acquire wake lock when app comes back to foreground
   */
  function handleVisibilityChange(): void {
    if (document.visibilityState === 'visible' && isActive.value) {
      // Page became visible and we had an active wake lock - try to re-acquire
      // The web wake lock is automatically released when page becomes hidden
      if (!Capacitor.isNativePlatform()) {
        void requestWakeLock()
      }
    }
  }

  // Lifecycle hooks
  onMounted(async () => {
    await initialize()
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    void releaseWakeLock()
  })

  return {
    /** Whether wake lock is currently active */
    isActive,
    /** Whether wake lock is supported on this platform */
    isSupported,
    /** Request wake lock to keep screen awake */
    requestWakeLock,
    /** Release wake lock to allow screen to sleep */
    releaseWakeLock,
  }
}
