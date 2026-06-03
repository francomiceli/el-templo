import { boot } from 'quasar/wrappers'
import * as Sentry from '@sentry/vue'

const IGNORED_ERRORS = [
  'Importing a module script failed',
  'Failed to fetch dynamically imported module',
  'Unable to preload CSS',
  'Load failed',
  'NetworkError when attempting to fetch resource',
  'ResizeObserver loop',
  'Script error.',
  'The play() request was interrupted',
  // iOS/WKWebView equivalent of the above: html5-qrcode's internal video.play()
  // rejects with this AbortError when the user navigates away from /check-in
  // before the camera stream starts. Benign teardown race, not a real failure.
  'The operation was aborted',
]

const DENY_URLS = [
  /extensions\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-extension:\/\//i,
]

function shouldDropEvent(event: Sentry.ErrorEvent): boolean {
  const message = event.exception?.values?.[0]?.value || event.message || ''
  if (IGNORED_ERRORS.some((ignored) => message.includes(ignored))) return true

  const frames = event.exception?.values?.[0]?.stacktrace?.frames || []
  if (frames.some((f) => f.filename && DENY_URLS.some((re) => re.test(f.filename!)))) return true

  return false
}

export default boot(({ app, router }) => {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    app,
    dsn,
    environment: import.meta.env.VITE_APP_ENVIRONMENT || import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration({ router })],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    beforeSend(event) {
      if (shouldDropEvent(event)) return null
      return event
    },
  })
})
