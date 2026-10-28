import { ref } from 'vue'
import { createLogger } from 'src/utils/logger'
import { ConquerApiError, isConquerCanceled, useConquerApi } from './useConquerApi'
import type {
  CorrectionsResponse,
  CorrectionsSeenResponse,
  CorrectionVideoUrl,
  CorrectionVideoWho,
  CorrectionView,
} from '../types'

const log = createLogger('useConquerCorrections')

// T-201-56: el socio ve un texto fijo en español; el detalle técnico va al log (Sentry).
const LOAD_ERROR = 'No pudimos cargar tus correcciones. Probá de nuevo.'

/**
 * Pantalla Correcciones del alumno (Fase 202 D-26, DA-47): trae `GET /corrections` (lo que mandó,
 * los topes y los objetivos elegibles), marca las respuestas como vistas (DA-46) y pide la URL
 * firmada de cada video al tocarlo (D-28, DA-44). Quien lo usa llama a `cleanup()` al desmontarse
 * (el composable no usa hooks). No muestra `Notify`: la vista observa `error` y captura lo que
 * tira `videoUrl`. Las URLs firmadas pasan de largo: ni se guardan acá ni se loguean (T-201-156).
 */
export function useConquerCorrections() {
  const api = useConquerApi()

  const data = ref<CorrectionsResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** Cada carga toma el siguiente número; solo la última aplica su respuesta. */
  let loadSeq = 0
  /** Número de la carga para la que ya se intentó marcar las vistas (una sola vez por carga). */
  let seenForLoad = 0

  function logFailure(message: string, err: unknown): void {
    if (err instanceof ConquerApiError) {
      // Un 4xx con respuesta no es un fallo del sistema: no va a Sentry.
      if (err.isExpected) return
      log.error(message, { status: err.status, error: err.detail })
      return
    }
    log.error(message, { error: err instanceof Error ? err.message : String(err) })
  }

  /** Trae las correcciones. */
  async function load(): Promise<void> {
    const seq = ++loadSeq
    loading.value = true
    error.value = null
    try {
      const response = await api.getCorrections()
      if (seq !== loadSeq) return
      data.value = response
    } catch (err: unknown) {
      if (isConquerCanceled(err) || seq !== loadSeq) return
      logFailure('Failed to load Conquer corrections', err)
      error.value = err instanceof ConquerApiError ? err.message : LOAD_ERROR
    } finally {
      if (seq === loadSeq) loading.value = false
    }
  }

  /**
   * Marca como vistas las respuestas del coach (DA-46) si la lista cargada tiene alguna sin ver.
   * Corre una sola vez por carga y es silencioso: si falla, el contador queda como estaba. Devuelve
   * el contador nuevo (o `null` si no hizo nada) para que la pantalla lo refleje en el store. NO
   * toca `data`: la lista ya pintada conserva los "Nueva" hasta que el alumno sale.
   */
  async function markSeen(): Promise<CorrectionsSeenResponse | null> {
    const current = data.value
    if (!current || seenForLoad === loadSeq) return null
    if (!current.items.some((item) => item.replyUnseen)) return null
    seenForLoad = loadSeq
    try {
      return await api.markCorrectionsSeen()
    } catch (err: unknown) {
      if (!isConquerCanceled(err)) logFailure('Failed to mark Conquer replies as seen', err)
      return null
    }
  }

  /**
   * Pide la URL firmada (5 minutos) del video del alumno o del coach. `available: false` NO es un
   * error. Un fallo real (p. ej. 503 sin bucket) re-lanza el `ConquerApiError` con el copy en español
   * para que la vista lo notifique; `null` solo si se abortó con `cleanup()`.
   */
  async function videoUrl(id: number, who: CorrectionVideoWho): Promise<CorrectionVideoUrl | null> {
    try {
      return await api.getCorrectionVideoUrl(id, who)
    } catch (err: unknown) {
      if (isConquerCanceled(err)) return null
      logFailure('Failed to get Conquer correction video url', err)
      throw err
    }
  }

  /** Suma la corrección recién creada (202-14) sin recargar: arriba de todo y un cupo menos. */
  function applyCreated(item: CorrectionView): void {
    const current = data.value
    if (!current || current.items.some((existing) => existing.id === item.id)) return
    const pendingDelta = item.status === 'pendiente' ? 1 : 0
    data.value = {
      ...current,
      items: [item, ...current.items],
      limits: { ...current.limits, pending: current.limits.pending + pendingDelta },
    }
  }

  /** Aborta lo que siga en vuelo; la vista lo llama al desmontarse. */
  function cleanup(): void {
    loadSeq++
    api.cleanup()
    loading.value = false
  }

  return { data, loading, error, load, markSeen, videoUrl, applyCreated, cleanup }
}
