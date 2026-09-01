import { boot } from 'quasar/wrappers';
import * as Sentry from '@sentry/vue';

const IGNORED_ERRORS = [
  'Importing a module script failed',
  'Failed to fetch dynamically imported module',
  'Unable to preload CSS',
  'Load failed',
  'NetworkError when attempting to fetch resource',
  'ResizeObserver loop',
  'Script error.',
];

const DENY_URLS = [
  /extensions\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-extension:\/\//i,
];

function shouldDropEvent(event: Sentry.ErrorEvent): boolean {
  const message = event.exception?.values?.[0]?.value || event.message || '';
  if (IGNORED_ERRORS.some((ignored) => message.includes(ignored))) return true;

  const frames = event.exception?.values?.[0]?.stacktrace?.frames || [];
  if (frames.some((f) => f.filename && DENY_URLS.some((re) => re.test(f.filename!)))) return true;

  // 401 noise: when the admin's session expires, parallel API requests all
  // 401. The axios interceptor already redirected to /login, but the catches
  // downstream still call log.error → Sentry. Drop those — not actionable.
  const extra = event.extra || {};
  for (const value of Object.values(extra)) {
    if (typeof value === 'string' && value.includes('status code 401')) return true;
  }

  return false;
}

export default boot(({ app, router }) => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    app,
    dsn,
    environment: import.meta.env.VITE_APP_ENVIRONMENT || import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration({ router })],
    // Solo usamos Sentry para ERRORES, no para performance/traces. Se baja el
    // muestreo de tracing para no quemar la cuota de spans (los errores son
    // cuota aparte y no se ven afectados). Admin es bajo volumen (staff).
    tracesSampleRate: import.meta.env.PROD ? 0.05 : 1.0,
    beforeSend(event) {
      if (shouldDropEvent(event)) return null;
      return event;
    },
  });
});
