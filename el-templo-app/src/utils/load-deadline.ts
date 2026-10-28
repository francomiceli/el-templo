/**
 * Tope de carga de la UI (fase 203, D-07).
 *
 * Pasado este tiempo sin respuesta, una card deja de mostrar el esqueleto: muestra solo lo que
 * sabe (o se oculta) y se completa sola cuando llega el dato. Nunca se inventa una respuesta.
 *
 * - Se eligió 6 s dentro del rango de 6-8 s de D-07: el boot ya pudo esperar hasta 8 s con
 *   `BOOT_NETWORK_TIMEOUT_MS` (boot/auth.ts), así que el peor caso visible para el socio es
 *   8 + 6 s, no más.
 * - Es un timer de UI (`useLoadDeadline`) y no un timeout de red: en nativo `CapacitorHttp`
 *   reemplaza el XHR y no aplica el `timeout` de axios, así que el tope no puede depender de
 *   que el pedido falle.
 */
export const LOAD_DEADLINE_MS = 6000
