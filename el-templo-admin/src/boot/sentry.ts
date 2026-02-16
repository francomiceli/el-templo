import { boot } from 'quasar/wrappers';
import * as Sentry from '@sentry/vue';

export default boot(({ app, router }) => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    app,
    dsn,
    environment: import.meta.env.VITE_APP_ENVIRONMENT || import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration({ router })],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
  });
});
