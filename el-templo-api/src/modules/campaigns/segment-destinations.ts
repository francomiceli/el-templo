/**
 * Mapa cerrado de destinos por segmento (Phase 180, D-13).
 *
 * Traduce un `CampaignSegment` (audience-service.ts / D-11/D-12) a una CLAVE
 * SIMBÓLICA que la app interpreta como su propia ruta interna — nunca una URL.
 * Es la mitigación central de T-180-28 (open redirect): por el cable del canje
 * (`POST /api/campaigns/exchange`) jamás viaja nada parecido a un path o un
 * host; solo una de las tres claves de {@link MAGIC_LINK_DESTINATIONS}.
 *
 * El deep link del email (`deepLinkForSegment`, consumido hoy solo por
 * `CampaignService.trialDeepLink` vía `freemium_elegibles`) sigue componiendo
 * SOBRE `TRIAL_DEEP_LINK_BASE` (mismo host `app.eltemplo.org`, mismo path
 * `/r/trial`) — los `.well-known` (assetlinks + AASA) de la fase 119 cubren
 * exactamente ese path; un path nuevo rompería el deep link nativo. La
 * `CLICK_REDIRECT_ALLOWLIST_HOST` de `routes.ts` no se toca ni se relaja
 * (Pitfall 13 del research).
 */

import type { CampaignSegment } from "./types";
import { TRIAL_DEEP_LINK_BASE } from "./service";

/**
 * Las 3 claves simbólicas de destino post-canje. La app las traduce a su
 * propia ruta interna — nunca viajan como URL (T-180-28).
 */
export const MAGIC_LINK_DESTINATIONS = [
  "reservas-prueba",
  "volver",
  "reservas",
] as const;

export type MagicLinkDestination = (typeof MAGIC_LINK_DESTINATIONS)[number];

/**
 * Destino por segmento (D-13), exhaustivo sobre los 5 segmentos de D-12:
 *   - `freemium_elegibles` → `reservas-prueba` (D-13, el caso original de la
 *     campaña freemium)
 *   - `bajas` → `volver` (D-13)
 *   - `prueba_no_convertida` → `volver` (D-13)
 *   - `alerta_ausente` → `reservas` (D-13)
 *   - `referidos_pendientes` → `reservas-prueba` — D-13 enumera destinos para
 *     CUATRO segmentos y no menciona este quinto. Se le asigna
 *     `reservas-prueba` como DECISIÓN DE PLANIFICACIÓN que cubre ese hueco: un
 *     referido pendiente que nunca calificó (D-10) sigue siendo, en esencia,
 *     un lead sin sesión de prueba agendada — la oferta correcta es la misma
 *     que `freemium_elegibles`. La elegibilidad real de la sesión de prueba la
 *     sigue gateando el server del lado de la app, no este mapa.
 */
export function destinationForSegment(
  segment: CampaignSegment,
): MagicLinkDestination {
  switch (segment) {
    case "freemium_elegibles":
      return "reservas-prueba";
    case "bajas":
      return "volver";
    case "prueba_no_convertida":
      return "volver";
    case "alerta_ausente":
      return "reservas";
    case "referidos_pendientes":
      return "reservas-prueba";
  }
}

/**
 * Compone el deep link de login para un segmento, SOBRE `TRIAL_DEEP_LINK_BASE`
 * (mismo host/path que `CampaignService.trialDeepLink` — no se relaja la
 * allowlist de `routes.ts`). `?t=` lleva el token (el mismo string firmado que
 * la app manda a `POST /exchange`); `?d=` lleva la clave simbólica del
 * destino, para que la app pueda decidir a dónde navegar apenas canjea.
 */
export function deepLinkForSegment(
  segment: CampaignSegment,
  token: string,
): string {
  const destination = destinationForSegment(segment);
  return `${TRIAL_DEEP_LINK_BASE}?t=${encodeURIComponent(token)}&d=${destination}`;
}

/**
 * Compat: el deep link freemium original (D-25), ahora delegado en
 * {@link deepLinkForSegment}. `CampaignService.trialDeepLink` puede migrar a
 * llamar esto directamente sin cambiar ningún comportamiento observable.
 */
export function trialDeepLink(token: string): string {
  return deepLinkForSegment("freemium_elegibles", token);
}
