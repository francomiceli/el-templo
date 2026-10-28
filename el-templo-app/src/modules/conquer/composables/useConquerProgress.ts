import { ref } from 'vue'
import { createLogger } from 'src/utils/logger'
import { ConquerApiError, isConquerCanceled, useConquerApi } from './useConquerApi'
import { calibrationKey, subirComboKey, subirStepKey } from '../utils/progressView'
import type { ComboKey, CountedStep, ProgressResponse } from '../types'

const log = createLogger('useConquerProgress')

// T-201-56: el socio ve un texto fijo en español; el detalle técnico va al log (Sentry).
const LOAD_ERROR = 'No pudimos cargar tu progreso. Probá de nuevo.'

/**
 * Pantalla Progreso (§7.1, S12-5): trae `GET /progress` y ejecuta las acciones del alumno (Subir,
 * Subir combo, aceptar o rechazar la calibración). Cada acción reemplaza `progress` con la
 * respuesta del API: el app no recalcula nada (T-201-62). Quien lo usa llama a `cleanup()` al
 * desmontarse (el composable no usa hooks). No muestra `Notify`: la vista observa `error` o el
 * `false` de las acciones.
 */
export function useConquerProgress() {
  const api = useConquerApi()

  const progress = ref<ProgressResponse | null>(null)
  const loading = ref(false)
  /** Clave (`subirStepKey`, `subirComboKey`, `calibrationKey`) de la acción en curso. */
  const busyKey = ref<string | null>(null)
  const error = ref<string | null>(null)

  /** Cada carga toma el siguiente número; solo la última aplica su respuesta. */
  let loadSeq = 0

  function failureMessage(err: unknown, fallback: string): string {
    return err instanceof ConquerApiError ? err.message : fallback
  }

  function logFailure(message: string, err: unknown): void {
    if (err instanceof ConquerApiError) {
      // Un 4xx con respuesta no es un fallo del sistema: no va a Sentry.
      if (err.isExpected) return
      log.error(message, { status: err.status, error: err.detail })
      return
    }
    log.error(message, { error: err instanceof Error ? err.message : String(err) })
  }

  /** Trae el progreso. */
  async function load(): Promise<void> {
    const seq = ++loadSeq
    loading.value = true
    error.value = null
    try {
      const data = await api.getProgress()
      if (seq !== loadSeq) return
      progress.value = data
    } catch (err: unknown) {
      if (isConquerCanceled(err) || seq !== loadSeq) return
      logFailure('Failed to load Conquer progress', err)
      error.value = failureMessage(err, LOAD_ERROR)
    } finally {
      if (seq === loadSeq) loading.value = false
    }
  }

  /** Relee el progreso sin tocar `loading` ni `error` (tras un 409 la pantalla puede estar vieja). */
  async function refreshQuietly(): Promise<void> {
    try {
      progress.value = await api.getProgress()
    } catch (err: unknown) {
      if (!isConquerCanceled(err)) logFailure('Failed to refresh Conquer progress', err)
    }
  }

  /**
   * Corre una acción con su clave. Con otra acción en curso ignora el toque (T-201-62: un doble
   * toque no sube dos veces). Un 409 del API (ya no toca, tope) deja el mensaje en `error` y relee
   * el progreso.
   */
  async function act(
    key: string,
    fallback: string,
    run: () => Promise<ProgressResponse | null>,
  ): Promise<boolean> {
    if (busyKey.value !== null) return false
    busyKey.value = key
    error.value = null
    try {
      const next = await run()
      if (next) progress.value = next
      return true
    } catch (err: unknown) {
      if (isConquerCanceled(err)) return false
      logFailure('Failed to run Conquer progress action', err)
      error.value = failureMessage(err, fallback)
      if (err instanceof ConquerApiError && err.status === 409) await refreshQuietly()
      return false
    } finally {
      busyKey.value = null
    }
  }

  /** Sube el escalón un peldaño (§4.5). */
  function subir(exerciseId: number, step: CountedStep): Promise<boolean> {
    return act(
      subirStepKey(exerciseId, step),
      'No pudimos subir la progresión. Probá de nuevo.',
      () => api.subirStep(exerciseId, step),
    )
  }

  /** Sube el peldaño de arranque de un combo de Toro (D-14). La respuesta no trae el progreso: se relee. */
  function subirCombo(comboKey: ComboKey): Promise<boolean> {
    return act(subirComboKey(comboKey), 'No pudimos subir el combo. Probá de nuevo.', async () => {
      await api.subirCombo(comboKey)
      return api.getProgress()
    })
  }

  /** Acepta o rechaza la propuesta de calibración de un ejercicio (S12-4). */
  function resolveCalibration(exerciseId: number, accept: boolean): Promise<boolean> {
    return act(calibrationKey(exerciseId), 'No pudimos guardar tu respuesta. Probá de nuevo.', () =>
      api.resolveCalibration(exerciseId, accept),
    )
  }

  /** Aborta lo que siga en vuelo; la vista lo llama al desmontarse. */
  function cleanup(): void {
    loadSeq++
    api.cleanup()
    loading.value = false
    busyKey.value = null
  }

  return {
    progress,
    loading,
    busyKey,
    error,
    load,
    subir,
    subirCombo,
    resolveCalibration,
    cleanup,
  }
}
