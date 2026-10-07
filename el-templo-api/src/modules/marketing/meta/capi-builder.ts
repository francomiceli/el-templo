/**
 * Meta CAPI — constructores PUROS de eventos (fase 195, plan 08, D-19).
 *
 * Sin acceso a base ni a red: reciben datos ya resueltos y devuelven el objeto
 * que viaja en `data[]`. `event_id` determinista (`reg-<userId>`,
 * `trial-<bookingId>`, `purchase-<subscriptionId>`): es la idempotencia del
 * outbox y, si algún día el Pixel dispara el mismo evento, la deduplicación.
 *
 * Mapeo de `action_source` [ASUMIDO, research A2: validar con
 * `test_event_code` antes de activar]:
 *   - registro web (app.eltemplo.org)      → `website` (+ url, IP y user agent)
 *   - registro Android / alta del admin    → `system_generated`
 *   - reserva de clase de prueba           → `system_generated`
 *   - primer pago                          → `physical_store` (caja)
 */

import { hashedUserData, type MetaCountry, type MetaUserData } from "./hash";

export type CapiActionSource =
  | "website"
  | "system_generated"
  | "physical_store";

export interface CapiEvent {
  event_name: "CompleteRegistration" | "Schedule" | "Purchase";
  /** Unix en segundos. */
  event_time: number;
  event_id: string;
  action_source: CapiActionSource;
  event_source_url?: string;
  user_data: MetaUserData;
  custom_data?: { value: number; currency: string };
}

export const REGISTER_SOURCE_URL = "https://app.eltemplo.org/register";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Ventana de Meta: 7 días hacia atrás (62 para `physical_store`). */
const WINDOW_MS: Record<CapiActionSource, number> = {
  website: 7 * DAY_MS,
  system_generated: 7 * DAY_MS,
  physical_store: 62 * DAY_MS,
};

/** Datos de la persona, ya resueltos. `country` es el de la sede del alumno. */
export interface CapiPerson {
  userId: number;
  tenantId: number;
  email: string | null;
  phone: string | null;
  country: MetaCountry;
  fbc?: string | null;
  fbp?: string | null;
}

export interface RegistrationEventInput extends CapiPerson {
  eventTime: Date;
  /** 'web' | 'android' | 'admin' (ios y unknown no llegan: D-24). */
  platform: string;
  clientIp?: string | null;
  userAgent?: string | null;
}

export interface TrialEventInput extends CapiPerson {
  bookingId: number;
  eventTime: Date;
}

export interface PurchaseEventInput extends CapiPerson {
  subscriptionId: number;
  eventTime: Date;
  value: number;
  currency: string;
}

const toUnix = (d: Date): number => Math.floor(d.getTime() / 1000);

export function buildRegistrationEvent(
  input: RegistrationEventInput,
): CapiEvent {
  // `website` exige URL y user agent: sin user agent (purgado o nunca guardado)
  // el evento baja a `system_generated` en vez de arriesgar el rechazo del lote.
  const isWeb = input.platform === "web" && !!input.userAgent;
  return {
    event_name: "CompleteRegistration",
    event_time: toUnix(input.eventTime),
    event_id: `reg-${input.userId}`,
    action_source: isWeb ? "website" : "system_generated",
    ...(isWeb ? { event_source_url: REGISTER_SOURCE_URL } : {}),
    user_data: hashedUserData({
      ...input,
      includeClientContext: isWeb,
    }),
  };
}

export function buildTrialEvent(input: TrialEventInput): CapiEvent {
  return {
    event_name: "Schedule",
    event_time: toUnix(input.eventTime),
    event_id: `trial-${input.bookingId}`,
    action_source: "system_generated",
    user_data: hashedUserData(input),
  };
}

export function buildPurchaseEvent(input: PurchaseEventInput): CapiEvent {
  return {
    event_name: "Purchase",
    event_time: toUnix(input.eventTime),
    event_id: `purchase-${input.subscriptionId}`,
    action_source: "physical_store",
    user_data: hashedUserData(input),
    custom_data: { value: input.value, currency: input.currency },
  };
}

/**
 * ¿Meta aceptaría este `event_time`? Hasta 7 días hacia atrás (62 para
 * `physical_store`); un evento a más de 1 hora en el futuro también se
 * rechaza. Un evento fuera de ventana tira abajo el lote entero: se filtra
 * ANTES de enviar.
 */
export function isWithinWindow(
  eventTime: Date,
  actionSource: CapiActionSource,
  now: Date,
): boolean {
  const ageMs = now.getTime() - eventTime.getTime();
  if (ageMs < -HOUR_MS) return false;
  return ageMs <= WINDOW_MS[actionSource];
}
