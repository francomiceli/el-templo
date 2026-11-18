import { ref } from 'vue'
import axios from 'axios'
import type { CelebrationResponse } from 'src/types/aura-celebration'
import { countUpSteps } from 'src/utils/count-up'
import { celebrationCard, type CelebrationCardView } from 'src/utils/celebration-view'
import { createLogger } from 'src/utils/logger'

/**
 * Celebración chica de Aura en Mi Templo (fase 215, #33, boceto 037 variante D).
 *
 * Al llegar a Mi Templo (y al volver a primer plano estando ahí) se pregunta al servidor qué Aura se
 * sumó desde la última visita por un motivo que no tuvo su propia celebración. Si hay algo, sale una
 * tarjeta de la ficha de Aura: la ficha late, el número cuenta hasta el total y la tarjeta se va
 * sola a los 5 segundos. Al mostrarse se manda el `ack` con `maxId`: la marca vive en el servidor
 * (una sola vez por movimiento aunque se use otro teléfono).
 *
 * Reglas:
 *  - Si el encabezado no está visible (`canShow()` falso) no se muestra y no se manda `ack`: queda
 *    para la próxima vez.
 *  - Con `prefers-reduced-motion` aparece sin animación y el número salta al total.
 *  - El composable no registra nada en el ciclo de vida del componente: quien lo usa llama a
 *    `cleanup()` al desmontarse.
 */

/** La tarjeta entra 120 ms después de pedirla (el estado inicial se pinta primero). */
export const CELEBRATION_IN_MS = 120
/** La ficha late y empieza el conteo 450 ms después de entrar la tarjeta. */
export const CELEBRATION_COUNT_DELAY_MS = 450
/** La tarjeta se va sola a los 5 segundos (más la entrada). */
export const CELEBRATION_STAY_MS = 5400
/** Duración de la salida (la misma del CSS). */
export const CELEBRATION_OUT_MS = 320
/** Duración del conteo del número. */
export const CELEBRATION_COUNT_MS = 1100
/** Cuánto vive el "+N" que sube de la ficha. */
export const CELEBRATION_PLUS_MS = 1400
/** Con movimiento reducido no hay animación: se queda 5 segundos y se va. */
export const CELEBRATION_REDUCED_STAY_MS = 5000

export interface AuraCelebrationDeps {
  /** ¿Se puede mostrar? Encabezado de Mi Templo visible, Aura prendida y app en primer plano. */
  canShow: () => boolean
  fetchCelebration: () => Promise<CelebrationResponse>
  ack: (upToId: number) => Promise<void>
  /** Deja el total real en el perfil (al terminar el conteo, o de una con movimiento reducido). */
  onTotal: (total: number) => void
  reducedMotion?: () => boolean
}

export function useAuraCelebration(deps: AuraCelebrationDeps) {
  const log = createLogger('useAuraCelebration')

  /** La tarjeta en pantalla; null = no hay. */
  const card = ref<CelebrationCardView | null>(null)
  /** Estado "adentro" de la tarjeta (el CSS anima la entrada y la salida). */
  const shown = ref(false)
  /** El número de la ficha mientras dura el conteo; null = rige el del perfil. */
  const chipValue = ref<number | null>(null)
  const chipPulse = ref(false)
  /** El "+N" que sube de la ficha; null = no hay. */
  const plusAmount = ref<number | null>(null)

  let cleaned = false
  let busy = false
  let finalTotal = 0
  // Timers de la animación (entrada, conteo, latido): se cortan al cerrar.
  let timers: ReturnType<typeof setTimeout>[] = []
  let outTimer: ReturnType<typeof setTimeout> | null = null
  let stepTimer: ReturnType<typeof setInterval> | null = null
  let dismissTimer: ReturnType<typeof setTimeout> | null = null

  function later(fn: () => void, ms: number): void {
    timers.push(setTimeout(fn, ms))
  }

  function clearTimers(): void {
    for (const timer of timers) clearTimeout(timer)
    timers = []
  }

  function stopCount(): void {
    if (stepTimer !== null) {
      clearInterval(stepTimer)
      stepTimer = null
    }
  }

  /** Deja el total real en el perfil y suelta el número de la ficha. */
  function finishChip(): void {
    stopCount()
    if (chipValue.value !== null) {
      deps.onTotal(finalTotal)
      chipValue.value = null
    }
  }

  function startCount(from: number, to: number, amount: number): void {
    chipPulse.value = true
    plusAmount.value = amount
    later(() => {
      chipPulse.value = false
    }, CELEBRATION_COUNT_MS)
    later(() => {
      plusAmount.value = null
    }, CELEBRATION_PLUS_MS)

    const diff = Math.max(1, to - from)
    const stepMs = Math.max(40, Math.min(300, Math.round(CELEBRATION_COUNT_MS / diff)))
    const steps = countUpSteps(from, to, stepMs, CELEBRATION_COUNT_MS)
    let i = 0
    stepTimer = setInterval(() => {
      const next = steps[i]
      if (next === undefined) {
        finishChip()
        return
      }
      chipValue.value = next
      i += 1
      if (i >= steps.length) finishChip()
    }, stepMs)
  }

  function show(view: CelebrationCardView, response: CelebrationResponse): void {
    const reduced = deps.reducedMotion?.() ?? false
    card.value = view
    finalTotal = response.total
    // La marca se mueve al mostrar: lo que llegue después tiene un id mayor.
    deps.ack(response.maxId).catch((err: unknown) => {
      log.warn('No se pudo marcar la celebración', {
        error: err instanceof Error ? err.message : String(err),
      })
    })

    if (reduced) {
      deps.onTotal(response.total)
      shown.value = true
      dismissTimer = setTimeout(dismiss, CELEBRATION_REDUCED_STAY_MS)
      return
    }

    const from = Math.max(0, response.total - response.sum)
    chipValue.value = from
    later(() => {
      shown.value = true
    }, CELEBRATION_IN_MS)
    later(
      () => startCount(from, response.total, view.amount),
      CELEBRATION_IN_MS + CELEBRATION_COUNT_DELAY_MS,
    )
    dismissTimer = setTimeout(dismiss, CELEBRATION_STAY_MS)
  }

  /** Cierra la tarjeta (sola a los 5 s, o al tocarla). Idempotente. */
  function dismiss(): void {
    if (dismissTimer !== null) {
      clearTimeout(dismissTimer)
      dismissTimer = null
    }
    if (card.value === null || outTimer !== null) return
    // Cerrar a mitad de la entrada o del conteo corta lo que falte y deja el total real.
    clearTimers()
    finishChip()
    chipPulse.value = false
    plusAmount.value = null
    shown.value = false
    outTimer = setTimeout(() => {
      outTimer = null
      card.value = null
    }, CELEBRATION_OUT_MS)
  }

  /**
   * Pregunta al servidor y, si hay algo para celebrar y el encabezado sigue visible, muestra la
   * tarjeta. No hace nada si ya hay una en pantalla o hay una consulta en vuelo.
   */
  async function check(): Promise<void> {
    if (cleaned || busy || card.value !== null || !deps.canShow()) return
    busy = true
    try {
      const response = await deps.fetchCelebration()
      // Pudo cerrarse la pantalla o tapar el encabezado mientras se esperaba: sin ack, queda para
      // la próxima vez.
      if (cleaned || card.value !== null || !deps.canShow()) return
      const view = celebrationCard(response)
      if (view === null) return
      show(view, response)
    } catch (err: unknown) {
      // 404 = módulo apagado: sin celebración y sin ruido.
      if (!(axios.isAxiosError(err) && err.response?.status === 404)) {
        log.warn('No se pudo consultar la celebración', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    } finally {
      busy = false
    }
  }

  function cleanup(): void {
    cleaned = true
    clearTimers()
    if (outTimer !== null) {
      clearTimeout(outTimer)
      outTimer = null
    }
    if (dismissTimer !== null) {
      clearTimeout(dismissTimer)
      dismissTimer = null
    }
    // Si se cierra a mitad del conteo, el perfil igual queda con el total real.
    finishChip()
    chipPulse.value = false
    plusAmount.value = null
    shown.value = false
    card.value = null
  }

  return { card, shown, chipValue, chipPulse, plusAmount, check, dismiss, cleanup }
}
