import { boot } from 'quasar/wrappers'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useAuthStore } from 'src/stores/useAuthStore'
import { useNotificationStore } from 'src/stores/useNotificationStore'
import { useMagicLink, resolveMagicLinkRoute } from 'src/composables/useMagicLink'
import { createLogger } from 'src/utils/logger'

const log = createLogger('DeepLinksBoot')

/**
 * Deep linking for the freemium trial campaign (Phase 119, D-25) and, since
 * phase 180 (D-01), for magic-link login on the native surface.
 *
 * App Links (Android) / Universal Links (iOS) bind `https://app.eltemplo.org`
 * to the native app via the `.well-known` association files served from that
 * domain (the el-templo-app WEB build — NOT eltemplo.org, the landing). When
 * the native app is installed, tapping `https://app.eltemplo.org/r/trial?t=<token>`
 * opens the app here instead of the browser, so `MagicLinkPage.vue` (the web
 * landing built in plan 180-11) never runs on this surface — this listener is
 * the only place a phone with the app already installed can redeem the token.
 *
 * D-01 (phase 180): a `purpose:'login'` token carried in `?t=` is exchanged
 * for a session here, through the same `useMagicLink().exchange()` composable
 * that `MagicLinkPage.vue` uses on the web. The destination is always
 * resolved from the closed `MAGIC_LINK_ROUTE_BY_DESTINATION` map (via
 * `resolveMagicLinkRoute`) — never taken verbatim from the URL.
 */
const TRIAL_DEEP_LINK_PATH = '/r/trial'
const TRIAL_TARGET_ROUTE = '/reservas?trial=1'

/**
 * Maps an incoming deep-link URL to an in-app route, or null if it is not a
 * recognized deep link path. Only the path decides whether this is a
 * recognized deep link — the query is read separately by
 * `extractDeepLinkToken` and the `?d=` hint below.
 */
export function resolveDeepLinkRoute(url: string): string | null {
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

/** Extracts the magic-link token (`?t=`) from a deep-link URL, or null. */
export function extractDeepLinkToken(url: string): string | null {
  try {
    const parsed = new URL(url)
    const token = parsed.searchParams.get('t')
    return token ? token : null
  } catch {
    return null
  }
}

/**
 * Resolves the `?d=` destination hint through the same closed map the
 * exchange success path uses — an unrecognized or manipulated hint falls
 * back to the fixed trial route, same anti open-redirect guarantee as
 * `resolveMagicLinkRoute` itself.
 */
function resolveDestinationHint(url: string): string {
  try {
    const parsed = new URL(url)
    return resolveMagicLinkRoute(parsed.searchParams.get('d') ?? '')
  } catch {
    return TRIAL_TARGET_ROUTE
  }
}

export default boot(async ({ router }) => {
  if (!Capacitor.isNativePlatform()) {
    // On web, the browser itself resolves app.eltemplo.org/r/trial through the
    // SPA router; no appUrlOpen listener exists. Nothing to wire up.
    return
  }

  /**
   * Redeems the token BEFORE any navigation decision — the session must be
   * persisted (and `authStore.isAuthenticated` updated) regardless of
   * whether `router.push` below succeeds, so the exchange never runs inside
   * the navigation `try` blocks that handle a cold-start app.
   */
  async function exchangeAndResolveTarget(url: string, token: string): Promise<string> {
    const { exchange } = useMagicLink()
    const result = await exchange(token)
    return result.ok ? resolveMagicLinkRoute(result.destination) : resolveDestinationHint(url)
  }

  async function handleAppUrlOpen(url: string): Promise<void> {
    const recognized = resolveDeepLinkRoute(url)
    if (!recognized) {
      log.info('Ignoring unrecognized deep link')
      return
    }

    log.info('Trial deep link opened')

    const token = extractDeepLinkToken(url)
    const target = token ? await exchangeAndResolveTarget(url, token) : recognized

    const authStore = useAuthStore()
    if (!authStore.isAuthenticated) {
      // Logged out: stash the intended route and resume after login (the
      // pendingRoute is consumed post-login, e.g. in MiTemplo on mount). The
      // session redeemed above (if any) is already persisted at this point.
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
  }

  await App.addListener('appUrlOpen', ({ url }) => {
    void handleAppUrlOpen(url)
  })
})
