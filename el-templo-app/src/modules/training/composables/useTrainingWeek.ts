import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { createLogger } from 'src/utils/logger'
import { DEFAULT_BRANCH_TZ, todayInTz } from 'src/utils/tz'
import { useUserStore } from 'src/stores/useUserStore'
import { useWeekStore } from '../stores/weekStore'
import { useSessionPlayerStore } from '../stores/sessionPlayerStore'
import { useWeekData } from './useWeekData'
import { formatDayName } from './useDateNavigation'
import {
  addDays,
  canGoNextWeek,
  canGoPrevWeek,
  mondayOfDate,
  weekDatesFrom,
} from '../utils/weekLabels'
import type { DayState, WeekDay } from '../types/session'

const log = createLogger('useTrainingWeek')

export interface UseTrainingWeekReturn {
  /** Lunes de la semana que se está viendo ("YYYY-MM-DD") */
  monday: Ref<string>
  /** Hoy en la zona de la sede (no la del teléfono) */
  today: ComputedRef<string>
  days: ComputedRef<WeekDay[]>
  selectedDate: Ref<string | null>
  selectedDay: ComputedRef<WeekDay | undefined>
  completedDates: Ref<string[]>
  /**
   * Hay progreso guardado de la sesión del día elegido (para "Continuar"). `null` mientras no se
   * leyó el progreso local: el botón de hoy reserva su lugar sin texto (203 C-10).
   */
  hasProgress: Ref<boolean | null>
  loading: Ref<boolean>
  error: Ref<string | null>
  canPrev: ComputedRef<boolean>
  canNext: ComputedRef<boolean>
  load: (monday?: string) => Promise<void>
  prevWeek: () => Promise<void>
  nextWeek: () => Promise<void>
  select: (date: string) => void
  cleanup: () => void
}

/**
 * Datos de la tab Semana (fase 197 D-03): carga cualquier semana de la plani, elige el día y
 * calcula "hoy" en la zona de la sede. Llena `weekStore` con la misma fuente que usa `DayPlayer`,
 * así el player sigue encontrando el día al que se entra desde la tab.
 *
 * Expone `cleanup()` (corta el watcher del nivel); quien lo monta lo llama al desmontar.
 */
export function useTrainingWeek(): UseTrainingWeekReturn {
  const userStore = useUserStore()
  const weekStore = useWeekStore()
  const sessionPlayerStore = useSessionPlayerStore()
  const weekData = useWeekData()

  const today = computed(() => todayInTz(userStore.profile?.branchTimezone ?? DEFAULT_BRANCH_TZ))

  const monday = ref(mondayOfDate(today.value))
  const selectedDate = ref<string | null>(null)
  const hasProgress = ref<boolean | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  function dayState(date: string, index: number): DayState {
    if (weekData.completedDates.value.includes(date)) return 'completed'
    if (index === 6) return 'rest' // domingo
    if (date === today.value) return 'today'
    return date < today.value ? 'past' : 'future'
  }

  const days = computed<WeekDay[]>(() =>
    weekDatesFrom(monday.value).map((date, index) => ({
      date,
      dayName: formatDayName(date),
      // El lunes es el índice 0: 1 = lunes ... 6 = sábado, 0 = domingo (convención de Date.getDay)
      dayOfWeek: (index + 1) % 7,
      state: dayState(date, index),
      session: weekData.sessions.value.get(date) ?? null,
    })),
  )

  const selectedDay = computed(() => days.value.find((d) => d.date === selectedDate.value))

  const canPrev = computed(() => canGoPrevWeek(monday.value))
  const canNext = computed(() => canGoNextWeek(monday.value, mondayOfDate(today.value)))

  // ── Progreso local del día elegido ("Continuar") ──
  let progressRequest = 0

  async function refreshProgress(): Promise<void> {
    const request = ++progressRequest
    const dayId = selectedDay.value?.session?.dayId
    if (!dayId) {
      hasProgress.value = false
      return
    }
    // Día elegido con sesión: hasta leer el progreso local, el botón reserva su lugar sin texto
    hasProgress.value = null
    try {
      const progress = await sessionPlayerStore.loadProgress(dayId)
      if (request !== progressRequest) return
      hasProgress.value = progress.elapsedSeconds > 0 || progress.completedBlocks.length > 0
    } catch (err: unknown) {
      if (request !== progressRequest) return
      hasProgress.value = false
      log.error('Failed to load session progress', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  function applySelection(date: string | null): void {
    selectedDate.value = date
    if (date) weekStore.selectDate(date)
  }

  /** Hoy si está en la semana; si no, el primer día con sesión (nunca el domingo); si no, el lunes. */
  function defaultSelection(): string | null {
    const list = days.value
    if (list.some((d) => d.date === today.value)) return today.value
    const firstWithSession = list.find((d) => d.session !== null && d.dayOfWeek !== 0)
    return (firstWithSession ?? list[0])?.date ?? null
  }

  // ── Carga: en serie, para que una respuesta lenta de una semana vieja no pise a la nueva ──
  let queue: Promise<void> = Promise.resolve()
  let latestRequest = 0

  async function run(request: number, target: string, keepSelection: boolean): Promise<void> {
    error.value = null
    await weekData.fetchWeekSessions(weekDatesFrom(target))
    // Llegó otra navegación mientras tanto: esa carga es la que manda
    if (request !== latestRequest) return

    error.value = weekData.error.value
    weekStore.setWeekDays(days.value)

    const keep = keepSelection && days.value.some((d) => d.date === selectedDate.value)
    applySelection(keep ? selectedDate.value : defaultSelection())
    loading.value = false
    await refreshProgress()
  }

  function enqueue(target: string, keepSelection: boolean): Promise<void> {
    const request = ++latestRequest
    monday.value = target
    loading.value = true
    queue = queue
      .then(() => (request === latestRequest ? run(request, target, keepSelection) : undefined))
      .catch((err: unknown) => {
        log.error('Failed to load training week', {
          error: err instanceof Error ? err.message : String(err),
        })
        if (request === latestRequest) {
          error.value = 'Error cargando semana'
          loading.value = false
          // Nunca dejar el botón de hoy en pending si la carga falló antes de leer el progreso
          hasProgress.value = false
        }
      })
    return queue
  }

  function load(target?: string): Promise<void> {
    return enqueue(target ?? monday.value, false)
  }

  async function prevWeek(): Promise<void> {
    if (!canPrev.value) return
    await enqueue(addDays(monday.value, -7), false)
  }

  async function nextWeek(): Promise<void> {
    if (!canNext.value) return
    await enqueue(addDays(monday.value, 7), false)
  }

  function select(date: string): void {
    if (!days.value.some((d) => d.date === date)) return
    applySelection(date)
    void refreshProgress()
  }

  // Cambio de nivel: recarga la semana. La hidratación (null -> nivel) al arrancar no cuenta,
  // mismo criterio que DayPlayer.
  const stopLevelWatch = watch(
    () => userStore.activeLevel,
    (newLevel, oldLevel) => {
      if (newLevel === oldLevel) return
      if (oldLevel === null) return
      void enqueue(monday.value, true)
    },
  )

  function cleanup(): void {
    stopLevelWatch()
    // Invalida cualquier carga en vuelo: no debe tocar el estado después de desmontar
    latestRequest++
    progressRequest++
  }

  return {
    monday,
    today,
    days,
    selectedDate,
    selectedDay,
    completedDates: weekData.completedDates,
    hasProgress,
    loading,
    error,
    canPrev,
    canNext,
    load,
    prevWeek,
    nextWeek,
    select,
    cleanup,
  }
}
