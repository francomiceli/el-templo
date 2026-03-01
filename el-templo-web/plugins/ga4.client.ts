/**
 * GA4 client plugin -- loads gtag.js and configures page view tracking.
 *
 * Guarded by NUXT_PUBLIC_GA4_ID env var.
 * Page views tracked automatically via gtag config.
 * Custom events fired via useAnalytics composable.
 */
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const ga4Id = config.public.ga4Id as string;
  if (!ga4Id) return;

  // Load gtag.js script
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${ga4Id}`;
  document.head.appendChild(script);

  // Initialize dataLayer and gtag function
  window.dataLayer = window.dataLayer || [];
  window.gtag = function (...args: unknown[]) {
    (window.dataLayer as unknown[]).push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", ga4Id, {
    send_page_view: true,
  });

  // Track page views on route change (SPA navigation)
  const router = useRouter();
  router.afterEach((to) => {
    window.gtag?.("event", "page_view", {
      page_path: to.fullPath,
      page_title: document.title,
    });
  });
});
