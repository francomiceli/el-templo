import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createLogger } from 'src/utils/logger'

const logger = createLogger('bar-challenge-store')

/**
 * Resultado final del intento del usuario.
 *
 * - `completed=true` → el usuario aguantó suficiente para validar la medalla
 *   (criterio exacto definido por el backend / Plan 04).
 * - `seconds` → segundos aguantados (entero >= 0).
 */
export interface BarChallengeAttemptResult {
  completed: boolean
  seconds: number
}

/**
 * Phase 115 — Desafío de la Barra store skeleton.
 *
 * Este plan (115-02) sólo define el shape. La implementación real de las
 * acciones vive en Plan 05 (timer + envío de foto + integración con endpoint
 * de Plan 04). Las acciones acá son stubs que loggean y no mutan estado.
 *
 * Convención del proyecto:
 * - Pinia setup store (`defineStore(id, () => { ... })`) como sessionPlayerStore.
 * - Logger via `createLogger`, nunca `console.*`.
 */
export const useBarChallengeStore = defineStore('barChallenge', () => {
  // State ───────────────────────────────────────────────────────────────────
  const startTimestamp = ref<number | null>(null)
  const secondsHeld = ref<number>(0)
  const isRunning = ref<boolean>(false)
  const photoBase64 = ref<string | null>(null)
  const attemptResult = ref<BarChallengeAttemptResult | null>(null)

  // Actions (stubs — Plan 05 implementa el flujo real) ──────────────────────

  /** Arranca el timer. Plan 05: set `startTimestamp`, `isRunning=true`. */
  function start(): void {
    logger.debug('start stub')
  }

  /** Tick periódico del timer. Plan 05: incrementa `secondsHeld`. */
  function tick(): void {
    logger.debug('tick stub')
  }

  /** Guarda foto del usuario colgado. Plan 05: set `photoBase64`. */
  function setPhoto(_base64: string): void {
    logger.debug('setPhoto stub')
  }

  /** Detiene el timer y deja todo listo para `submit()`. Plan 05: set `isRunning=false`. */
  function finalize(): void {
    logger.debug('finalize stub')
  }

  /**
   * Envía el intento al backend (POST /bar-challenge/attempt o equivalente —
   * spec final en Plan 04). Plan 05: hace la llamada HTTP y popula
   * `attemptResult`.
   */
  async function submit(): Promise<void> {
    logger.debug('submit stub')
    return Promise.resolve()
  }

  /** Resetea todo el estado del intento (para reintentar o salir). */
  function reset(): void {
    logger.debug('reset stub')
  }

  return {
    // State
    startTimestamp,
    secondsHeld,
    isRunning,
    photoBase64,
    attemptResult,
    // Actions
    start,
    tick,
    setPhoto,
    finalize,
    submit,
    reset,
  }
})
