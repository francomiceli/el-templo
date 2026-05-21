import { computed, type ComputedRef } from 'vue'
import { useRoute } from 'vue-router'

/**
 * Phase 115 (Desafío de la Barra) — event window.
 *
 * Hardcoded by SPEC constraint: cambiar las fechas requiere rebuild + redeploy
 * (T-115-05 disposition: accept). Mantener en UTC para evitar drift entre
 * timezones de clientes y servidor.
 *
 * D-04: ventana de 48h desde sábado 23/05/2026 12:00 ART (UTC-3) hasta
 * lunes 25/05/2026 12:00 ART. Expresado en UTC: 2026-05-23T15:00:00Z →
 * 2026-05-25T15:00:00Z.
 */
export const BAR_CHALLENGE_WINDOW = {
  start: '2026-05-23T15:00:00Z',
  end: '2026-05-25T15:00:00Z',
} as const

export interface BarChallengeWindowApi {
  /** ISO string del inicio de la ventana (UTC). */
  start: string
  /** ISO string del fin de la ventana (UTC). */
  end: string
  /**
   * `true` si estamos dentro de la ventana [start, end), o si el query param
   * `?bar-challenge-force=1` está presente (D-06: forzar visibilidad para
   * testing en staging sin esperar a la fecha).
   */
  isActive: ComputedRef<boolean>
  /** `true` si `Date.now() < start` (la ventana todavía no abrió). */
  isBeforeWindow: ComputedRef<boolean>
  /** `true` si `Date.now() >= end` (la ventana ya cerró). */
  isAfterWindow: ComputedRef<boolean>
}

/**
 * Composable de ventana de fechas del Desafío de la Barra.
 *
 * - No subscribe a fuentes externas → no expone `cleanup()`.
 * - Reactivo a cambios en `route.query` (force-flag): los computeds se
 *   reevaluán cuando la URL cambia.
 * - `Date.now()` se lee dentro de cada computed; los consumidores que
 *   necesiten reactividad temporal continua deben programar su propio
 *   re-render (ej: `setInterval`) — este composable no impone política.
 */
export function useBarChallengeWindow(): BarChallengeWindowApi {
  const route = useRoute()

  const startMs = new Date(BAR_CHALLENGE_WINDOW.start).getTime()
  const endMs = new Date(BAR_CHALLENGE_WINDOW.end).getTime()

  const forced = computed(() => route.query['bar-challenge-force'] === '1')

  const isActive = computed<boolean>(() => {
    if (forced.value) return true
    const t = Date.now()
    return t >= startMs && t < endMs
  })

  const isBeforeWindow = computed<boolean>(() => Date.now() < startMs)
  const isAfterWindow = computed<boolean>(() => Date.now() >= endMs)

  return {
    start: BAR_CHALLENGE_WINDOW.start,
    end: BAR_CHALLENGE_WINDOW.end,
    isActive,
    isBeforeWindow,
    isAfterWindow,
  }
}
