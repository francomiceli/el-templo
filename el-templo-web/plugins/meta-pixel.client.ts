/**
 * Meta Pixel client plugin -- loads fbevents.js and fires initial PageView.
 *
 * Guarded by NUXT_PUBLIC_META_PIXEL_ID env var.
 * Lead events fired via useAnalytics().trackLead() in FranForm.
 */
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const pixelId = config.public.metaPixelId as string;
  if (!pixelId) return;

  // Meta Pixel base code (adapted from official snippet to TypeScript-safe form)
  const n = (window.fbq = function (...args: unknown[]) {
    if ((n as { callMethod?: (...a: unknown[]) => void }).callMethod) {
      (n as { callMethod: (...a: unknown[]) => void }).callMethod(...args);
    } else {
      ((n as { queue?: unknown[] }).queue ??= []).push(args);
    }
  }) as unknown as Record<string, unknown>;
  n.push = n as unknown as (...args: unknown[]) => number;
  n.loaded = true;
  n.version = "2.0";
  n.queue = [];

  // Load fbevents.js
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  // Initialize and fire PageView
  window.fbq?.("init", pixelId);
  window.fbq?.("track", "PageView");

  // Track page views on route change
  const router = useRouter();
  router.afterEach(() => {
    window.fbq?.("track", "PageView");
  });
});
