/**
 * Carga de GA4 (gtag.js) y Meta Pixel (fbevents.js) con dos modos (fase 195,
 * D-04 / D-22). Sin imports de Nuxt: se prueba con un `window` de mentira.
 *
 * - `none`: Argentina. Se carga como siempre, sin consentimiento.
 * - `es-granted`: Barcelona, solo despues de que la persona acepto en el banner.
 *   Google Consent Mode v2: `consent default` denied (los 4 parametros) ANTES
 *   de cualquier `config`, y recien despues `consent update` granted. Pixel:
 *   `revoke` -> `init` -> `grant`.
 *
 * Sin consentimiento en /es no se inserta NINGUN script ni se manda ningun
 * evento (modo "basico" de Consent Mode): `denyConsent()` solo hace falta si
 * antes se cargo en Argentina y la navegacion SPA entra a /es.
 * Los `<script>` solo se crean con `document.createElement` en el cliente,
 * nunca van en el HTML estatico.
 */
/**
 * Una ruta es de Espana si es `/es` o cuelga de `/es/` (nunca `/espacio...`).
 * La usan tambien el head (usePageSeo) y el banner de consentimiento.
 */
export function isEsPath(path: string): boolean {
  const clean = path.split(/[?#]/)[0] ?? path;
  return clean === "/es" || clean.startsWith("/es/");
}

export type ConsentMode = "none" | "es-granted";
export type ConsentValue = "unknown" | "granted" | "denied";
/** `deny` = ni cargar ni mandar eventos. */
export type AnalyticsMode = ConsentMode | "deny";

const GA4_SRC = "https://www.googletagmanager.com/gtag/js?id=";
const PIXEL_SRC = "https://connect.facebook.net/en_US/fbevents.js";

type ConsentParams = {
  ad_storage: "granted" | "denied";
  ad_user_data: "granted" | "denied";
  ad_personalization: "granted" | "denied";
  analytics_storage: "granted" | "denied";
};

function consentParams(value: "granted" | "denied"): ConsentParams {
  return {
    ad_storage: value,
    ad_user_data: value,
    ad_personalization: value,
    analytics_storage: value,
  };
}

let ga4Loaded = false;
let pixelLoaded = false;
// Solo restauramos lo que nosotros denegamos (AR cargado -> navegacion a /es).
let ga4DeniedByUs = false;
let pixelDeniedByUs = false;

/**
 * Que hay que hacer en `path` con el consentimiento `consent`:
 * - fuera de /es: cargar como siempre, salvo que la persona haya rechazado
 *   antes en el banner de /es (el rechazo se respeta en todo el sitio)
 * - en /es: solo con `granted`
 */
export function analyticsMode(
  path: string,
  consent: ConsentValue,
): AnalyticsMode {
  if (isEsPath(path)) return consent === "granted" ? "es-granted" : "deny";
  return consent === "denied" ? "deny" : "none";
}

export function isGa4Loaded(): boolean {
  return ga4Loaded;
}

export function isPixelLoaded(): boolean {
  return pixelLoaded;
}

function ensureGtag(): void {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      // gtag.js solo procesa objetos `arguments` (el snippet oficial), no arrays.
      // eslint-disable-next-line prefer-rest-params
      (window.dataLayer as unknown[]).push(arguments);
    };
  }
}

function appendScript(src: string): void {
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

export function loadGa4(id: string, opts: { consentMode: ConsentMode }): void {
  if (!id) return;
  ensureGtag();
  if (ga4Loaded) {
    // Ya cargado (p. ej. se navego desde Argentina y se acepto en /es).
    if (opts.consentMode === "es-granted") {
      window.gtag?.("consent", "update", consentParams("granted"));
      ga4DeniedByUs = false;
    }
    return;
  }
  ga4Loaded = true;
  if (opts.consentMode === "es-granted") {
    window.gtag?.("consent", "default", consentParams("denied"));
    window.gtag?.("consent", "update", consentParams("granted"));
  }
  appendScript(`${GA4_SRC}${id}`);
  window.gtag?.("js", new Date());
  window.gtag?.("config", id, { send_page_view: true });
}

function ensureFbq(): void {
  if (window.fbq) return;
  // Meta Pixel base code (snippet oficial en forma segura para TypeScript).
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
}

export function loadPixel(
  id: string,
  opts: { consentMode: ConsentMode },
): void {
  if (!id) return;
  ensureFbq();
  if (pixelLoaded) {
    if (opts.consentMode === "es-granted") {
      window.fbq?.("consent", "grant");
      pixelDeniedByUs = false;
    }
    return;
  }
  pixelLoaded = true;
  if (opts.consentMode === "es-granted") {
    window.fbq?.("consent", "revoke");
    window.fbq?.("init", id);
    window.fbq?.("consent", "grant");
  } else {
    window.fbq?.("init", id);
  }
  appendScript(PIXEL_SRC);
  window.fbq?.("track", "PageView");
}

/** Revoca el consentimiento de lo que ya este cargado (no carga nada nuevo). */
export function denyConsent(): void {
  if (ga4Loaded && window.gtag && !ga4DeniedByUs) {
    window.gtag("consent", "update", consentParams("denied"));
    ga4DeniedByUs = true;
  }
  if (pixelLoaded && window.fbq && !pixelDeniedByUs) {
    window.fbq("consent", "revoke");
    pixelDeniedByUs = true;
  }
}

/** Deshace `denyConsent()` al volver a una pagina donde se puede medir. */
export function restoreConsent(): void {
  if (ga4DeniedByUs && window.gtag) {
    window.gtag("consent", "update", consentParams("granted"));
    ga4DeniedByUs = false;
  }
  if (pixelDeniedByUs && window.fbq) {
    window.fbq("consent", "grant");
    pixelDeniedByUs = false;
  }
}
