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

export interface UseStretchCompletionReturn {
  /** true mientras el POST de cierre está en vuelo */
  isSubmitting: Ref<boolean>
  /** Mensaje del último cierre fallido */
  error: Ref<string | null>
  /** Cierra el estiramiento. Devuelve la respuesta del servidor o null si falló */
  complete: (req: StretchCompleteRequest) => Promise<StretchCompleteResponse | null>
  /** Evento del embudo (fire-and-forget): nunca lanza */
  sendEvent: (type: StretchEventType, from?: StretchEventFrom) => Promise<void>
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

  async function complete(req: StretchCompleteRequest): Promise<StretchCompleteResponse | null> {
    if (isSubmitting.value) return null

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

  async function sendEvent(type: StretchEventType, from?: StretchEventFrom): Promise<void> {
    const body: StretchEventRequest = from ? { type, from } : { type }
    try {
      await api.post('/sessions/stretch/events', body)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      // 4xx (p. ej. 404 sin oferta de hoy) es esperable: no va a Sentry.
      if (isExpectedClientError(err)) {
        log.warn('Evento del estiramiento rechazado por el servidor', { type, message })
      } else {
        log.error('Falló el evento del estiramiento', { type, message })
      }
    }
  }

  function cleanup(): void {
    isSubmitting.value = false
    error.value = null
  }

  return { isSubmitting, error, complete, sendEvent, cleanup }
}
