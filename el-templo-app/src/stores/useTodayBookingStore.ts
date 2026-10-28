import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { fetchMyBookings } from 'src/composables/useSchedulingApi'
import { useUserStore } from 'src/stores/useUserStore'
import type { MyBookingRecord } from 'src/types/scheduling'
import {
  CHECK_IN_WINDOW_MS,
  DEFAULT_BRANCH_TZ,
  REGULAR_KIND,
  activityKindKey,
  checkInWindowState,
  classStartUtc,
  formatTimeInTz,
  minutesUntil,
  weekStartsFor,
  type CheckInWindowState,
} from 'src/utils/check-in-window'
import { createLogger } from 'src/utils/logger'
import { todayInTz } from 'src/utils/tz'

const log = createLogger('useTodayBookingStore')

/** Intervalo del reloj interno: alcanza para que la ventana ±20 min y la fecha de la sede se actualicen solas. */
const CLOCK_INTERVAL_MS = 30_000

const ACTIVE_STATUSES: ReadonlyArray<MyBookingRecord['status']> = [
  'reservado',
  'qr_escaneado',
  'confirmado',
]
const UPCOMING_STATUSES: ReadonlyArray<MyBookingRecord['status']> = ['reservado', 'confirmado']

/**
 * Turno de hoy del socio (fase 199, D-04/D-06).
 *
 * Es un store y no un composable porque lo comparten `MainLayout` (botón QR
 * flotante) y Mi Templo (card de hoy): una sola consulta a `my-bookings` con
 * `weeks=2` (esta semana y la siguiente en un único pedido, fase 203 D-15; así
 * un fin de semana sin turnos igual encuentra el del lunes). "Hoy" y la hora de la clase se calculan SIEMPRE en la zona de la sede
 * (nunca con la hora local del teléfono).
 *
 * - `load()` es fail-open: ante error loguea y marca `loadFailed`; la primera
 *   carga queda vacía y un refresco conserva las reservas anteriores.
 * - El reloj se arranca/para desde `MainLayout` (`startClock`/`stopClock`,
 *   equivalente al `cleanup()` de los composables); `reset()` lo para.
 * - La asistencia ya marcada se evalúa POR CATEGORÍA, igual que el server (una
 *   asistencia por día por categoría): el flag local se ata a (fecha de la sede,
 *   categoría de la reserva), no al día entero (D-06).
 */
export const useTodayBookingStore = defineStore('todayBooking', () => {
  const bookings = ref<MyBookingRecord[]>([])
  const loaded = ref(false)
  /**
   * La última carga falló: `bookings` tiene el último dato bueno o está vacío si
   * nunca hubo uno. La card de hoy lo trata como "no sé", nunca como "no tenés
   * turno" (fase 203, D-07).
   */
  const loadFailed = ref(false)
  /** Zona horaria con la que se calculó el lunes de la última carga (null = sin cargar); permite recargar cuando llega el perfil real (fase 203, D-08). */
  const loadedTz = ref<string | null>(null)
  const now = ref(new Date())
  /** Entradas `${fecha de la sede}|${activityKindKey}` ya marcadas en esta sesión. */
  const attendanceMarkedKeys = ref<string[]>([])

  /**
   * Se incrementa en cada `load()` y en `reset()`: una respuesta que vuelve
   * cuando ya cambió (logout a mitad de request o un `load()` más nuevo) se
   * descarta, nunca repoblar con las reservas del socio anterior.
   */
  let generation = 0
  let clock: ReturnType<typeof setInterval> | null = null

  const tz = computed(() => useUserStore().profile?.branchTimezone ?? DEFAULT_BRANCH_TZ)
  const todayStr = computed(() => todayInTz(tz.value, now.value))

  function bookingTz(b: MyBookingRecord): string {
    return b.branchTimezone ?? tz.value
  }

  function startOf(b: MyBookingRecord): Date {
    return classStartUtc(b.bookingDate, b.startTime, bookingTz(b))
  }

  async function load(): Promise<void> {
    const mine = ++generation
    now.value = new Date()
    const usedTz = tz.value
    const [thisMonday] = weekStartsFor(todayStr.value)
    try {
      // Fase 203 (D-15): UN pedido para esta semana y la siguiente.
      const res = await fetchMyBookings(thisMonday, undefined, { weeks: 2 })
      if (mine !== generation) return
      bookings.value = res.bookings
      loadFailed.value = false
    } catch (err: unknown) {
      if (mine !== generation) return
      loadFailed.value = true
      log.warn('Failed to load my-bookings', {
        error: err instanceof Error ? err.message : String(err),
        keptPrevious: loaded.value,
      })
      // Un refresco fallido NO borra lo ya cargado (si no, un error de red al
      // volver de Reservas apaga el botón QR y la card de hoy). Solo la primera
      // carga queda vacía.
      if (!loaded.value) {
        bookings.value = []
      }
    }
    loaded.value = true
    loadedTz.value = usedTz
  }

  /** Base común de la card de hoy, la lista de espera y la asistencia: reservas de hoy (en la zona de la sede). */
  const todaysBookings = computed(() =>
    bookings.value.filter((b) => b.bookingDate === todayStr.value),
  )

  const sortedToday = computed(() =>
    todaysBookings.value
      .filter((b) => ACTIVE_STATUSES.includes(b.status))
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  )

  /** La próxima del día (aún no pasó su ventana); si todas pasaron, la última. */
  const todayBooking = computed<MyBookingRecord | null>(() => {
    const list = sortedToday.value
    if (list.length === 0) return null
    const nowMs = now.value.getTime()
    const upcoming = list.find((b) => startOf(b).getTime() + CHECK_IN_WINDOW_MS > nowMs)
    return upcoming ?? list[list.length - 1]!
  })

  const todayWaitlist = computed<MyBookingRecord | null>(
    () =>
      todaysBookings.value
        .filter((b) => b.status === 'lista_espera')
        .sort((a, b) => a.startTime.localeCompare(b.startTime))[0] ?? null,
  )

  /** Primera reserva futura (después de hoy): cubre "fin de semana sin turnos -> semana siguiente". */
  const nextBooking = computed<MyBookingRecord | null>(
    () =>
      bookings.value
        .filter((b) => UPCOMING_STATUSES.includes(b.status) && b.bookingDate > todayStr.value)
        .sort(
          (a, b) =>
            a.bookingDate.localeCompare(b.bookingDate) || a.startTime.localeCompare(b.startTime),
        )[0] ?? null,
  )

  const windowState = computed<CheckInWindowState | null>(() => {
    const b = todayBooking.value
    if (!b || b.status !== 'reservado') return null
    return checkInWindowState(startOf(b), now.value)
  })

  const minutesToStart = computed<number | null>(() => {
    const b = todayBooking.value
    return b ? minutesUntil(startOf(b), now.value) : null
  })

  /**
   * ¿Ya hay asistencia de hoy para esta categoría? El flag local cubre el error
   * "Ya registraste asistencia hoy" (asistencia sin reserva o en otra sede, que
   * el server cuenta como regular); la derivación cubre reabrir la app con otra
   * clase de la misma categoría ya marcada. Al cambiar el día de la sede el flag
   * deja de aplicar solo (la clave lleva `todayStr`).
   */
  function attendanceMarkedFor(kind: string): boolean {
    return (
      attendanceMarkedKeys.value.includes(`${todayStr.value}|${kind}`) ||
      todaysBookings.value.some(
        (b) =>
          activityKindKey(b) === kind &&
          (b.status === 'qr_escaneado' || b.status === 'confirmado' || !!b.checkedInAt),
      )
    )
  }

  /** Espejo de `matchingBooking` del server: reserva `reservado` de hoy en ventana, de categoría sin asistencia. */
  const windowBooking = computed<MyBookingRecord | null>(
    () =>
      todaysBookings.value
        .filter((b) => b.status === 'reservado')
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .find(
          (b) =>
            checkInWindowState(startOf(b), now.value) === 'open' &&
            !attendanceMarkedFor(activityKindKey(b)),
        ) ?? null,
  )

  /**
   * Marca la asistencia de hoy. La categoría se toma de la reserva en ventana EN
   * ESTE MOMENTO (el server hace lo mismo con `matchingBooking`; sin reserva =
   * regular): el flag se ata a la categoría de la reserva, no al día entero (D-06).
   */
  function markAttendanceDone(): void {
    const kind = windowBooking.value ? activityKindKey(windowBooking.value) : REGULAR_KIND
    const key = `${todayStr.value}|${kind}`
    if (!attendanceMarkedKeys.value.includes(key)) attendanceMarkedKeys.value.push(key)
  }

  /**
   * D-06: solo en la ventana ±20 min de una reserva `reservado` de hoy cuya
   * CATEGORÍA todavía no tiene asistencia. Si ya marcó otra clase de la misma
   * categoría, escanear falla -> no mostrar; si la marcada es de otra categoría
   * (Aura vs regular), sí.
   */
  const fabVisible = computed(() => windowBooking.value !== null)

  const attendanceMarkedAt = computed<string | null>(() => {
    const b = todayBooking.value
    if (!b || !b.checkedInAt) return null
    if (b.status !== 'qr_escaneado' && b.status !== 'confirmado') return null
    return formatTimeInTz(b.checkedInAt, bookingTz(b))
  })

  function startClock(): void {
    if (clock !== null) return
    clock = setInterval(() => {
      now.value = new Date()
    }, CLOCK_INTERVAL_MS)
  }

  function stopClock(): void {
    if (clock === null) return
    clearInterval(clock)
    clock = null
  }

  function reset(): void {
    generation++
    bookings.value = []
    loaded.value = false
    loadedTz.value = null
    loadFailed.value = false
    attendanceMarkedKeys.value = []
    stopClock()
  }

  return {
    bookings,
    loaded,
    loadFailed,
    loadedTz,
    now,
    tz,
    todayStr,
    todaysBookings,
    todayBooking,
    todayWaitlist,
    nextBooking,
    windowState,
    minutesToStart,
    windowBooking,
    fabVisible,
    attendanceMarkedAt,
    attendanceMarkedFor,
    markAttendanceDone,
    load,
    startClock,
    stopClock,
    reset,
  }
})
