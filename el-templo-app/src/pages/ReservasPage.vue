<template>
  <q-page class="reservas" padding>
    <!-- Loading -->
    <div v-if="loading" class="reservas__loading">
      <q-spinner-dots size="50px" color="primary" />
    </div>

    <!-- Online user empty state -->
    <div v-else-if="isOnlineUser" class="reservas__empty">
      <q-icon name="event_available" size="64px" color="grey-5" />
      <h2 class="reservas__empty-title">Activa Tu Plan</h2>
      <p class="reservas__empty-text">
        Visita una de nuestras sedes para reservar tus clases presenciales
      </p>
    </div>

    <template v-else>
      <!-- Branch selector -->
      <div v-if="isMultiBranch && branches.length > 1" class="q-mb-md">
        <q-select
          v-model="selectedBranchId"
          :options="branchOptions"
          dense
          rounded
          outlined
          emit-value
          map-options
          class="branch-select"
        >
          <template #prepend>
            <q-icon name="location_on" size="18px" color="primary" />
          </template>
          <template #append>
            <q-icon name="unfold_more" size="16px" color="grey-6" />
          </template>
        </q-select>
      </div>
      <p v-else class="branch-label">
        <q-icon name="location_on" size="14px" class="q-mr-xs" />
        {{ userStore.branchDisplayName }}
      </p>

      <!-- Next class hero card -->
      <div class="next-class-card q-mb-md">
        <div class="next-class-card__icon">
          <q-icon :name="nextBooking ? 'event' : 'event_available'" size="28px" color="primary" />
        </div>
        <div v-if="nextBooking" class="next-class-card__info">
          <p class="next-class-card__label">Próxima clase</p>
          <p class="next-class-card__activity">{{ nextBooking.activityName }}</p>
          <p class="next-class-card__time">
            {{ formatBookingDay(nextBooking) }} · {{ formatTime(nextBooking.startTime) }}
          </p>
        </div>
        <div v-else class="next-class-card__info">
          <p class="next-class-card__label">Próxima clase</p>
          <p class="next-class-card__activity-empty">Elegí un horario para reservar</p>
        </div>
        <q-btn
          v-if="nextBooking"
          flat
          round
          dense
          icon="close"
          color="negative"
          size="sm"
          @click="promptCancelBooking(nextBooking)"
        >
          <q-tooltip>Cancelar</q-tooltip>
        </q-btn>
      </div>

      <!-- Day selector strip -->
      <div class="day-strip q-mb-md">
        <div class="day-strip__nav">
          <q-btn flat dense round icon="chevron_left" size="sm" @click="changeWeek(-1)" />
          <q-btn flat dense no-caps class="day-strip__week-label" @click="goToCurrentWeek">
            {{ weekLabel }}
          </q-btn>
          <q-btn flat dense round icon="chevron_right" size="sm" @click="changeWeek(1)" />
        </div>
        <div class="day-strip__days">
          <button
            v-for="day in visibleDays"
            :key="day"
            class="day-pill"
            :class="{
              'day-pill--selected': selectedDay === day,
              'day-pill--today': isToday(day),
              'day-pill--has-booking': dayHasBooking(day),
              'day-pill--past': isDayPast(day),
            }"
            @click="selectedDay = day"
          >
            <span class="day-pill__abbrev">{{ DAY_LABELS[day] }}</span>
            <span class="day-pill__date">{{ dayDateNumber(day) }}</span>
            <span v-if="dayAvailableCount(day) > 0 && !isDayPast(day)" class="day-pill__avail">
              {{ dayAvailableCount(day) }}
            </span>
            <span v-if="dayHasBooking(day)" class="day-pill__dot"></span>
          </button>
        </div>
      </div>

      <!-- Selected day's slots -->
      <div class="day-slots">
        <!-- Holiday banner -->
        <div v-if="selectedDayHoliday" class="day-slots__holiday">
          <q-icon name="celebration" size="20px" />
          <span>{{ selectedDayHoliday }}</span>
        </div>

        <!-- Morning section -->
        <template v-if="morningSlots.length > 0">
          <p v-if="afternoonSlots.length > 0" class="day-slots__period">Turno Mañana</p>
          <div
            v-for="slot in morningSlots"
            :key="slot.id"
            class="slot-card"
            :class="slotCardClass(slot)"
            @click="onSlotTap(slot)"
          >
            <div class="slot-card__time">
              <span class="slot-card__hour">{{ formatTime(slot.startTime) }}</span>
              <span class="slot-card__activity">{{ slot.activityName }}</span>
            </div>
            <div class="slot-card__right">
              <template v-if="isSlotHoliday(slot)">
                <q-badge color="accent" label="Feriado" />
              </template>
              <template v-else-if="isSlotAttended(slot)">
                <q-icon name="verified" size="20px" color="positive" />
                <span class="slot-card__badge slot-card__badge--positive">Asististe</span>
              </template>
              <template v-else-if="isSlotBooked(slot)">
                <q-icon name="check_circle" size="20px" color="primary" />
                <span class="slot-card__badge slot-card__badge--primary">Reservado</span>
              </template>
              <template v-else-if="slot.isFull">
                <span class="slot-card__occupancy slot-card__occupancy--full">
                  {{ slot.bookedCount }}/{{ slot.maxCapacity }}
                </span>
                <span class="slot-card__badge slot-card__badge--full">Completo</span>
              </template>
              <template v-else-if="isSlotPast(slot)">
                <span class="slot-card__occupancy"
                  >{{ slot.bookedCount }}/{{ slot.maxCapacity }}</span
                >
              </template>
              <template v-else>
                <span class="slot-card__occupancy"
                  >{{ slot.bookedCount }}/{{ slot.maxCapacity }}</span
                >
                <q-btn
                  flat
                  dense
                  no-caps
                  color="primary"
                  label="Reservar"
                  class="slot-card__action"
                  @click.stop="onSlotTap(slot)"
                />
              </template>
            </div>
          </div>
        </template>

        <!-- Afternoon section -->
        <template v-if="afternoonSlots.length > 0">
          <p v-if="morningSlots.length > 0" class="day-slots__period">Turno Tarde</p>
          <div
            v-for="slot in afternoonSlots"
            :key="slot.id"
            class="slot-card"
            :class="slotCardClass(slot)"
            @click="onSlotTap(slot)"
          >
            <div class="slot-card__time">
              <span class="slot-card__hour">{{ formatTime(slot.startTime) }}</span>
              <span class="slot-card__activity">{{ slot.activityName }}</span>
            </div>
            <div class="slot-card__right">
              <template v-if="isSlotHoliday(slot)">
                <q-badge color="accent" label="Feriado" />
              </template>
              <template v-else-if="isSlotAttended(slot)">
                <q-icon name="verified" size="20px" color="positive" />
                <span class="slot-card__badge slot-card__badge--positive">Asististe</span>
              </template>
              <template v-else-if="isSlotBooked(slot)">
                <q-icon name="check_circle" size="20px" color="primary" />
                <span class="slot-card__badge slot-card__badge--primary">Reservado</span>
              </template>
              <template v-else-if="slot.isFull">
                <span class="slot-card__occupancy slot-card__occupancy--full">
                  {{ slot.bookedCount }}/{{ slot.maxCapacity }}
                </span>
                <span class="slot-card__badge slot-card__badge--full">Completo</span>
              </template>
              <template v-else-if="isSlotPast(slot)">
                <span class="slot-card__occupancy"
                  >{{ slot.bookedCount }}/{{ slot.maxCapacity }}</span
                >
              </template>
              <template v-else>
                <span class="slot-card__occupancy"
                  >{{ slot.bookedCount }}/{{ slot.maxCapacity }}</span
                >
                <q-btn
                  flat
                  dense
                  no-caps
                  color="primary"
                  label="Reservar"
                  class="slot-card__action"
                  @click.stop="onSlotTap(slot)"
                />
              </template>
            </div>
          </div>
        </template>

        <!-- No slots -->
        <div
          v-if="morningSlots.length === 0 && afternoonSlots.length === 0"
          class="day-slots__empty"
        >
          <q-icon name="event_busy" size="40px" color="grey-4" />
          <p>No hay horarios este día</p>
        </div>
      </div>

      <p class="reservas__policy">
        Podés reservar hasta 5 minutos antes del inicio de la clase. Las cancelaciones deben hacerse
        con al menos 20 minutos de anticipación.
      </p>

      <!-- Week activity summary (collapsible) -->
      <q-expansion-item
        class="week-summary q-mt-md"
        icon="history"
        label="Tu actividad esta semana"
        header-class="week-summary__header"
        dense
      >
        <q-list v-if="weekEvents.length > 0" separator class="week-summary__list">
          <q-item v-for="event in weekEvents" :key="event.key" dense>
            <q-item-section>
              <q-item-label class="text-weight-medium text-body2">
                {{ event.activityName }}
              </q-item-label>
              <q-item-label caption>{{ event.label }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-badge :color="event.badgeColor" :label="event.badgeLabel" />
            </q-item-section>
          </q-item>
        </q-list>
        <div v-else class="q-pa-md text-center text-grey-6 text-body2">
          No tenés actividad esta semana
        </div>
      </q-expansion-item>
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
const log = createLogger('ReservasV2')
const userStore = useUserStore()
const { getWeeklyGrid, reserve, cancelBooking, getBranches, cleanup } = useSchedulingApi()

// ─── State ───────────────────────────────────────────────────────────
const loading = ref(true)
const slots = ref<WeeklySlotView[]>([])
const holidays = ref<HolidayRecord[]>([])
const myBookings = ref<BookingRecord[]>([])
const myAttendance = ref<AttendanceWeekRecord[]>([])
const weekStart = ref<Date>(getMonday(new Date()))
const selectedDay = ref<DayOfWeek>(getTodayDow())

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

// ─── Dialogs ────────────────────────────────────────────────────────
const reserveDialog = ref({
  show: false,
  title: '',
  message: '',
  confirmLabel: 'Confirmar',
  confirmColor: 'primary',
  loading: false,
  scheduleId: 0,
  date: '',
  cancelFirst: null as number | null,
})

const cancelDialog = ref({
  show: false,
  message: '',
  loading: false,
  bookingId: 0,
})

// ─── Helpers ────────────────────────────────────────────────────────

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

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function getTodayDow(): DayOfWeek {
  const d = new Date().getDay()
  // Sunday = 0 → default to Monday
  return (d === 0 ? 1 : d) as DayOfWeek
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

function formatTime(time: string): string {
  const parts = time.split(':')
  const hour = parseInt(parts[0], 10)
  return `${hour}:${parts[1]}`
}

function isToday(day: DayOfWeek): boolean {
  const today = new Date()
  const dayDate = new Date(weekStart.value)
  dayDate.setDate(dayDate.getDate() + (day - 1))
  return (
    dayDate.getFullYear() === today.getFullYear() &&
    dayDate.getMonth() === today.getMonth() &&
    dayDate.getDate() === today.getDate()
  )
}

function isDayPast(day: DayOfWeek): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dayDate = new Date(weekStart.value)
  dayDate.setDate(dayDate.getDate() + (day - 1))
  return dayDate < today
}

// ─── Computed ───────────────────────────────────────────────────────

const visibleDays = computed<DayOfWeek[]>(() => {
  const days = new Set<DayOfWeek>()
  for (const slot of slots.value) {
    days.add(slot.dayOfWeek as DayOfWeek)
  }
  if (days.size > 0) {
    for (let d = 1; d <= 5; d++) days.add(d as DayOfWeek)
    return Array.from(days).sort((a, b) => a - b) as DayOfWeek[]
  }
  return [1, 2, 3, 4, 5] as DayOfWeek[]
})

const weekLabel = computed(() => {
  const monthNames = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ]
  const start = weekStart.value
  const end = new Date(start)
  end.setDate(end.getDate() + (visibleDays.value.includes(6 as DayOfWeek) ? 5 : 4))

  const firstDay = start.getDate()
  const firstMonth = monthNames[start.getMonth()]
  const lastDay = end.getDate()
  const lastMonth = monthNames[end.getMonth()]

  if (firstMonth === lastMonth) {
    return `${firstDay} al ${lastDay} de ${firstMonth}`
  }
  return `${firstDay} de ${firstMonth} al ${lastDay} de ${lastMonth}`
})

/** Lookup maps */
const bookedScheduleIds = computed(() => {
  const ids = new Set<number>()
  for (const b of myBookings.value) {
    if (['reservado', 'qr_escaneado', 'confirmado', 'lista_espera'].includes(b.status)) {
      ids.add(b.scheduleId)
    }
  }
  return ids
})

const holidayDates = computed(() => {
  const dates = new Set<string>()
  for (const h of holidays.value) dates.add(h.date)
  return dates
})

const attendedSlotKeys = computed(() => {
  const keys = new Set<string>()
  for (const att of myAttendance.value) {
    const attDate = new Date(att.checkedInAt).toISOString().slice(0, 10)
    keys.add(`${att.scheduleId}-${attDate}`)
  }
  return keys
})

/** Slots for selected day, sorted by time */
const selectedDaySlots = computed(() =>
  slots.value
    .filter((s) => s.dayOfWeek === selectedDay.value)
    .sort((a, b) => a.startTime.localeCompare(b.startTime)),
)

const morningSlots = computed(() => selectedDaySlots.value.filter((s) => s.startTime < '12:00:00'))
const afternoonSlots = computed(() =>
  selectedDaySlots.value.filter((s) => s.startTime >= '12:00:00'),
)

const selectedDayHoliday = computed(() => {
  const date = dateForDay(selectedDay.value)
  const h = holidays.value.find((hol) => hol.date === date)
  return h?.name ?? null
})

/** Next upcoming active booking */
const nextBooking = computed<BookingRecord | null>(() => {
  const now = new Date()
  return (
    myBookings.value
      .filter((b) => {
        if (b.status !== 'reservado' && b.status !== 'qr_escaneado' && b.status !== 'lista_espera')
          return false
        return new Date(`${b.bookingDate}T${b.startTime}`) > now
      })
      .sort((a, b) => {
        const da = `${a.bookingDate}T${a.startTime}`
        const db = `${b.bookingDate}T${b.startTime}`
        return da.localeCompare(db)
      })[0] ?? null
  )
})

// ─── Day pill helpers ───────────────────────────────────────────────

function dayHasBooking(day: DayOfWeek): boolean {
  const date = dateForDay(day)
  return myBookings.value.some(
    (b) =>
      b.bookingDate === date &&
      ['reservado', 'qr_escaneado', 'confirmado', 'lista_espera'].includes(b.status),
  )
}

function dayAvailableCount(day: DayOfWeek): number {
  return slots.value.filter((s) => {
    if (s.dayOfWeek !== day) return false
    if (s.isFull) return false
    if (s.isHoliday) return false
    if (bookedScheduleIds.value.has(s.id)) return false
    const date = dateForDay(day)
    if (new Date(`${date}T${s.startTime}`) < new Date()) return false
    return true
  }).length
}

// ─── Slot state helpers ─────────────────────────────────────────────

function isSlotBooked(slot: WeeklySlotView): boolean {
  return bookedScheduleIds.value.has(slot.id)
}

function isSlotAttended(slot: WeeklySlotView): boolean {
  const date = dateForDay(slot.dayOfWeek as DayOfWeek)
  return attendedSlotKeys.value.has(`${slot.id}-${date}`)
}

function isSlotHoliday(slot: WeeklySlotView): boolean {
  if (slot.isHoliday) return true
  const date = dateForDay(slot.dayOfWeek as DayOfWeek)
  return holidayDates.value.has(date)
}

function isSlotPast(slot: WeeklySlotView): boolean {
  const date = dateForDay(slot.dayOfWeek as DayOfWeek)
  return new Date(`${date}T${slot.startTime}`) < new Date()
}

function slotCardClass(slot: WeeklySlotView): Record<string, boolean> {
  return {
    'slot-card--booked': isSlotBooked(slot) && !isSlotAttended(slot),
    'slot-card--attended': isSlotAttended(slot),
    'slot-card--full': slot.isFull && !isSlotBooked(slot) && !isSlotAttended(slot),
    'slot-card--holiday': isSlotHoliday(slot),
    'slot-card--past': isSlotPast(slot) && !isSlotBooked(slot) && !isSlotAttended(slot),
    'slot-card--available':
      !slot.isFull &&
      !isSlotBooked(slot) &&
      !isSlotAttended(slot) &&
      !isSlotHoliday(slot) &&
      !isSlotPast(slot),
  }
}

// ─── Week events (for collapsible summary) ──────────────────────────

interface WeekEvent {
  key: string
  activityName: string
  label: string
  badgeColor: string
  badgeLabel: string
}

const weekEvents = computed<WeekEvent[]>(() => {
  const now = new Date()
  const events: WeekEvent[] = []

  for (const att of myAttendance.value) {
    const checkedIn = new Date(att.checkedInAt)
    const dateStr = checkedIn.toISOString().slice(0, 10)
    const dayLabel = DAY_LABELS_FULL[att.dayOfWeek as DayOfWeek] ?? ''
    const d = new Date(dateStr + 'T00:00:00')
    const dateLabel = `${d.getDate()} ${MONTH_ABBREV[d.getMonth()]}`
    events.push({
      key: `att-${att.id}`,
      activityName: att.activityName,
      label: `${dayLabel} ${dateLabel} - ${formatTime(att.startTime)}`,
      badgeColor: att.status === 'confirmado' ? 'positive' : 'info',
      badgeLabel: att.status === 'confirmado' ? 'Asististe' : 'Check-in',
    })
  }

  for (const b of myBookings.value) {
    if (b.status === 'cancelado') continue
    const hasAtt = myAttendance.value.some((att) => {
      const attDate = new Date(att.checkedInAt).toISOString().slice(0, 10)
      return att.scheduleId === b.scheduleId && attDate === b.bookingDate
    })
    if (hasAtt) continue

    const isPast = new Date(`${b.bookingDate}T${b.startTime}`) <= now
    if (isPast && b.status !== 'confirmado' && b.status !== 'no_show') continue

    const dayLabel = DAY_LABELS_FULL[b.dayOfWeek as DayOfWeek] ?? ''
    const d = new Date(b.bookingDate + 'T00:00:00')
    const dateStr = `${d.getDate()} ${MONTH_ABBREV[d.getMonth()]}`

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
      badgeLabel =
        b.status === 'lista_espera' && b.waitlistPosition !== null
          ? `${BOOKING_STATUS_LABELS.lista_espera} (#${b.waitlistPosition})`
          : (BOOKING_STATUS_LABELS[b.status] ?? b.status)
    }

    events.push({
      key: `bk-${b.id}`,
      activityName: b.activityName,
      label: `${dayLabel} ${dateStr} - ${formatTime(b.startTime)}`,
      badgeColor,
      badgeLabel,
    })
  }

  return events
})

// ─── Booking flow ───────────────────────────────────────────────────

function formatBookingDay(booking: BookingRecord): string {
  const dayLabel = DAY_LABELS_FULL[booking.dayOfWeek as DayOfWeek] ?? ''
  const d = new Date(booking.bookingDate + 'T00:00:00')
  return `${dayLabel} ${d.getDate()} ${MONTH_ABBREV[d.getMonth()]}`
}

function onSlotTap(slot: WeeklySlotView) {
  if (isSlotHoliday(slot)) return
  if (isSlotBooked(slot)) return
  if (isSlotAttended(slot)) return
  if (isSlotPast(slot)) return

  const date = dateForDay(slot.dayOfWeek as DayOfWeek)
  const dayLabel = DAY_LABELS_FULL[slot.dayOfWeek as DayOfWeek]
  const d = new Date(date + 'T00:00:00')
  const dateStr = `${d.getDate()} ${MONTH_ABBREV[d.getMonth()]}`
  const timeStr = formatTime(slot.startTime)

  const existingBooking = myBookings.value.find(
    (b) =>
      b.bookingDate === date &&
      ['reservado', 'qr_escaneado', 'confirmado', 'lista_espera'].includes(b.status),
  )

  if (existingBooking) {
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
    if (reserveDialog.value.cancelFirst) {
      await cancelBooking(reserveDialog.value.cancelFirst)
    }
    const booking = await reserve(reserveDialog.value.scheduleId, reserveDialog.value.date)
    reserveDialog.value.show = false

    if (booking.status === 'lista_espera') {
      $q.notify({
        type: 'warning',
        message: `Te anotaste en la lista de espera (posicion #${booking.waitlistPosition})`,
      })
    } else {
      $q.notify({
        type: 'positive',
        message: reserveDialog.value.cancelFirst ? 'Horario cambiado' : 'Reserva confirmada',
      })
    }
    await loadGrid()
  } catch (err: unknown) {
    const message = extractError(err, 'Error al reservar')
    $q.notify({ type: 'negative', message })
    log.warn('Reserve failed', { error: message })
  } finally {
    reserveDialog.value.loading = false
  }
}

function promptCancelBooking(booking: BookingRecord) {
  const dayLabel = DAY_LABELS_FULL[booking.dayOfWeek as DayOfWeek] ?? ''
  cancelDialog.value = {
    show: true,
    message: `Cancelar reserva de ${dayLabel} ${formatTime(booking.startTime)}?`,
    loading: false,
    bookingId: booking.id,
  }
}

async function confirmCancel() {
  cancelDialog.value.loading = true
  try {
    await cancelBooking(cancelDialog.value.bookingId)
    cancelDialog.value.show = false
    $q.notify({ type: 'positive', message: 'Reserva cancelada' })
    await loadGrid()
  } catch (err: unknown) {
    const message = extractError(err, 'Error al cancelar')
    $q.notify({ type: 'negative', message })
  } finally {
    cancelDialog.value.loading = false
  }
}

// ─── Week navigation ────────────────────────────────────────────────

function changeWeek(delta: number) {
  const d = new Date(weekStart.value)
  d.setDate(d.getDate() + delta * 7)
  weekStart.value = d
  selectedDay.value = delta > 0 ? (1 as DayOfWeek) : getTodayDow()
  loadGrid()
}

function goToCurrentWeek() {
  weekStart.value = getMonday(new Date())
  selectedDay.value = getTodayDow()
  loadGrid()
}

// ─── Data loading ───────────────────────────────────────────────────

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

watch(selectedBranchId, () => loadGrid())

onMounted(async () => {
  if (!userStore.subscription && !userStore.subscriptionLoading) {
    await userStore.loadSubscription()
  }
  if (isMultiBranch.value) {
    try {
      branches.value = await getBranches()
      selectedBranchId.value = userStore.profile?.branchId ?? null
    } catch {
      // fall through
    }
  }
  loadGrid()
})

onBeforeUnmount(() => cleanup())
</script>

<style scoped lang="scss">
@use 'sass:color';
@import 'src/css/quasar.variables.scss';

.reservas {
  max-width: 600px;
  margin: 0 auto;
}

.reservas__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

.reservas__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  text-align: center;
}

.reservas__empty-title {
  font-family: 'Montserrat', sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: $primary;
  margin: 16px 0 8px;
}

.reservas__empty-text {
  font-size: 14px;
  color: $grey-7;
}

// ─── Branch ─────────────────────────────────────────────────────────

.branch-label {
  display: flex;
  align-items: center;
  font-family: 'Montserrat', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: rgba($primary, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 12px;
  padding-top: 8px;
}

.branch-select {
  max-width: 300px;
  margin-top: 4px;

  :deep(.q-field__control) {
    background: white;
    border-color: rgba($primary, 0.15);
    padding: 0 12px;

    &:hover {
      border-color: rgba($primary, 0.35);
    }
  }

  :deep(.q-field__control--focused) {
    border-color: $primary;
    box-shadow: 0 0 0 2px rgba($primary, 0.12);
  }

  :deep(.q-field__native) {
    font-family: 'Montserrat', sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: $primary;
    letter-spacing: 0.02em;
  }

  :deep(.q-field__append) {
    .q-icon {
      opacity: 0.5;
    }
  }
}

// ─── Next class hero ────────────────────────────────────────────────

.next-class-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: white;
  border: 1px solid rgba($primary, 0.15);
  border-radius: 12px;
  border-left: 4px solid $primary;
}

.next-class-card__icon {
  flex-shrink: 0;
}

.next-class-card__info {
  flex: 1;
  min-width: 0;
}

.next-class-card__label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba($primary, 0.5);
  margin: 0;
}

.next-class-card__activity {
  font-family: 'Montserrat', sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: $primary;
  margin: 2px 0;
}

.next-class-card__time {
  font-size: 13px;
  color: $grey-7;
  margin: 0;
}

.next-class-card__activity-empty {
  font-size: 14px;
  color: $grey-6;
  margin: 2px 0 0;
}

// ─── Day strip ──────────────────────────────────────────────────────

.day-strip__nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-bottom: 8px;
}

.day-strip__week-label {
  font-family: 'Montserrat', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: rgba($primary, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.day-strip__days {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
}

.day-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  min-width: 48px;
  padding: 8px 4px;
  border: 1px solid rgba($primary, 0.12);
  border-radius: 12px;
  background: white;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;

  &--selected {
    background: $primary;
    border-color: $primary;

    .day-pill__abbrev,
    .day-pill__date {
      color: white;
    }

    .day-pill__avail {
      background: rgba(white, 0.25);
      color: white;
    }
  }

  &--today:not(&--selected) {
    border-color: $primary;
  }

  &--past:not(&--selected) {
    opacity: 0.5;
  }

  &__abbrev {
    font-family: 'Montserrat', sans-serif;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    color: rgba($primary, 0.5);
    letter-spacing: 0.03em;
  }

  &__date {
    font-size: 18px;
    font-weight: 700;
    color: $primary;
    line-height: 1.2;
  }

  &__avail {
    font-size: 10px;
    font-weight: 600;
    color: $positive;
    background: rgba($positive, 0.1);
    border-radius: 8px;
    padding: 1px 6px;
    margin-top: 2px;
  }

  &__dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: $primary;
  }

  &--selected &__dot {
    background: white;
  }
}

// ─── Day slots ──────────────────────────────────────────────────────

.day-slots__holiday {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: rgba($accent, 0.08);
  border-radius: 10px;
  font-size: 14px;
  color: $accent;
  margin-bottom: 12px;
}

.day-slots__period {
  font-family: 'Montserrat', sans-serif;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba($accent, 0.4);
  margin: 16px 0 6px;

  &:first-child {
    margin-top: 0;
  }
}

.day-slots__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 0;
  color: $grey-6;
  font-size: 14px;
  gap: 8px;
}

.reservas__policy {
  font-size: 12px;
  color: $grey-6;
  margin: 16px 0 0;
  line-height: 1.5;
}

.slot-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  margin-bottom: 6px;
  border-radius: 10px;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.06);
  transition: all 0.15s ease;

  &--available {
    cursor: pointer;

    &:active {
      background: rgba($primary, 0.04);
    }
  }

  &--booked {
    border-color: rgba($primary, 0.3);
    background: rgba($primary, 0.04);
  }

  &--attended {
    border-color: rgba($positive, 0.3);
    background: rgba($positive, 0.04);
  }

  &--full {
    cursor: pointer;

    &:active {
      background: rgba($negative, 0.04);
    }
  }

  &--holiday {
    opacity: 0.5;
  }

  &--past {
    opacity: 0.4;
  }

  &__time {
    display: flex;
    flex-direction: column;
  }

  &__hour {
    font-family: 'Montserrat', sans-serif;
    font-size: 16px;
    font-weight: 700;
    color: $primary;
  }

  &__activity {
    font-size: 12px;
    color: $grey-7;
  }

  &__right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__occupancy {
    font-size: 12px;
    color: $grey-6;

    &--full {
      color: $negative;
      font-weight: 600;
    }
  }

  &__badge {
    font-size: 12px;
    font-weight: 600;

    &--primary {
      color: $primary;
    }

    &--positive {
      color: $positive;
    }

    &--full {
      color: $negative;
    }
  }

  &__action {
    font-family: 'Montserrat', sans-serif;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.03em;
  }
}

// ─── Week summary ───────────────────────────────────────────────────

.week-summary {
  border: 1px solid rgba($primary, 0.12);
  border-radius: 12px;
  overflow: hidden;
}

:deep(.week-summary__header) {
  font-family: 'Montserrat', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: $primary;
}

.week-summary__list {
  background: transparent;
  padding: 4px 8px;

  :deep(.q-item) {
    padding: 10px 8px;
  }

  :deep(.q-item__label) {
    color: rgba($primary, 0.8);
  }

  :deep(.q-item__label--caption) {
    color: $grey-7;
  }
}
</style>
