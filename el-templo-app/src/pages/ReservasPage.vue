<template>
  <q-page class="reservas-page" padding>
    <!-- Loading overlay -->
    <div v-if="loading" class="loading-container">
      <q-spinner-dots size="50px" color="primary" />
    </div>

    <!-- Online user empty state (per D-15) -->
    <div v-else-if="isOnlineUser" class="reservas-empty-state">
      <div class="reservas-empty-state__content">
        <q-icon name="event_available" size="64px" color="grey-5" />
        <h2 class="reservas-empty-state__title">Activa Tu Plan</h2>
        <p class="reservas-empty-state__text">
          Visita una de nuestras sedes para reservar tus clases presenciales
        </p>
      </div>
    </div>

    <template v-else>
      <!-- Branch selector (multi-branch) or label (single branch) -->
      <div v-if="isMultiBranch && branches.length > 1" class="q-mb-sm">
        <q-select
          v-model="selectedBranchId"
          :options="branchOptions"
          dense
          outlined
          emit-value
          map-options
          class="branch-select"
        >
          <template #prepend>
            <q-icon name="location_on" size="16px" />
          </template>
        </q-select>
      </div>
      <p v-else class="branch-label">
        <q-icon name="location_on" size="14px" class="q-mr-xs" />
        {{ userStore.branchDisplayName }}
      </p>

      <!-- Section 1: My Week (past attendance + future bookings) -->
      <q-card class="upcoming-card q-mb-md" flat bordered>
        <q-card-section class="upcoming-header">
          <div class="reservas-card-title">Tus clases</div>
          <div class="weekly-limit text-caption">Semana del {{ weekLabel }}</div>
        </q-card-section>

        <q-card-section v-if="weekEvents.length === 0" class="text-center text-grey-6 q-py-lg">
          No tenés actividad esta semana
        </q-card-section>

        <q-list v-else separator>
          <!-- Past attendance records -->
          <q-item v-for="event in weekEvents" :key="event.key" class="booking-item">
            <q-item-section>
              <q-item-label class="text-weight-medium">
                {{ event.activityName }}
              </q-item-label>
              <q-item-label caption>
                {{ event.label }}
              </q-item-label>
            </q-item-section>

            <q-item-section side>
              <div class="row items-center no-wrap q-gutter-x-sm">
                <q-badge :color="event.badgeColor" :label="event.badgeLabel" />
                <q-btn
                  v-if="event.booking"
                  flat
                  round
                  dense
                  icon="close"
                  color="negative"
                  size="sm"
                  @click="promptCancelBooking(event.booking!)"
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
                <!-- Mañana / Tarde section labels -->
                <div
                  v-if="time === morningStartTime && hasAfternoonTimes"
                  class="grid-period-label"
                  :style="{ gridColumn: '1 / -1' }"
                >
                  Mañana
                </div>
                <div
                  v-if="time === afternoonStartTime && hasMorningTimes"
                  class="grid-period-label"
                  :style="{ gridColumn: '1 / -1' }"
                >
                  Tarde
                </div>

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
                    <template v-else-if="isCellAttended(day, time)">
                      <q-icon name="verified" size="18px" color="positive" />
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
                        color="primary"
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
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useQuasar } from 'quasar'
import { useSchedulingApi } from 'src/composables/useSchedulingApi'
import { useUserStore } from 'src/stores/useUserStore'
import { createLogger } from 'src/utils/logger'
import { extractError } from 'src/utils/extract-error'
import type {
  WeeklySlotView,
  BookingRecord,
  HolidayRecord,
  AttendanceWeekRecord,
  DayOfWeek,
} from 'src/types/scheduling'
import { DAY_LABELS, DAY_LABELS_FULL, BOOKING_STATUS_LABELS } from 'src/types/scheduling'

const $q = useQuasar()
const log = createLogger('Reservas')
const userStore = useUserStore()
const { getWeeklyGrid, reserve, cancelBooking, getBranches, cleanup } = useSchedulingApi()

// ─── State ───────────────────────────────────────────────────────────
const loading = ref(true)
const slots = ref<WeeklySlotView[]>([])
const holidays = ref<HolidayRecord[]>([])
const myBookings = ref<BookingRecord[]>([])
const myAttendance = ref<AttendanceWeekRecord[]>([])
const weekStart = ref<Date>(getMonday(new Date()))

// ─── Multi-branch ───────────────────────────────────────────────────
const branches = ref<{ id: number; name: string }[]>([])
const selectedBranchId = ref<number | null>(null)

const isOnlineUser = computed(() => userStore.profile?.branchIsVirtual ?? false)

const isMultiBranch = computed(() => userStore.subscription?.multiBranch ?? false)

const branchOptions = computed(() =>
  branches.value.map((b) => ({
    label: b.name.replace(/^El Templo\s+/i, 'Sede '),
    value: b.id,
  })),
)

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
  /** Booking ID to cancel before reserving (swap flow) */
  cancelFirst: null as number | null,
})

// ─── Cancel dialog ───────────────────────────────────────────────────
const cancelDialog = ref({
  show: false,
  message: '',
  loading: false,
  bookingId: 0,
})

// ─── Computed ────────────────────────────────────────────────────────

interface WeekEvent {
  key: string
  type: 'attendance' | 'booking'
  activityName: string
  dayOfWeek: number
  startTime: string
  date: string
  label: string
  badgeColor: string
  badgeLabel: string
  booking: BookingRecord | null
}

/** Unified week events: past attendance + future bookings, sorted chronologically */
const weekEvents = computed<WeekEvent[]>(() => {
  const now = new Date()
  const events: WeekEvent[] = []

  // Past attendance records
  for (const att of myAttendance.value) {
    const checkedIn = new Date(att.checkedInAt)
    const dateStr = checkedIn.toISOString().slice(0, 10)
    const dayLabel = DAY_LABELS_FULL[att.dayOfWeek as DayOfWeek] ?? ''
    const d = new Date(dateStr + 'T00:00:00')
    const dateLabel = `${d.getDate()} ${MONTH_ABBREV[d.getMonth()]}`

    events.push({
      key: `att-${att.id}`,
      type: 'attendance',
      activityName: att.activityName,
      dayOfWeek: att.dayOfWeek,
      startTime: att.startTime,
      date: dateStr,
      label: `${dayLabel} ${dateLabel} - ${formatTime(att.startTime)}`,
      badgeColor: att.status === 'confirmado' ? 'positive' : 'info',
      badgeLabel: att.status === 'confirmado' ? 'Asististe' : 'Check-in',
      booking: null,
    })
  }

  // All bookings (future active + past confirmed/no_show)
  for (const b of myBookings.value) {
    if (b.status === 'cancelado') continue

    // Skip if already have an attendance record for this schedule+date
    const hasAttendance = myAttendance.value.some((att) => {
      const attDate = new Date(att.checkedInAt).toISOString().slice(0, 10)
      return att.scheduleId === b.scheduleId && attDate === b.bookingDate
    })
    if (hasAttendance) continue

    const isPast = new Date(`${b.bookingDate}T${b.startTime}`) <= now
    // Skip past bookings that are still just "reservado" (not yet processed by cron)
    if (isPast && b.status !== 'confirmado' && b.status !== 'no_show') continue

    let badgeColor: string
    let badgeLabel: string
    if (b.status === 'no_show') {
      badgeColor = 'negative'
      badgeLabel = BOOKING_STATUS_LABELS.no_show
    } else if (b.status === 'confirmado') {
      badgeColor = 'positive'
      badgeLabel = 'Asististe'
    } else {
      badgeColor = b.status === 'reservado' || b.status === 'qr_escaneado' ? 'primary' : 'warning'
      badgeLabel = bookingStatusLabel(b)
    }

    events.push({
      key: `bk-${b.id}`,
      type: 'booking',
      activityName: b.activityName,
      dayOfWeek: b.dayOfWeek,
      startTime: b.startTime,
      date: b.bookingDate,
      label: formatBookingLabel(b),
      badgeColor,
      badgeLabel,
      booking: isPast ? null : b,
    })
  }

  // Sort by date then time
  return events.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date)
    if (dateCmp !== 0) return dateCmp
    return a.startTime.localeCompare(b.startTime)
  })
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

/** Morning/afternoon split for visual separation */
const morningStartTime = computed(() => uniqueTimes.value.find((t) => t < '12:00:00') ?? null)
const afternoonStartTime = computed(() => uniqueTimes.value.find((t) => t >= '12:00:00') ?? null)
const hasMorningTimes = computed(() => morningStartTime.value !== null)
const hasAfternoonTimes = computed(() => afternoonStartTime.value !== null)

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
    if (
      b.status === 'reservado' ||
      b.status === 'qr_escaneado' ||
      b.status === 'confirmado' ||
      b.status === 'lista_espera'
    ) {
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

/** Set of "scheduleId-date" for attended slots */
const attendedSlotKeys = computed(() => {
  const keys = new Set<string>()
  for (const att of myAttendance.value) {
    const attDate = new Date(att.checkedInAt).toISOString().slice(0, 10)
    keys.add(`${att.scheduleId}-${attDate}`)
  }
  return keys
})

function isCellAttended(day: DayOfWeek, time: string): boolean {
  const slot = getCellSlot(day, time)
  if (!slot) return false
  const date = dateForDay(day)
  return attendedSlotKeys.value.has(`${slot.id}-${date}`)
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
  const isAttended = isCellAttended(day, time)
  const isBooked = isCellBooked(day, time)
  const isPast = isCellPast(day, time)
  const isFull = slot?.isFull ?? false
  const hasSlot = !!slot

  return {
    'cell--holiday': isHoliday,
    'cell--attended': isAttended && !isHoliday,
    'cell--booked': isBooked && !isAttended && !isHoliday,
    'cell--full': isFull && !isBooked && !isAttended && !isHoliday,
    'cell--past': isPast && !isBooked && !isAttended,
    'cell--available': hasSlot && !isFull && !isBooked && !isAttended && !isHoliday && !isPast,
    'cell--empty': !hasSlot,
    'cell--tappable': hasSlot && !isBooked && !isAttended && !isHoliday && !isPast,
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
  if (booking.status === 'lista_espera' && booking.waitlistPosition !== null) {
    return `${BOOKING_STATUS_LABELS.lista_espera} (#${booking.waitlistPosition})`
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

  // Check if there's already a booking on this day
  const existingBooking = myBookings.value.find(
    (b) =>
      b.bookingDate === date &&
      (b.status === 'reservado' ||
        b.status === 'qr_escaneado' ||
        b.status === 'confirmado' ||
        b.status === 'lista_espera'),
  )

  if (existingBooking) {
    // Swap flow: offer to replace existing booking
    const existingTime = formatTime(existingBooking.startTime)
    reserveDialog.value = {
      show: true,
      title: 'Cambiar horario',
      message: `Ya tenés una reserva el ${dayLabel} ${dateStr} a las ${existingTime}. Querés cambiarla por las ${timeStr}?`,
      confirmLabel: 'Cambiar',
      confirmColor: 'primary',
      loading: false,
      scheduleId: slot.id,
      date,
      cancelFirst: existingBooking.id,
    }
  } else if (slot.isFull) {
    // Waitlist flow
    reserveDialog.value = {
      show: true,
      title: 'Horario completo',
      message: `Este horario está completo (${slot.bookedCount}/${slot.maxCapacity}). Querés anotarte en la lista de espera?`,
      confirmLabel: 'Lista de espera',
      confirmColor: 'warning',
      loading: false,
      scheduleId: slot.id,
      date,
      cancelFirst: null,
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
      cancelFirst: null,
    }
  }
}

async function confirmReserve() {
  reserveDialog.value.loading = true
  try {
    // Swap flow: cancel existing booking first
    if (reserveDialog.value.cancelFirst) {
      await cancelBooking(reserveDialog.value.cancelFirst)
      log.info('Swapped: cancelled old booking', {
        bookingId: reserveDialog.value.cancelFirst,
      })
    }

    const booking = await reserve(reserveDialog.value.scheduleId, reserveDialog.value.date)
    reserveDialog.value.show = false

    if (booking.status === 'lista_espera') {
      $q.notify({
        type: 'warning',
        message: `Te anotaste en la lista de espera (posicion #${booking.waitlistPosition})`,
      })
    } else {
      const wasSwap = reserveDialog.value.cancelFirst !== null
      $q.notify({
        type: 'positive',
        message: wasSwap ? 'Horario cambiado' : 'Reserva confirmada',
      })
    }

    log.info('Booking created', { bookingId: booking.id, status: booking.status })
    await loadGrid()
  } catch (err: unknown) {
    const message = extractError(err, 'Error al reservar')
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
    const message = extractError(err, 'Error al cancelar')
    $q.notify({ type: 'negative', message })
    log.warn('Cancel failed', { error: message })
  } finally {
    cancelDialog.value.loading = false
  }
}

// ─── Data loading ────────────────────────────────────────────────────

async function loadGrid() {
  try {
    const branchId = isMultiBranch.value ? (selectedBranchId.value ?? undefined) : undefined
    const data = await getWeeklyGrid(formatWeekStart(weekStart.value), branchId)
    slots.value = data.slots
    holidays.value = data.holidays
    myBookings.value = data.myBookings
    myAttendance.value = data.myAttendance
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'CanceledError') return
    const message = extractError(err, 'Error al cargar horarios')
    $q.notify({ type: 'negative', message })
    log.error('Failed to load grid', { error: message })
  } finally {
    loading.value = false
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────

watch(selectedBranchId, () => {
  loadGrid()
})

onMounted(async () => {
  if (isMultiBranch.value) {
    try {
      branches.value = await getBranches()
      // Default to user's own branch
      selectedBranchId.value = userStore.profile?.branchId ?? null
    } catch {
      // Non-critical, fall through to loadGrid with no branchId
    }
  }
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

.reservas-card-title {
  font-family: 'Montserrat', sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: $primary;
}

.branch-label {
  display: flex;
  align-items: center;
  font-family: 'Montserrat', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: rgba($primary, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 6px 8px 12px;
}

.branch-select {
  max-width: 250px;

  :deep(.q-field__native) {
    font-family: 'Montserrat', sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: rgba($primary, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
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
  color: rgba($primary, 0.6);
}

.day-date {
  font-size: 16px;
  font-weight: 700;
  color: $primary;
  line-height: 1.2;
}

.grid-period-label {
  font-family: 'Montserrat', sans-serif;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba($accent, 0.45);
  padding: 10px 4px 2px;
  border-bottom: 1px solid rgba($accent, 0.1);
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
  color: rgba($primary, 0.5);
  line-height: 1;
}

.cell-occupancy {
  font-size: 14px;
  font-weight: 700;
  color: $primary;
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

.cell--attended {
  background: rgba($positive, 0.12);
  border: 2px solid $positive;
  cursor: default;
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

/* Empty state for online users */
.reservas-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;

  &__content {
    text-align: center;
    padding: 32px;
  }

  &__title {
    font-family: 'Montserrat', sans-serif;
    font-size: 20px;
    font-weight: 700;
    color: $primary;
    margin: 16px 0 8px;
  }

  &__text {
    font-family: 'Geologica', sans-serif;
    font-size: 14px;
    color: #666;
    margin: 0;
    max-width: 280px;
    margin-inline: auto;
  }
}
</style>
