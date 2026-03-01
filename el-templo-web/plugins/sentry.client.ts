import * as Sentry from "@sentry/vue";

const IGNORED_ERRORS = [
  "Importing a module script failed",
  "Failed to fetch dynamically imported module",
  "Unable to preload CSS",
  "Load failed",
  "NetworkError when attempting to fetch resource",
  "ResizeObserver loop",
  "Script error.",
];

const DENY_URLS = [
  /extensions\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-extension:\/\//i,
];

function shouldDropEvent(event: Sentry.ErrorEvent): boolean {
  const message = event.exception?.values?.[0]?.value || event.message || "";
  if (IGNORED_ERRORS.some((ignored) => message.includes(ignored))) return true;

  const frames = event.exception?.values?.[0]?.stacktrace?.frames || [];
  if (
    frames.some(
      (f) => f.filename && DENY_URLS.some((re) => re.test(f.filename!)),
    )
  )
    return true;

  return false;
}

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig();
  const dsn = config.public.sentryDsn;
  if (!dsn) return;

  const router = useRouter();

  Sentry.init({
    app: nuxtApp.vueApp,
    dsn,
    environment:
      (config.public.appEnvironment as string) || import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration({ router })],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    initialScope: {
      tags: { app_name: "web" },
    },
    beforeSend(event) {
      if (shouldDropEvent(event)) return null;
      return event;
    },
  });
});
