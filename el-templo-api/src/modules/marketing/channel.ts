// Módulo: marketing — clasificador de canal de alta (fase 195, plan 07, D-18/D-21.1).
//
// `classifyChannel` es PURO: recibe lo crudo que se guarda en
// `signup_attributions` y devuelve el canal. Se ejecuta en el server (nunca se
// confía en un canal enviado por el cliente) y se puede volver a correr sobre
// las filas guardadas si cambian las reglas o la lista de hosts de IA.
//
// PRIORIDAD (de mayor a menor):
//   origen manual del admin > IA > utm/click ids explícitos > ref > promo >
//   referrer > directo
// El tráfico de IA gana a todo lo automático: ChatGPT agrega
// `utm_source=chatgpt.com` y muchos asistentes mandan referrer, y es lo que
// Franco quiere medir aparte de "web" u "otro sitio".

export const CHANNELS = [
  "ia",
  "meta_ads",
  "google_ads",
  "google_maps",
  "instagram",
  "facebook",
  "buscador",
  "qr",
  "email",
  "referido",
  "promo",
  "web",
  "otro_sitio",
  "presencial",
  "otro",
  "directo",
] as const;

export type Channel = (typeof CHANNELS)[number];

/**
 * Hosts de asistentes de IA. Coincide por igualdad o por sufijo `.dominio`
 * (p. ej. `www.perplexity.ai`, `chat.deepseek.com`). Lista mantenible: agregar
 * acá un asistente nuevo alcanza para clasificar referrer y `utm_source`.
 */
export const AI_HOSTS = [
  "chatgpt.com",
  "chat.openai.com",
  "openai.com",
  "perplexity.ai",
  "gemini.google.com",
  "bard.google.com",
  "copilot.microsoft.com",
  "copilot.cloud.microsoft",
  "claude.ai",
  "you.com",
  "meta.ai",
  "grok.com",
  "chat.deepseek.com",
  "deepseek.com",
  "poe.com",
] as const;

/**
 * Valores de `utm_source` sin dominio que identifican un asistente de IA
 * (`utm_source=perplexity`). `meta` NO está: es la etiqueta de los anuncios de
 * Meta (el dominio `meta.ai` sí está en AI_HOSTS).
 */
const AI_SOURCE_NAMES: ReadonlySet<string> = new Set([
  "chatgpt",
  "openai",
  "perplexity",
  "gemini",
  "copilot",
  "claude",
  "deepseek",
  "grok",
  "poe",
]);

/**
 * Orígenes que recepción elige a mano en el alta de Sesión de Prueba ("¿Cómo
 * nos conoció?"). Los mismos 9 valores viajan en el select del admin y en el
 * schema de `POST /api/admin/members/trial`.
 */
export const MANUAL_ORIGINS = [
  "instagram",
  "meta_ads",
  "google",
  "web",
  "ia",
  "referido",
  "volante_qr",
  "paso_por_la_puerta",
  "otro",
] as const;

export type ManualOrigin = (typeof MANUAL_ORIGINS)[number];

/** Canal al que mapea cada origen manual (todos pertenecen a CHANNELS). */
export const MANUAL_ORIGIN_CHANNEL: Record<ManualOrigin, Channel> = {
  instagram: "instagram",
  meta_ads: "meta_ads",
  google: "buscador",
  web: "web",
  ia: "ia",
  referido: "referido",
  volante_qr: "qr",
  paso_por_la_puerta: "presencial",
  otro: "otro",
};

export interface ChannelInput {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrerHost?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  refCode?: string | null;
  promoCode?: string | null;
  manualOrigin?: string | null;
}

const META_SOURCES: ReadonlySet<string> = new Set([
  "meta",
  "facebook",
  "fb",
  "instagram",
  "ig",
]);
const INSTAGRAM_SOURCES: ReadonlySet<string> = new Set(["instagram", "ig"]);
const PAID_MEDIUMS: ReadonlySet<string> = new Set([
  "paid",
  "cpc",
  "ppc",
  "paid_social",
  "ads",
]);
const QR_SOURCES: ReadonlySet<string> = new Set(["qr", "flyer", "volante"]);
const EMAIL_SOURCES: ReadonlySet<string> = new Set(["email", "newsletter"]);
const GBP_SOURCES: ReadonlySet<string> = new Set([
  "gbp",
  "google_maps",
  "google-maps",
  "maps",
]);
const GBP_MEDIUMS: ReadonlySet<string> = new Set(["gbp", "maps", "local"]);

const SEARCH_HOST_RE = /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/;
const SEARCH_HOSTS: readonly string[] = [
  "bing.com",
  "duckduckgo.com",
  "search.yahoo.com",
];

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Host en minúsculas; tolera que llegue una URL entera o con puerto. */
function normalizeHost(value: string | null | undefined): string {
  let host = clean(value);
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  host = host.split(/[/?#]/)[0] ?? "";
  host = host.replace(/:\d+$/, "");
  return host;
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function isAiHost(host: string): boolean {
  return AI_HOSTS.some((domain) => hostMatches(host, domain));
}

function isAiSource(source: string): boolean {
  if (source === "") return false;
  return isAiHost(normalizeHost(source)) || AI_SOURCE_NAMES.has(source);
}

/** eltemplo.org y cualquier subdominio (www, app). */
function isOwnHost(host: string): boolean {
  return hostMatches(host, "eltemplo.org");
}

function classifyReferrerHost(host: string): Channel {
  if (hostMatches(host, "instagram.com")) return "instagram";
  if (hostMatches(host, "facebook.com") || hostMatches(host, "fb.com")) {
    return "facebook";
  }
  if (/^maps\.google\./.test(host)) return "google_maps";
  if (SEARCH_HOST_RE.test(host)) return "buscador";
  if (SEARCH_HOSTS.some((domain) => hostMatches(host, domain))) {
    return "buscador";
  }
  if (isOwnHost(host)) return "web";
  return "otro_sitio";
}

/**
 * Clasifica el origen de un alta. Nunca lanza: entradas vacías o raras dan
 * `directo` (o `otro` si hay un utm que no se reconoce).
 */
export function classifyChannel(input: ChannelInput): Channel {
  const manual = clean(input.manualOrigin);
  if ((MANUAL_ORIGINS as readonly string[]).includes(manual)) {
    return MANUAL_ORIGIN_CHANNEL[manual as ManualOrigin];
  }

  const source = clean(input.utmSource);
  const medium = clean(input.utmMedium);
  const campaign = clean(input.utmCampaign);
  const referrerHost = normalizeHost(input.referrerHost);
  const hasGclid = clean(input.gclid) !== "";
  const hasFbclid = clean(input.fbclid) !== "";

  // 1. IA: referrer o utm_source, gana a todo lo demás.
  if (referrerHost !== "" && isAiHost(referrerHost)) return "ia";
  if (isAiSource(source)) return "ia";

  // 2. utm / click ids explícitos.
  const paid = PAID_MEDIUMS.has(medium);
  if (medium === "qr" || QR_SOURCES.has(source)) return "qr";
  if (medium === "email" || EMAIL_SOURCES.has(source)) return "email";
  if (META_SOURCES.has(source)) {
    if (paid || source === "meta") return "meta_ads";
    return INSTAGRAM_SOURCES.has(source) ? "instagram" : "facebook";
  }
  if (GBP_SOURCES.has(source)) return "google_maps";
  if (source === "google") {
    if (paid || hasGclid) return "google_ads";
    if (campaign.startsWith("gbp") || GBP_MEDIUMS.has(medium)) {
      return "google_maps";
    }
    return "buscador";
  }
  if (hasGclid) return "google_ads";
  if (hasFbclid && source === "") return "meta_ads";
  if (source !== "" || medium !== "") return "otro";

  // 3. ref, 4. promo.
  if (clean(input.refCode) !== "") return "referido";
  if (clean(input.promoCode) !== "") return "promo";

  // 5. referrer.
  if (referrerHost !== "") return classifyReferrerHost(referrerHost);

  return "directo";
}
