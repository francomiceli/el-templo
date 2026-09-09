/**
 * Mensaje único para fallas de red del cliente (la request no obtuvo respuesta:
 * sin internet, server inalcanzable o timeout). Lo setea `axios.ts` en su único
 * choke-point de respuestas, así todo consumidor de `err.message` muestra el
 * mismo copy en castellano.
 *
 * Se comparte con `sentry.ts` para NO reportar estos cortes de conexión como
 * errores: son problemas del dispositivo del alumno, no bugs de la app, y las
 * llamadas que fallan por red son fail-open (dejan la UI con su fallback). Al
 * vivir la string en un solo lugar, el filtro de Sentry no se desincroniza si
 * el copy cambia.
 */
export const NETWORK_ERROR_MESSAGE = 'Error de red. Revisá tu conexión a internet.'
