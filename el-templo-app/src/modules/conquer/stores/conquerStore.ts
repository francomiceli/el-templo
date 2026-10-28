import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createLogger } from 'src/utils/logger'
import { ConquerApiError, isConquerCanceled, useConquerApi } from '../composables/useConquerApi'
import { resolveConquerView } from '../utils/conquerView'
import type {
  BodyCheckSummary,
  ComboKey,
  ConquerStateResponse,
  CorrectionCounts,
  MemberTutorials,
  PublishPermission,
} from '../types'

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

  /**
   * Tutoriales en video (DA-49): `null` hasta que cargan. Sin tutoriales o con error no se muestra
   * ningún botón; nunca es un `error` del store.
   */
  const tutorials = ref<MemberTutorials | null>(null)
  let tutorialsLoading: Promise<void> | null = null

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

  /** Refleja en el estado el permiso de publicación que guardó el API (§6). */
  function applyPublishPermission(permission: PublishPermission): void {
    const current = state.value
    if (!current?.member) return
    state.value = {
      ...current,
      member: {
        ...current.member,
        publishEnabled: permission.enabled,
        publishNoFace: permission.noFace,
      },
    }
  }

  /** Marca la guía como vista en el estado (en memoria, sin llamar al API). */
  function applyGuideSeen(): void {
    const current = state.value
    if (!current?.member) return
    state.value = { ...current, member: { ...current.member, guideSeen: true } }
  }

  /**
   * "Ya la vio" (DA-21): lo guarda el API. Es silencioso: nunca toca `error` ni muestra nada. Si
   * falla, la marca igual en memoria para no mandar al alumno de nuevo a la guía en esta sesión
   * (la próxima carga del estado se la vuelve a ofrecer). Devuelve true si el API la guardó.
   */
  async function markGuideSeen(): Promise<boolean> {
    try {
      await api.markGuideSeen()
      applyGuideSeen()
      return true
    } catch (err: unknown) {
      if (isConquerCanceled(err)) return false
      if (err instanceof ConquerApiError && err.isExpected) {
        log.warn('Conquer guide-seen rejected', { status: err.status, error: err.detail })
      } else {
        logFailure('Failed to mark Conquer guide as seen', err)
      }
      applyGuideSeen()
      return false
    }
  }

  /**
   * Carga los tutoriales UNA vez (DA-49): si ya cargaron no vuelve a pedir y dos llamadas juntas
   * comparten el pedido. Un fallo se loguea y deja el store sin tutoriales (se reintenta en la
   * próxima llamada); no toca `error` ni notifica.
   */
  function loadTutorials(): Promise<void> {
    if (tutorials.value !== null) return Promise.resolve()
    if (tutorialsLoading !== null) return tutorialsLoading
    tutorialsLoading = (async () => {
      try {
        tutorials.value = await api.getTutorials()
      } catch (err: unknown) {
        if (isConquerCanceled(err)) return
        if (err instanceof ConquerApiError && err.isExpected) {
          log.warn('Conquer tutorials rejected', { status: err.status, error: err.detail })
        } else {
          logFailure('Failed to load Conquer tutorials', err)
        }
      } finally {
        tutorialsLoading = null
      }
    })()
    return tutorialsLoading
  }

  /** URL del tutorial de un ejercicio (`conquer_exercises.id`) o `null`: sin botón. */
  function exerciseTutorialUrl(exerciseId: number): string | null {
    return tutorials.value?.exercises.find((t) => t.exerciseId === exerciseId)?.url ?? null
  }

  /** URL del tutorial de un combo o `null`: sin botón. */
  function comboTutorialUrl(comboKey: ComboKey): string | null {
    return tutorials.value?.combos.find((t) => t.comboKey === comboKey)?.url ?? null
  }

  /**
   * Refleja en el estado los contadores de correcciones (DA-46) tras mandar un video o tras
   * `seen`, sin releer `/state`. Sin alumno activo no hace nada.
   */
  function applyCorrectionCounts(counts: CorrectionCounts): void {
    const current = state.value
    if (!current?.member) return
    state.value = { ...current, member: { ...current.member, corrections: { ...counts } } }
  }

  /** Aborta lo que siga en vuelo; la vista lo llama al desmontarse. */
  function cleanup(): void {
    loadSeq++
    api.cleanup()
    tutorialsLoading = null
    loading.value = false
    requesting.value = false
  }

  return {
    state,
    loading,
    error,
    requesting,
    view,
    tutorials,
    loadState,
    requestUnlock,
    applyState,
    applyBodyCheck,
    applyPublishPermission,
    applyGuideSeen,
    markGuideSeen,
    loadTutorials,
    exerciseTutorialUrl,
    comboTutorialUrl,
    applyCorrectionCounts,
    cleanup,
  }
})
