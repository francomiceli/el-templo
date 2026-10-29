// Módulo: scheduling — constantes de reserva que más de un módulo necesita leer.
// Hoja a propósito (sin imports): `booking-service.ts` arrastra suscripciones,
// notificaciones y más, y quien solo necesita el número no debería cargarlo.

/**
 * Minutos antes de la clase hasta los que el socio puede cancelar una reserva
 * (`BookingService.cancel`). El copy del 400 y el bloque `conditions` de "Mis
 * invitados" salen de este mismo valor.
 */
export const BOOKING_CANCEL_WINDOW_MINUTES = 20;
