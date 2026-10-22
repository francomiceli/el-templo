import { ref } from 'vue'
import { createLogger } from 'src/utils/logger'
import { ConquerApiError, isConquerCanceled, useConquerApi } from './useConquerApi'
import { SATURDAY_MAX_SERIES, buildTodayForm, counterMax, toSaveBody } from '../utils/todayForm'
import type { TodayForm } from '../utils/todayForm'
import type {
  ComboView,
  Mode,
  SaveSessionResponse,
  StepKey,
  TodayResponse,
  TodayStep,
} from '../types'

/** Los dos combos del sábado de Toro (§3.2). */
export type SaturdayCombo = 'push' | 'pull'

const log = createLogger('useConquerToday')

// T-201-56: el socio ve un texto fijo en español; el detalle técnico va al log (Sentry).
const LOAD_ERROR = 'No pudimos cargar la sesión de hoy. Probá de nuevo.'
const SAVE_ERROR = 'No pudimos guardar la sesión. Probá de nuevo.'

/**
 * Pantalla Hoy (§7.1, D-16, D-18): trae el día, mantiene el formulario precargado con el objetivo,
 * guarda la sesión y resuelve la calibración. Quien lo usa llama a `cleanup()` al desmontarse (el
 * composable no usa hooks). No muestra `Notify`: la vista observa `error` o el `false` de las
 * acciones.
 */
export function useConquerToday() {
  const api = useConquerApi()

  const today = ref<TodayResponse | null>(null)
  const form = ref<TodayForm | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const changing = ref(false)
  const error = ref<string | null>(null)
  const lastSave = ref<SaveSessionResponse | null>(null)

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

  /** Trae el día pedido (sin `day`, el que toca, D-16) y arma el formulario. */
  async function load(day?: string): Promise<void> {
    const seq = ++loadSeq
    loading.value = true
    error.value = null
    try {
      const data = await api.getToday(day)
      if (seq !== loadSeq) return
      today.value = data
      form.value = buildTodayForm(data)
      lastSave.value = null
    } catch (err: unknown) {
      if (isConquerCanceled(err) || seq !== loadSeq) return
      logFailure('Failed to load Conquer today', err)
      error.value = failureMessage(err, LOAD_ERROR)
    } finally {
      if (seq === loadSeq) loading.value = false
    }
  }

  /** Cambia un contador (entero, entre 0 y el tope de su unidad). */
  function setValue(exerciseId: number, step: StepKey, value: number): void {
    const exercise = today.value?.exercises.find((e) => e.exerciseId === exerciseId)
    const row = form.value?.values[exerciseId]
    if (!exercise || !row) return
    const max = counterMax(exercise.unit, step)
    row[step] = Math.min(max, Math.max(0, Math.round(value)))
  }

  function setPain(value: number): void {
    if (!form.value) return
    form.value.pain = Math.min(10, Math.max(0, Math.round(value)))
  }

  /** Peldaño de arranque del combo de apertura. */
  function setOpeningRung(rungId: number): void {
    if (form.value?.opening) form.value.opening.rungId = rungId
  }

  /** Series completadas del combo de apertura (0-10, el tope del API). */
  function setOpeningSeries(value: number): void {
    if (form.value?.opening) {
      form.value.opening.series = Math.min(10, Math.max(0, Math.round(value)))
    }
  }

  function replaceStep(exerciseId: number, next: TodayStep): void {
    const exercise = today.value?.exercises.find((e) => e.exerciseId === exerciseId)
    if (!exercise) return
    exercise.steps = exercise.steps.map((s) => (s.step === next.step ? next : s))
    const row = form.value?.values[exerciseId]
    if (row) row[next.step] = next.value
  }

  /**
   * Cambia peldaño y modo de un escalón. El API recalcula el objetivo y devuelve el `TodayStep`
   * entero: reemplaza el escalón y su valor (vuelve a la precarga del peldaño nuevo).
   */
  async function changeStep(
    exerciseId: number,
    step: StepKey,
    rungId: number,
    mode: Mode,
  ): Promise<boolean> {
    if (changing.value || saving.value) return false
    changing.value = true
    error.value = null
    try {
      replaceStep(exerciseId, await api.changeStep(exerciseId, step, { rungId, mode }))
      return true
    } catch (err: unknown) {
      if (isConquerCanceled(err)) return false
      logFailure('Failed to change Conquer step', err)
      error.value = failureMessage(err, 'No pudimos cambiar la progresión. Probá de nuevo.')
      return false
    } finally {
      changing.value = false
    }
  }

  /** Guarda la sesión. Con `saving` activo ignora el segundo toque (T-201-60). */
  async function save(): Promise<boolean> {
    if (saving.value || !today.value || !form.value) return false
    saving.value = true
    error.value = null
    try {
      lastSave.value = await api.saveSession(toSaveBody(today.value, form.value))
      return true
    } catch (err: unknown) {
      if (isConquerCanceled(err)) return false
      logFailure('Failed to save Conquer session', err)
      error.value = failureMessage(err, SAVE_ERROR)
      return false
    } finally {
      saving.value = false
    }
  }

  /** Acepta o rechaza la propuesta de calibración de un ejercicio (S12-4) y la saca de la lista. */
  async function resolveCalibration(exerciseId: number, accept: boolean): Promise<boolean> {
    if (!lastSave.value) return false
    error.value = null
    try {
      await api.resolveCalibration(exerciseId, accept)
      if (lastSave.value) {
        lastSave.value = {
          ...lastSave.value,
          calibration: lastSave.value.calibration.filter((c) => c.exerciseId !== exerciseId),
        }
      }
      return true
    } catch (err: unknown) {
      if (isConquerCanceled(err)) return false
      logFailure('Failed to resolve Conquer calibration', err)
      error.value = failureMessage(err, 'No pudimos guardar tu respuesta. Probá de nuevo.')
      return false
    }
  }

  /** Peldaño de arranque de un combo del sábado (push o pull). */
  function setSaturdayRung(which: SaturdayCombo, rungId: number): void {
    const entry = form.value?.[which]
    if (entry) entry.rungId = rungId
  }

  /** Series completadas de un combo del sábado (0-13, el tope del API). */
  function setSaturdaySeries(which: SaturdayCombo, value: number): void {
    const entry = form.value?.[which]
    if (entry) entry.series = Math.min(SATURDAY_MAX_SERIES, Math.max(0, Math.round(value)))
  }

  /**
   * Sube el peldaño de arranque de un combo (D-14) con `POST /combos/:comboKey/subir`. Sin
   * aprobación del coach. Aplica el combo nuevo que devuelve el API.
   */
  async function raiseCombo(
    comboKey: ComboView['comboKey'],
    apply: (combo: ComboView) => void,
  ): Promise<boolean> {
    if (!today.value || changing.value || saving.value) return false
    changing.value = true
    error.value = null
    try {
      const { combo } = await api.subirCombo(comboKey)
      apply(combo)
      return true
    } catch (err: unknown) {
      if (isConquerCanceled(err)) return false
      logFailure('Failed to raise Conquer combo', err)
      error.value = failureMessage(err, 'No pudimos subir el combo. Probá de nuevo.')
      return false
    } finally {
      changing.value = false
    }
  }

  /** Sube el peldaño de arranque del combo de apertura y reemplaza el combo. */
  async function subirOpening(): Promise<boolean> {
    const opening = today.value?.opening
    if (!opening) return false
    return raiseCombo(opening.comboKey, (combo) => {
      if (today.value) today.value.opening = combo
      if (form.value) form.value.opening = { rungId: combo.rungId, series: combo.value }
    })
  }

  /** Sube el peldaño de arranque del combo push o pull del sábado y reemplaza el combo. */
  async function subirSaturday(which: SaturdayCombo): Promise<boolean> {
    const saturday = today.value?.saturday
    if (!saturday) return false
    return raiseCombo(saturday[which].comboKey, (combo) => {
      if (today.value?.saturday) today.value.saturday[which] = combo
      if (form.value) form.value[which] = { rungId: combo.rungId, series: combo.value }
    })
  }

  /** Aborta lo que siga en vuelo; la vista lo llama al desmontarse. */
  function cleanup(): void {
    loadSeq++
    api.cleanup()
    loading.value = false
    saving.value = false
    changing.value = false
  }

  return {
    today,
    form,
    loading,
    saving,
    changing,
    error,
    lastSave,
    load,
    setValue,
    setPain,
    setOpeningRung,
    setOpeningSeries,
    changeStep,
    save,
    resolveCalibration,
    subirOpening,
    setSaturdayRung,
    setSaturdaySeries,
    subirSaturday,
    cleanup,
  }
}
