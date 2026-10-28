/**
 * Meta Pixel client plugin -- carga fbevents.js y dispara el PageView inicial.
 *
 * Guarded by NUXT_PUBLIC_META_PIXEL_ID env var.
 * - Argentina (fuera de /es): carga como siempre, sin consentimiento.
 * - /es (Barcelona, RGPD): NO se inserta ningun script hasta que la persona
 *   acepta (revoke -> init -> grant, ver utils/analytics-loader.ts). Si rechazo,
 *   nunca se carga. Al entrar a /es desde Argentina por navegacion SPA se
 *   revoca el consentimiento y no se manda PageView.
 * Lead events fired via useAnalytics().trackLead() in FranForm.
 */
import {
  analyticsMode,
  denyConsent,
  isPixelLoaded,
  loadPixel,
  restoreConsent,
} from "~/utils/analytics-loader";

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const pixelId = config.public.metaPixelId as string;
  if (!pixelId) return;

  const { consentState, load } = useConsent();
  load();
  const router = useRouter();

  // Ruta cuya vista ya mando el PageView al cargar (evita duplicarlo).
  let trackedPath: string | null = null;

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
    if (!isPixelLoaded()) {
      loadPixel(pixelId, {
        consentMode: mode === "es-granted" ? "es-granted" : "none",
      });
      // Argentina en la carga inicial queda exactamente como antes.
      if (mode === "es-granted" || !initial) trackedPath = path;
    } else if (mode === "es-granted") {
      loadPixel(pixelId, { consentMode: "es-granted" });
    }
    return mode;
  }

  apply(window.location.pathname, true);

  // Acepto (o cambio de eleccion) en el banner de /es.
  watch(consentState, () => {
    apply(router.currentRoute.value.path, false);
  });

  // PageView en la navegacion SPA.
  router.afterEach((to) => {
    const mode = apply(to.path, false);
    if (mode === "deny") return;
    const alreadySent = trackedPath === to.path;
    trackedPath = null;
    if (alreadySent) return;
    window.fbq?.("track", "PageView");
  });
});
