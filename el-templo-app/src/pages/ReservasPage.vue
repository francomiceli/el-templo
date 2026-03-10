<template>
  <q-page class="reservas-page" padding>
    <!-- Loading overlay -->
    <div v-if="loading" class="loading-container">
      <q-spinner-orbit size="60px" color="primary" />
    </div>

    <template v-else>
      <!-- Section 1: Upcoming Reservations -->
      <q-card class="upcoming-card q-mb-md" flat bordered>
        <q-card-section class="upcoming-header">
          <div class="text-subtitle1 text-weight-bold">Tus proximas reservas</div>
          <div v-if="weeklyLimitText" class="weekly-limit text-caption">
            {{ weeklyLimitText }}
          </div>
        </q-card-section>

        <q-card-section
          v-if="upcomingBookings.length === 0"
          class="text-center text-grey-6 q-py-lg"
        >
          No tenes reservas esta semana
        </q-card-section>

        <q-list v-else separator>
          <q-item v-for="booking in upcomingBookings" :key="booking.id" class="booking-item">
            <q-item-section>
              <q-item-label class="text-weight-medium">
                {{ booking.activityName }}
              </q-item-label>
              <q-item-label caption>
                {{ formatBookingLabel(booking) }}
              </q-item-label>
            </q-item-section>

            <q-item-section side>
              <div class="row items-center no-wrap q-gutter-x-sm">
                <q-badge
                  :color="booking.status === 'confirmed' ? 'positive' : 'warning'"
                  :label="bookingStatusLabel(booking)"
                />
                <q-btn
                  flat
                  round
                  dense
                  icon="close"
                  color="negative"
                  size="sm"
                  @click="promptCancelBooking(booking)"
                >
                  <q-tooltip>Cancelar reserva</q-tooltip>
                </q-btn>
              </div>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card>

      <!-- Section 2: Weekly Calendar Grid -->
      <q-card flat bordered>
        <q-card-section class="week-nav">
          <q-btn flat dense round icon="chevron_left" @click="changeWeek(-1)" />
          <div class="week-label">
            <q-btn flat dense no-caps class="week-label-btn" @click="goToCurrentWeek">
              {{ weekLabel }}
            </q-btn>
          </div>
          <q-btn flat dense round icon="chevron_right" @click="changeWeek(1)" />
        </q-card-section>

        <q-card-section class="grid-section q-pa-none">
          <div class="grid-scroll">
            <div class="schedule-grid" :style="gridStyle">
              <!-- Day headers -->
              <div v-for="day in visibleDays" :key="'h-' + day" class="grid-header">
                <div class="day-abbrev">{{ DAY_LABELS[day] }}</div>
                <div class="day-date">{{ dayDateNumber(day) }}</div>
              </div>

              <!-- Time slot rows -->
              <template v-for="time in uniqueTimes" :key="time">
                <div
                  v-for="day in visibleDays"
                  :key="time + '-' + day"
                  class="grid-cell"
                  :class="cellClass(day, time)"
                  @click="onCellTap(day, time)"
                >
                  <span class="cell-time">{{ formatTime(time) }}</span>
                  <template v-if="getCellSlot(day, time)">
                    <template v-if="isCellHoliday(day, time)">
                      <span class="cell-status">FERIADO</span>
                    </template>
                    <template v-else-if="isCellBooked(day, time)">
                      <span class="cell-occupancy">
                        {{ getCellSlot(day, time)!.bookedCount }}/{{
                          getCellSlot(day, time)!.maxCapacity
                        }}
                      </span>
                      <q-icon
                        name="check_circle"
                        size="14px"
                        color="positive"
                        class="cell-booked-icon"
                      />
                    </template>
                    <template v-else-if="getCellSlot(day, time)!.isFull">
                      <span class="cell-status cell-status--full">COMPLETO</span>
                      <span class="cell-occupancy cell-occupancy--full">
                        {{ getCellSlot(day, time)!.bookedCount }}/{{
                          getCellSlot(day, time)!.maxCapacity
                        }}
                      </span>
                    </template>
                    <template v-else>
                      <span class="cell-occupancy">
                        {{ getCellSlot(day, time)!.bookedCount }}/{{
                          getCellSlot(day, time)!.maxCapacity
                        }}
                      </span>
                    </template>
                  </template>
                  <template v-else>
                    <span class="cell-empty">&mdash;</span>
                  </template>
                </div>
              </template>
            </div>
          </div>
        </q-card-section>
      </q-card>
    </template>

    <!-- Reserve confirmation dialog -->
    <q-dialog v-model="reserveDialog.show" persistent>
      <q-card style="min-width: 300px">
        <q-card-section>
          <div class="text-h6">{{ reserveDialog.title }}</div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          {{ reserveDialog.message }}
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" color="grey" v-close-popup />
          <q-btn
            flat
            :label="reserveDialog.confirmLabel"
            :color="reserveDialog.confirmColor"
            :loading="reserveDialog.loading"
            @click="confirmReserve"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Cancel confirmation dialog -->
    <q-dialog v-model="cancelDialog.show" persistent>
      <q-card style="min-width: 300px">
        <q-card-section>
          <div class="text-h6">Cancelar reserva</div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          {{ cancelDialog.message }}
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Volver" color="grey" v-close-popup />
          <q-btn
            flat
            label="Cancelar reserva"
            color="negative"
            :loading="cancelDialog.loading"
            @click="confirmCancel"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useQuasar } from 'quasar'
import { useSchedulingApi } from 'src/composables/useSchedulingApi'
import { createLogger } from 'src/utils/logger'
import type { WeeklySlotView, BookingRecord, HolidayRecord, DayOfWeek } from 'src/types/scheduling'
import { DAY_LABELS, DAY_LABELS_FULL, BOOKING_STATUS_LABELS } from 'src/types/scheduling'

const $q = useQuasar()
const log = createLogger('Reservas')
const { getWeeklyGrid, reserve, cancelBooking, cleanup } = useSchedulingApi()

// ─── State ───────────────────────────────────────────────────────────
const loading = ref(true)
const slots = ref<WeeklySlotView[]>([])
const holidays = ref<HolidayRecord[]>([])
const myBookings = ref<BookingRecord[]>([])
const weekStart = ref<Date>(getMonday(new Date()))

// ─── Reserve dialog ──────────────────────────────────────────────────
const reserveDialog = ref({
  show: false,
  title: '',
  message: '',
  confirmLabel: 'Confirmar',
  confirmColor: 'primary',
  loading: false,
  scheduleId: 0,
  date: '',
})

// ─── Cancel dialog ───────────────────────────────────────────────────
const cancelDialog = ref({
  show: false,
  message: '',
  loading: false,
  bookingId: 0,
})

// ─── Computed ────────────────────────────────────────────────────────

/** Active (confirmed or waitlist) bookings for the current week, sorted by date */
const upcomingBookings = computed(() =>
  myBookings.value
    .filter((b) => b.status === 'confirmed' || b.status === 'waitlist')
    .sort((a, b) => {
      const dayDiff = a.dayOfWeek - b.dayOfWeek
      if (dayDiff !== 0) return dayDiff
      return a.startTime.localeCompare(b.startTime)
    }),
)

/** Weekly limit text: "Reservas: 2/3 esta semana" */
const weeklyLimitText = computed(() => {
  const count = upcomingBookings.value.filter((b) => b.status === 'confirmed').length
  // We don't have classesPerWeek from the API response directly,
  // so we show the confirmed count only
  return `Reservas confirmadas: ${count} esta semana`
})

/** Which days (1-6) have at least one slot */
const visibleDays = computed<DayOfWeek[]>(() => {
  const days = new Set<DayOfWeek>()
  for (const slot of slots.value) {
    days.add(slot.dayOfWeek as DayOfWeek)
  }
  const sorted = Array.from(days).sort((a, b) => a - b)
  // Always include Mon-Fri at minimum if we have any slots
  if (sorted.length > 0) {
    const result = new Set(sorted)
    for (let d = 1; d <= 5; d++) {
      result.add(d as DayOfWeek)
    }
    return Array.from(result).sort((a, b) => a - b) as DayOfWeek[]
  }
  // Default Mon-Fri if no slots loaded yet
  return [1, 2, 3, 4, 5] as DayOfWeek[]
})

/** Unique start times across all slots, sorted */
const uniqueTimes = computed(() => {
  const times = new Set<string>()
  for (const slot of slots.value) {
    times.add(slot.startTime)
  }
  return Array.from(times).sort()
})

/** CSS grid columns based on visible days */
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${visibleDays.value.length}, 1fr)`,
}))

/** Week label like "10 Mar - 15 Mar" */
const weekLabel = computed(() => {
  const start = weekStart.value
  const end = new Date(start)
  end.setDate(end.getDate() + (visibleDays.value.includes(6 as DayOfWeek) ? 5 : 4))
  const fmt = (d: Date) => `${d.getDate()} ${MONTH_ABBREV[d.getMonth()]}`
  return `${fmt(start)} - ${fmt(end)}`
})

const MONTH_ABBREV = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
]

// ─── Slot lookup helpers ─────────────────────────────────────────────

/** Map of "dayOfWeek-startTime" -> slot for O(1) lookup */
const slotMap = computed(() => {
  const map = new Map<string, WeeklySlotView>()
  for (const slot of slots.value) {
    map.set(`${slot.dayOfWeek}-${slot.startTime}`, slot)
  }
  return map
})

/** Set of "scheduleId" for booked slots */
const bookedScheduleIds = computed(() => {
  const ids = new Set<number>()
  for (const b of myBookings.value) {
    if (b.status === 'confirmed' || b.status === 'waitlist') {
      ids.add(b.scheduleId)
    }
  }
  return ids
})

/** Set of holiday dates (YYYY-MM-DD) */
const holidayDates = computed(() => {
  const dates = new Set<string>()
  for (const h of holidays.value) {
    dates.add(h.date)
  }
  return dates
})

function getCellSlot(day: DayOfWeek, time: string): WeeklySlotView | undefined {
  return slotMap.value.get(`${day}-${time}`)
}

function isCellBooked(day: DayOfWeek, time: string): boolean {
  const slot = getCellSlot(day, time)
  return slot ? bookedScheduleIds.value.has(slot.id) : false
}

function isCellHoliday(day: DayOfWeek, time: string): boolean {
  const slot = getCellSlot(day, time)
  if (!slot) return false
  if (slot.isHoliday) return true
  const date = dateForDay(day)
  return holidayDates.value.has(date)
}

function isCellPast(day: DayOfWeek, time: string): boolean {
  const dateStr = dateForDay(day)
  const now = new Date()
  const slotDateTime = new Date(`${dateStr}T${time}`)
  return slotDateTime < now
}

function cellClass(day: DayOfWeek, time: string): Record<string, boolean> {
  const slot = getCellSlot(day, time)
  const isHoliday = isCellHoliday(day, time)
  const isBooked = isCellBooked(day, time)
  const isPast = isCellPast(day, time)
  const isFull = slot?.isFull ?? false
  const hasSlot = !!slot

  return {
    'cell--holiday': isHoliday,
    'cell--booked': isBooked && !isHoliday,
    'cell--full': isFull && !isBooked && !isHoliday,
    'cell--past': isPast && !isBooked,
    'cell--available': hasSlot && !isFull && !isBooked && !isHoliday && !isPast,
    'cell--empty': !hasSlot,
    'cell--tappable': hasSlot && !isBooked && !isHoliday && !isPast,
  }
}

// ─── Week navigation ─────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  // getDay(): 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function changeWeek(delta: number) {
  const d = new Date(weekStart.value)
  d.setDate(d.getDate() + delta * 7)
  weekStart.value = d
  loadGrid()
}

function goToCurrentWeek() {
  weekStart.value = getMonday(new Date())
  loadGrid()
}

function formatWeekStart(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function dateForDay(day: DayOfWeek): string {
  const d = new Date(weekStart.value)
  d.setDate(d.getDate() + (day - 1))
  return d.toISOString().slice(0, 10)
}

function dayDateNumber(day: DayOfWeek): string {
  const d = new Date(weekStart.value)
  d.setDate(d.getDate() + (day - 1))
  return String(d.getDate())
}

// ─── Formatting ──────────────────────────────────────────────────────

function formatTime(time: string): string {
  // "07:00:00" -> "7:00", "08:00:00" -> "8:00"
  const parts = time.split(':')
  const hour = parseInt(parts[0], 10)
  return `${hour}:${parts[1]}`
}

function formatBookingLabel(booking: BookingRecord): string {
  const dayLabel = DAY_LABELS_FULL[booking.dayOfWeek as DayOfWeek] ?? ''
  const d = new Date(booking.bookingDate + 'T00:00:00')
  const dateStr = `${d.getDate()} ${MONTH_ABBREV[d.getMonth()]}`
  return `${dayLabel} ${dateStr} - ${formatTime(booking.startTime)}`
}

function bookingStatusLabel(booking: BookingRecord): string {
  if (booking.status === 'waitlist' && booking.waitlistPosition !== null) {
    return `${BOOKING_STATUS_LABELS.waitlist} (#${booking.waitlistPosition})`
  }
  return BOOKING_STATUS_LABELS[booking.status] ?? booking.status
}

// ─── Booking flow ────────────────────────────────────────────────────

function onCellTap(day: DayOfWeek, time: string) {
  const slot = getCellSlot(day, time)
  if (!slot) return
  if (isCellHoliday(day, time)) return
  if (isCellBooked(day, time)) return
  if (isCellPast(day, time)) return

  const date = dateForDay(day)
  const dayLabel = DAY_LABELS_FULL[day]
  const d = new Date(date + 'T00:00:00')
  const dateStr = `${d.getDate()} ${MONTH_ABBREV[d.getMonth()]}`
  const timeStr = formatTime(time)

  if (slot.isFull) {
    // Waitlist flow
    reserveDialog.value = {
      show: true,
      title: 'Horario completo',
      message: `Este horario esta completo (${slot.bookedCount}/${slot.maxCapacity}). Queres anotarte en la lista de espera?`,
      confirmLabel: 'Lista de espera',
      confirmColor: 'warning',
      loading: false,
      scheduleId: slot.id,
      date,
    }
  } else {
    // Normal reserve flow
    reserveDialog.value = {
      show: true,
      title: 'Reservar',
      message: `Reservar ${slot.activityName} ${dayLabel} ${dateStr} ${timeStr}?`,
      confirmLabel: 'Confirmar',
      confirmColor: 'primary',
      loading: false,
      scheduleId: slot.id,
      date,
    }
  }
}

async function confirmReserve() {
  reserveDialog.value.loading = true
  try {
    const booking = await reserve(reserveDialog.value.scheduleId, reserveDialog.value.date)
    reserveDialog.value.show = false

    if (booking.status === 'waitlist') {
      $q.notify({
        type: 'warning',
        message: `Te anotaste en la lista de espera (posicion #${booking.waitlistPosition})`,
      })
    } else {
      $q.notify({
        type: 'positive',
        message: 'Reserva confirmada',
      })
    }

    log.info('Booking created', { bookingId: booking.id, status: booking.status })
    await loadGrid()
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { message?: string } } }
    const message = axiosError.response?.data?.message || 'Error al reservar'
    $q.notify({ type: 'negative', message })
    log.warn('Reserve failed', { error: message })
  } finally {
    reserveDialog.value.loading = false
  }
}

// ─── Cancel flow ─────────────────────────────────────────────────────

function promptCancelBooking(booking: BookingRecord) {
  const dayLabel = DAY_LABELS_FULL[booking.dayOfWeek as DayOfWeek] ?? ''
  const timeStr = formatTime(booking.startTime)

  cancelDialog.value = {
    show: true,
    message: `Cancelar reserva de ${dayLabel} ${timeStr}?`,
    loading: false,
    bookingId: booking.id,
  }
}

async function confirmCancel() {
  cancelDialog.value.loading = true
  try {
    await cancelBooking(cancelDialog.value.bookingId)
    cancelDialog.value.show = false

    $q.notify({
      type: 'positive',
      message: 'Reserva cancelada',
    })

    log.info('Booking cancelled', { bookingId: cancelDialog.value.bookingId })
    await loadGrid()
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { message?: string } } }
    const message = axiosError.response?.data?.message || 'Error al cancelar'
    $q.notify({ type: 'negative', message })
    log.warn('Cancel failed', { error: message })
  } finally {
    cancelDialog.value.loading = false
  }
}

// ─── Data loading ────────────────────────────────────────────────────

async function loadGrid() {
  try {
    const data = await getWeeklyGrid(formatWeekStart(weekStart.value))
    slots.value = data.slots
    holidays.value = data.holidays
    myBookings.value = data.myBookings
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'CanceledError') return
    const axiosError = err as { response?: { data?: { message?: string } } }
    const message = axiosError.response?.data?.message || 'Error al cargar horarios'
    $q.notify({ type: 'negative', message })
    log.error('Failed to load grid', { error: message })
  } finally {
    loading.value = false
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────

onMounted(() => {
  loadGrid()
})

onBeforeUnmount(() => {
  cleanup()
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.reservas-page {
  max-width: 600px;
  margin: 0 auto;
}

.loading-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

// ─── Upcoming Reservations ───────────────────────────────────────────

.upcoming-card {
  border-color: rgba($primary, 0.2);
}

.upcoming-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px;
}

.weekly-limit {
  color: $secondary;
  font-weight: 500;
}

.booking-item {
  min-height: 52px;
}

// ─── Week Navigation ─────────────────────────────────────────────────

.week-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
}

.week-label {
  font-family: 'Montserrat', sans-serif;
  font-size: 0.9rem;
  font-weight: 600;
  text-align: center;
}

.week-label-btn {
  font-family: 'Montserrat', sans-serif;
  font-size: 0.9rem;
  font-weight: 600;
  color: $primary;
}

// ─── Schedule Grid ───────────────────────────────────────────────────

.grid-section {
  overflow: hidden;
}

.grid-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.schedule-grid {
  display: grid;
  gap: 2px;
  padding: 0 8px 12px;
  min-width: 320px;
}

.grid-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 2px;
  border-bottom: 2px solid rgba($primary, 0.3);
}

.day-abbrev {
  font-family: 'Montserrat', sans-serif;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: $accent;
}

.day-date {
  font-size: 16px;
  font-weight: 700;
  color: $accent;
  line-height: 1.2;
}

.grid-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  padding: 4px 2px;
  border-radius: 6px;
  gap: 1px;
  transition: background-color 150ms ease;
  user-select: none;
}

.cell-time {
  font-size: 11px;
  color: rgba($accent, 0.5);
  line-height: 1;
}

.cell-occupancy {
  font-size: 14px;
  font-weight: 700;
  color: $accent;
  line-height: 1.2;

  &--full {
    font-size: 11px;
    color: $negative;
  }
}

.cell-status {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  line-height: 1;

  &--full {
    color: $negative;
  }
}

.cell-booked-icon {
  margin-top: 1px;
}

.cell-empty {
  font-size: 14px;
  color: rgba($accent, 0.15);
}

// ─── Cell states ─────────────────────────────────────────────────────

.cell--available {
  background: rgba($primary, 0.06);
  cursor: pointer;

  &:active {
    background: rgba($primary, 0.15);
  }
}

.cell--tappable {
  cursor: pointer;
}

.cell--full {
  background: rgba($negative, 0.08);
  cursor: pointer;

  &:active {
    background: rgba($negative, 0.15);
  }
}

.cell--booked {
  background: rgba($primary, 0.12);
  border: 2px solid $primary;
  cursor: default;
}

.cell--holiday {
  background: rgba($accent, 0.06);
  cursor: default;

  .cell-time {
    color: rgba($accent, 0.3);
  }

  .cell-status {
    color: rgba($accent, 0.4);
    font-size: 8px;
  }
}

.cell--past {
  opacity: 0.35;
  cursor: default;
}

.cell--empty {
  cursor: default;
}
</style>
