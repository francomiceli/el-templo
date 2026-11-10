// Módulo: scheduling — constantes de reserva que más de un módulo necesita leer.
// Hoja a propósito (sin imports): `booking-service.ts` arrastra suscripciones,
// notificaciones y más, y quien solo necesita el número no debería cargarlo.

/**
 * Minutos antes de la clase hasta los que el socio puede reservar, cuando la
 * actividad no define su propio corte (`activities.booking_close_minutes`).
 */
export const DEFAULT_BOOKING_CLOSE_MINUTES = 5;

/**
 * Minutos antes de la clase hasta los que el socio puede cancelar una reserva
 * (`BookingService.cancel`), cuando la actividad no define su propio corte
 * (`activities.cancel_close_minutes`). El bloque `conditions` de "Mis
 * invitados" sale de este mismo valor.
 */
export const BOOKING_CANCEL_WINDOW_MINUTES = 20;

/** Tope de los cortes configurables por actividad: un día entero. */
export const MAX_ACTIVITY_CLOSE_MINUTES = 1440;

/** Corte de reserva efectivo de una actividad (NULL = default global). */
export function effectiveBookingCloseMinutes(
  activityValue: number | null,
): number {
  return activityValue ?? DEFAULT_BOOKING_CLOSE_MINUTES;
}

/** Corte de cancelación efectivo de una actividad (NULL = default global). */
export function effectiveCancelCloseMinutes(
  activityValue: number | null,
): number {
  return activityValue ?? BOOKING_CANCEL_WINDOW_MINUTES;
}
