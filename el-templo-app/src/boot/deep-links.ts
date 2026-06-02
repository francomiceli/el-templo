import { boot } from 'quasar/wrappers'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useAuthStore } from 'src/stores/useAuthStore'
import { useNotificationStore } from 'src/stores/useNotificationStore'
import { createLogger } from 'src/utils/logger'

const log = createLogger('DeepLinksBoot')

/**
 * Deep linking for the freemium trial campaign (Phase 119, D-25).
 *
 * App Links (Android) / Universal Links (iOS) bind `https://app.eltemplo.org`
 * to the native app via the `.well-known` association files served from that
 * domain (the el-templo-app WEB build — NOT eltemplo.org, the landing). When the
 * native app is installed, tapping `https://app.eltemplo.org/r/trial?t=<token>`
 * opens the app here; without it, the same URL opens the web app (which also
 * mounts this listener — harmless, since the web router already resolves the
 * path) so the user still lands on the Reservas trial screen.
 *
 * D-21: the campaign token (`?t=…`) is NEVER used for authorization. It only
 * triggers navigation; eligibility is fetched server-side via
 * `GET /members/scheduling/trial-eligibility`. We deliberately ignore the token
 * value entirely.
 */
const TRIAL_DEEP_LINK_PATH = '/r/trial'
const TRIAL_TARGET_ROUTE = '/reservas?trial=1'

/**
 * Map an incoming deep-link URL to an in-app route, or null if it is not a
 * recognized deep link. Only the path is honored — the query token is ignored
 * for authorization (D-21).
 */
function resolveDeepLinkRoute(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.pathname.startsWith(TRIAL_DEEP_LINK_PATH)) {
      return TRIAL_TARGET_ROUTE
    }
  } catch {
    // Not a parseable URL — ignore.
  }
  return null
}

export default boot(async ({ router }) => {
  if (!Capacitor.isNativePlatform()) {
    // On web, the browser itself resolves app.eltemplo.org/r/trial through the
    // SPA router; no appUrlOpen listener exists. Nothing to wire up.
    return
  }

  await App.addListener('appUrlOpen', ({ url }) => {
    const target = resolveDeepLinkRoute(url)
    if (!target) {
      log.info('Ignoring unrecognized deep link')
      return
    }

    log.info('Trial deep link opened')

    const authStore = useAuthStore()
    if (!authStore.isAuthenticated) {
      // Logged out: stash the intended route and resume after login (the
      // pendingRoute is consumed post-login, e.g. in MiTemplo on mount).
      useNotificationStore().setPendingRoute(target)
      try {
        void router.push('/login')
      } catch {
        // Router not ready yet — pendingRoute still resumes after login.
      }
      return
    }

    try {
      void router.push(target)
    } catch {
      // Router not ready — fall back to the pendingRoute resume path.
      useNotificationStore().setPendingRoute(target)
    }
  })
})
