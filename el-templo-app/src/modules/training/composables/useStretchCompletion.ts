import axios from 'axios'
import { ref, type Ref } from 'vue'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import { extractError, isExpectedClientError } from 'src/utils/extract-error'
import { useStretchStore } from 'src/stores/useStretchStore'
import type {
  StretchCompleteRequest,
  StretchCompleteResponse,
  StretchEventFrom,
  StretchEventRequest,
  StretchEventType,
} from '../types/stretch'

const log = createLogger('useStretchCompletion')

const MSG_VENCIDO = 'Este estiramiento ya venció'
const MSG_GUARDAR = 'No pudimos guardar el estiramiento'

/** Esperas entre reintentos del aviso de inicio. La última se repite. */
export const STARTED_RETRY_DELAYS_MS: readonly number[] = [3_000, 8_000, 15_000, 30_000]
/**
 * Tope de intentos del aviso de inicio. Con la escalera de esperas son ~8 minutos de
 * reintentos: sin duración de rutina que cubrir, alcanza para una red que vuelve al rato.
 */
export const STARTED_MAX_ATTEMPTS = 20

/** `rejected` = 4xx (no se reintenta). `failed` = red o 5xx (se puede reintentar). */
type EventOutcome = 'ok' | 'rejected' | 'failed'

export interface UseStretchCompletionReturn {
  /** true mientras el POST de cierre está en vuelo */
  isSubmitting: Ref<boolean>
  /** Mensaje del último cierre fallido */
  error: Ref<string | null>
  /**
   * `Date.now()` del momento en que el servidor aceptó el `started` (el AURA cuenta desde ahí).
   * Null mientras no confirmó, tras un 4xx o una falla, y después de `cleanup`.
   */
  startedConfirmedAt: Ref<number | null>
  /** Cierra el estiramiento. Devuelve la respuesta del servidor o null si falló */
  complete: (req: StretchCompleteRequest) => Promise<StretchCompleteResponse | null>
  /** Evento del embudo (fire-and-forget): nunca lanza */
  sendEvent: (type: StretchEventType, from?: StretchEventFrom) => Promise<void>
  /**
   * Aviso de inicio con reintentos en segundo plano (ME-03): sin `started_at` el
   * servidor cierra sin duración ni AURA. Corta al entrar, ante un 4xx, al
   * cerrar (`complete`) o en `cleanup`. Nunca lanza.
   */
  sendStarted: (from: StretchEventFrom) => void
  /** Resetea el estado (la página lo llama al desmontarse) */
  cleanup: () => void
}

/** 410: el mensaje del servidor si vino, si no el texto fijo. */
function expiredMessage(err: unknown): string | null {
  if (!axios.isAxiosError(err) || err.response?.status !== 410) return null
  const data: unknown = err.response.data
  if (data && typeof data === 'object') {
    const { error, message } = data as { error?: unknown; message?: unknown }
    if (typeof error === 'string') return error
    if (typeof message === 'string') return message
  }
  return MSG_VENCIDO
}

/**
 * Completado del estiramiento post-clase y eventos del embudo (fase 213, plan 09).
 *
 * El cliente solo manda el id de la oferta y los ejercicios marcados (T-213-27):
 * el servidor calcula la duración y decide el AURA. Al cerrar, el store de hoy
 * pasa a `done` sin otra consulta (SPEC §5.3.5).
 */
export function useStretchCompletion(): UseStretchCompletionReturn {
  const isSubmitting = ref(false)
  const error = ref<string | null>(null)
  const startedConfirmedAt = ref<number | null>(null)

  // Reintentos del aviso de inicio. `startedRun` cambia en cada arranque o corte:
  // un intento en vuelo de una corrida vieja no agenda nada al volver.
  let startedRun = 0
  let startedTimer: ReturnType<typeof setTimeout> | null = null
  let startedUnconfirmed = false

  function stopStartedRetry(): void {
    startedRun += 1
    if (startedTimer !== null) {
      clearTimeout(startedTimer)
      startedTimer = null
    }
    startedUnconfirmed = false
  }

  async function complete(req: StretchCompleteRequest): Promise<StretchCompleteResponse | null> {
    if (isSubmitting.value) return null

    // Un inicio que entrara ahora mediría una duración de segundos: se corta.
    if (startedUnconfirmed) {
      log.error('El estiramiento se cierra sin aviso de inicio confirmado', {
        offerId: req.offerId,
      })
    }
    stopStartedRetry()

    isSubmitting.value = true
    error.value = null

    try {
      const response = await api.post<StretchCompleteResponse>('/sessions/stretch/complete', req)
      useStretchStore().applyCompletion(response.data)
      return response.data
    } catch (err: unknown) {
      error.value = expiredMessage(err) ?? extractError(err, MSG_GUARDAR)
      if (isExpectedClientError(err)) {
        log.warn('Cierre del estiramiento rechazado por el servidor', { error: error.value })
      } else {
        log.error('Falló el cierre del estiramiento', { error: error.value })
      }
      return null
    } finally {
      isSubmitting.value = false
    }
  }

  /** `quiet`: una falla de red queda en warn (quien llama decide si avisa a Sentry) */
  async function postEvent(
    type: StretchEventType,
    from: StretchEventFrom | undefined,
    quiet: boolean,
  ): Promise<EventOutcome> {
    const body: StretchEventRequest = from ? { type, from } : { type }
    try {
      await api.post('/sessions/stretch/events', body)
      return 'ok'
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      // 4xx (p. ej. 404 sin oferta de hoy) es esperable: no va a Sentry.
      if (isExpectedClientError(err)) {
        log.warn('Evento del estiramiento rechazado por el servidor', { type, message })
        return 'rejected'
      }
      if (quiet) {
        log.warn('Falló el evento del estiramiento, se reintenta', { type, message })
      } else {
        log.error('Falló el evento del estiramiento', { type, message })
      }
      return 'failed'
    }
  }

  async function sendEvent(type: StretchEventType, from?: StretchEventFrom): Promise<void> {
    await postEvent(type, from, false)
  }

  function sendStarted(from: StretchEventFrom): void {
    stopStartedRetry()
    startedConfirmedAt.value = null
    const run = startedRun
    startedUnconfirmed = true

    const attempt = async (n: number): Promise<void> => {
      const outcome = await postEvent('started', from, true)
      if (run !== startedRun) return
      if (outcome !== 'failed') {
        startedUnconfirmed = false
        // Un 4xx corta los reintentos pero el servidor NO aceptó el inicio: sin hora de confirmación.
        if (outcome === 'ok') startedConfirmedAt.value = Date.now()
        return
      }
      // Sin más intentos queda sin confirmar: `complete` lo informa.
      if (n >= STARTED_MAX_ATTEMPTS) return
      const delay =
        STARTED_RETRY_DELAYS_MS[Math.min(n - 1, STARTED_RETRY_DELAYS_MS.length - 1)] ?? 30_000
      startedTimer = setTimeout(() => {
        startedTimer = null
        void attempt(n + 1)
      }, delay)
    }

    void attempt(1)
  }

  function cleanup(): void {
    stopStartedRetry()
    startedConfirmedAt.value = null
    isSubmitting.value = false
    error.value = null
  }

  return { isSubmitting, error, startedConfirmedAt, complete, sendEvent, sendStarted, cleanup }
}
