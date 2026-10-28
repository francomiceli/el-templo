/**
 * GA4 client plugin -- carga gtag.js y reporta las vistas de pagina.
 *
 * Guarded by NUXT_PUBLIC_GA4_ID env var.
 * - Argentina (fuera de /es): carga como siempre, sin consentimiento.
 * - /es (Barcelona, RGPD): NO se inserta ningun script hasta que la persona
 *   acepta en el banner (Consent Mode v2, ver utils/analytics-loader.ts). Si
 *   rechazo, nunca se carga. Al entrar a /es desde Argentina por navegacion SPA
 *   se revoca el consentimiento y no se manda page_view.
 * Custom events fired via useAnalytics composable.
 */
import {
  analyticsMode,
  denyConsent,
  isGa4Loaded,
  loadGa4,
  restoreConsent,
} from "~/utils/analytics-loader";

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const ga4Id = config.public.ga4Id as string;
  if (!ga4Id) return;

  const { consentState, load } = useConsent();
  load();
  const router = useRouter();

  // Ruta cuya vista ya mando `config` al cargar (evita duplicar el page_view).
  let configuredPath: string | null = null;

  /** Carga o revoca segun la ruta y el consentimiento. Devuelve el modo aplicado. */
  function apply(
    path: string,
    initial: boolean,
  ): ReturnType<typeof analyticsMode> {
    const mode = analyticsMode(path, consentState.value);
    if (mode === "deny") {
      denyConsent();
      return mode;
    }
    restoreConsent();
    if (!isGa4Loaded()) {
      loadGa4(ga4Id, {
        consentMode: mode === "es-granted" ? "es-granted" : "none",
      });
      // Argentina en la carga inicial queda exactamente como antes.
      if (mode === "es-granted" || !initial) configuredPath = path;
    } else if (mode === "es-granted") {
      loadGa4(ga4Id, { consentMode: "es-granted" });
    }
    return mode;
  }

  apply(window.location.pathname, true);

  // Acepto (o cambio de eleccion) en el banner de /es.
  watch(consentState, () => {
    apply(router.currentRoute.value.path, false);
  });

  // Vistas de pagina en la navegacion SPA.
  router.afterEach((to) => {
    const mode = apply(to.path, false);
    if (mode === "deny") return;
    const alreadySent = configuredPath === to.path;
    configuredPath = null;
    if (alreadySent) return;
    window.gtag?.("event", "page_view", {
      page_path: to.fullPath,
      page_title: document.title,
    });
  });
});
