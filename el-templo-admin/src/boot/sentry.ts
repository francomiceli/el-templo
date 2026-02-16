import { boot } from 'quasar/wrappers';
import * as Sentry from '@sentry/vue';

const IGNORED_ERRORS = [
  'Importing a module script failed',
  'Failed to fetch dynamically imported module',
  'Unable to preload CSS',
  'Load failed',
  'NetworkError when attempting to fetch resource',
  'ResizeObserver loop',
];

function shouldDropEvent(event: Sentry.ErrorEvent): boolean {
  const message = event.exception?.values?.[0]?.value || event.message || '';
  return IGNORED_ERRORS.some((ignored) => message.includes(ignored));
}

export default boot(({ app, router }) => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    app,
    dsn,
    environment: import.meta.env.VITE_APP_ENVIRONMENT || import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration({ router })],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    beforeSend(event) {
      if (shouldDropEvent(event)) return null;
      return event;
    },
  });
});
