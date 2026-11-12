/**
 * Ventana de check-in alrededor del INICIO de una clase: una llegada cuenta
 * para esa clase si cae hasta 20 minutos antes o después de su hora de inicio.
 *
 * ÚNICA definición. La usan:
 *   - el check-in QR del socio (`attendance/service.ts`), para encontrar su
 *     reserva del día;
 *   - el check-in de Wellhub sin reserva (`wellhub/walk-in-schedule.ts`), para
 *     ubicar la visita en la clase que estaba por empezar o recién empezaba.
 * Si cambia, cambia para los dos: así una visita Wellhub y un QR del mismo
 * minuto siempre caen en la misma clase.
 */
export const CHECKIN_WINDOW_MS = 20 * 60 * 1000;
