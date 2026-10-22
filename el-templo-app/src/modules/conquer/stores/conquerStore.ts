import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createLogger } from 'src/utils/logger'
import { ConquerApiError, isConquerCanceled, useConquerApi } from '../composables/useConquerApi'
import { resolveConquerView } from '../utils/conquerView'
import type { BodyCheckSummary, ConquerStateResponse } from '../types'

const log = createLogger('conquerStore')

// T-201-56: el socio ve un texto fijo en español; el detalle técnico va al log (Sentry).
const LOAD_ERROR = 'No pudimos cargar Conquer. Probá de nuevo.'
const REQUEST_ERROR = 'No pudimos enviar tu pedido. Probá de nuevo.'

/**
 * Estado de Conquer del alumno (D-12): bloqueado, pedido enviado o activo. Lo comparten la tab
 * Conquer y sus pantallas (201-17..20, que le suman lo suyo).
 */
export const useConquerStore = defineStore('conquer', () => {
  const api = useConquerApi()

  // State
  const state = ref<ConquerStateResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  /** true mientras viaja el pedido de desbloqueo: bloquea el doble toque (T-201-58) */
  const requesting = ref(false)

  /** Cada carga toma el siguiente número; solo la última aplica su respuesta. */
  let loadSeq = 0

  // Getters
  const view = computed(() => resolveConquerView(state.value))

  // Helpers
  function logFailure(message: string, err: unknown): void {
    if (err instanceof ConquerApiError) {
      // Un 4xx con respuesta no es un fallo del sistema: no va a Sentry.
      if (err.isExpected) return
      log.error(message, { status: err.status, error: err.detail })
      return
    }
    log.error(message, { error: err instanceof Error ? err.message : String(err) })
  }

  // Actions
  /** Trae el estado del alumno. Con error deja el estado anterior y un mensaje fijo. */
  async function loadState(): Promise<void> {
    const seq = ++loadSeq
    loading.value = true
    error.value = null
    try {
      const data = await api.getState()
      if (seq !== loadSeq) return
      state.value = data
    } catch (err: unknown) {
      if (isConquerCanceled(err) || seq !== loadSeq) return
      logFailure('Failed to load Conquer state', err)
      error.value = LOAD_ERROR
    } finally {
      if (seq === loadSeq) loading.value = false
    }
  }

  /** "Quiero desbloquearlo" (D-12). Devuelve true si el pedido quedó registrado. */
  async function requestUnlock(): Promise<boolean> {
    if (requesting.value) return false
    requesting.value = true
    error.value = null
    try {
      state.value = await api.requestUnlock()
      return true
    } catch (err: unknown) {
      if (isConquerCanceled(err)) return false
      logFailure('Failed to request Conquer unlock', err)
      error.value = err instanceof ConquerApiError ? err.message : REQUEST_ERROR
      return false
    } finally {
      requesting.value = false
    }
  }

  /** Reemplaza el estado con la respuesta de otra acción (p. ej. guardar el día 0). */
  function applyState(next: ConquerStateResponse): void {
    state.value = next
  }

  /**
   * Reemplaza solo las banderas del control físico con la respuesta de una acción (p. ej. "Lo hago
   * después"), para que la tab no vuelva a pedir el día 0 mientras se recarga el estado (D-15).
   */
  function applyBodyCheck(summary: BodyCheckSummary): void {
    const current = state.value
    if (!current?.member) return
    state.value = { ...current, member: { ...current.member, bodyCheck: summary } }
  }

  /** Aborta lo que siga en vuelo; la vista lo llama al desmontarse. */
  function cleanup(): void {
    loadSeq++
    api.cleanup()
    loading.value = false
    requesting.value = false
  }

  return {
    state,
    loading,
    error,
    requesting,
    view,
    loadState,
    requestUnlock,
    applyState,
    applyBodyCheck,
    cleanup,
  }
})
