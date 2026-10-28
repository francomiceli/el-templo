/**
 * Latencia artificial para desarrollo (fase 203, SC-6).
 *
 * La API responde en ~11 ms en local, así que los estados intermedios y las
 * carreras entre pedidos (los "parpadeos") no se ven. Con `VITE_DEV_LATENCY_MS`
 * el interceptor de `boot/axios.ts` demora cada pedido; el jitter (0.5x-1.5x)
 * cambia el ORDEN de llegada entre pedidos, que es lo que destapa las carreras.
 *
 * Solo para reproducir red lenta en local. El interceptor vive dentro de
 * `if (import.meta.env.DEV)` (Vite lo elimina en `quasar build`) y además
 * `parseDevLatencyMs` devuelve 0 si no es desarrollo.
 */

/** Tope para no colgar la app en desarrollo con un valor desmedido. */
export const DEV_LATENCY_MAX_MS = 10_000

/**
 * Interpreta el valor crudo de `VITE_DEV_LATENCY_MS`.
 * Devuelve 0 (sin latencia) si no es desarrollo, si falta, si no es numérico
 * o si es <= 0. Se limita a `DEV_LATENCY_MAX_MS`.
 */
export function parseDevLatencyMs(raw: string | undefined, isDev: boolean): number {
  if (!isDev || raw === undefined || raw.trim() === '') return 0
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(Math.round(value), DEV_LATENCY_MAX_MS)
}

/**
 * Demora con jitter: `base * (0.5 + rand)`, con `rand` en [0, 1) → 0.5x a 1.5x.
 * Base 0 → 0.
 */
export function jitteredDelayMs(baseMs: number, rand: number): number {
  if (baseMs <= 0) return 0
  return Math.round(baseMs * (0.5 + rand))
}
