<template>
  <q-page class="q-pa-md">
    <!-- ================================================================== -->
    <!-- Header -->
    <!-- ================================================================== -->
    <div class="row items-center q-mb-md">
      <div class="col">
        <div class="text-h5">Horarios</div>
        <div class="text-caption text-grey-7">Gestion de horarios y reservas</div>
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- Controls Row: Branch + Week Navigation + Action Buttons -->
    <!-- ================================================================== -->
    <div class="row items-center q-gutter-sm q-mb-md">
      <div class="col-12 col-sm-3">
        <q-select
          v-model="selectedBranchId"
          :options="branchOptions"
          label="Sucursal"
          dense
          outlined
          emit-value
          map-options
          :loading="loadingBranches"
          @update:model-value="onBranchChange"
        />
      </div>

      <div class="col-auto row items-center no-wrap q-gutter-xs">
        <q-btn flat dense round icon="chevron_left" @click="prevWeek" />
        <q-btn flat dense label="Esta semana" @click="goToCurrentWeek" />
        <q-btn flat dense round icon="chevron_right" @click="nextWeek" />
        <span class="text-body2 text-grey-8 q-ml-sm">{{ weekRangeLabel }}</span>
      </div>

      <q-space />

      <div class="col-auto row q-gutter-xs">
        <q-btn
          outline
          icon="category"
          label="Actividades"
          color="secondary"
          @click="showActivitiesDialog = true"
        />
        <q-btn
          outline
          icon="event_busy"
          label="Feriados"
          color="orange"
          @click="openHolidaysDialog"
        />
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- Weekly Calendar Grid -->
    <!-- ================================================================== -->
    <div v-if="loadingGrid" class="flex flex-center q-pa-xl">
      <q-spinner-dots size="40px" color="primary" />
    </div>

    <div v-else-if="!selectedBranchId" class="text-center q-pa-xl text-grey-5 text-italic">
      Selecciona una sucursal para ver los horarios
    </div>

    <div v-else-if="timeSlots.length === 0" class="text-center q-pa-xl text-grey-5 text-italic">
      No hay horarios configurados para esta sede.
    </div>

    <div v-else class="schedule-grid-container">
      <div class="schedule-grid" :style="gridTemplateStyle">
        <!-- Header: empty top-left corner -->
        <div class="grid-header grid-corner" />

        <!-- Header: day columns -->
        <div
          v-for="day in weekDays"
          :key="day.dayOfWeek"
          class="grid-header grid-day-header text-center"
        >
          <div class="text-weight-bold">{{ day.shortLabel }}</div>
          <div class="text-caption">{{ day.dateLabel }}</div>
        </div>

        <!-- Rows: time slots -->
        <template v-for="time in timeSlots" :key="time">
          <!-- Time label -->
          <div class="grid-time-label text-caption text-grey-7">{{ time }}</div>

          <!-- Cells for each day -->
          <div
            v-for="day in weekDays"
            :key="`${time}-${day.dayOfWeek}`"
            class="grid-cell"
            :class="cellClass(time, day.dayOfWeek)"
            @click="onCellClick(time, day.dayOfWeek, day.date)"
          >
            <template v-if="getCellSlot(time, day.dayOfWeek)">
              <div class="cell-activity text-caption ellipsis">
                {{ getCellSlot(time, day.dayOfWeek)!.activityName }}
              </div>
              <div v-if="isCellHoliday(day.date)" class="cell-holiday text-weight-bold">
                FERIADO
              </div>
              <div v-else class="cell-occupancy text-weight-bold">
                {{ getCellSlot(time, day.dayOfWeek)!.bookedCount }}/{{
                  getCellSlot(time, day.dayOfWeek)!.maxCapacity
                }}
              </div>
            </template>
          </div>
        </template>
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- Slot Detail Dialog -->
    <!-- ================================================================== -->
    <q-dialog v-model="showSlotDialog" persistent>
      <q-card style="min-width: 500px; max-width: 600px">
        <q-card-section>
          <div class="text-h6">
            {{ slotDetail?.schedule.activityName }} - {{ slotDetailDayLabel }}
            {{ slotDetailDate }} - {{ slotDetail?.schedule.startTime }}
          </div>
          <div class="text-subtitle2 text-grey-7">
            {{ slotDetailBookingCount }}/{{ slotDetail?.maxCapacity ?? 0 }} reservas
          </div>
        </q-card-section>

        <q-separator />

        <q-card-section class="q-pa-none" style="max-height: 400px; overflow-y: auto">
          <q-list separator>
            <q-item v-if="loadingSlotDetail" class="flex flex-center q-pa-lg">
              <q-spinner-dots size="30px" color="primary" />
            </q-item>

            <q-item v-else-if="!slotDetail || activeBookings.length === 0">
              <q-item-section class="text-grey-5 text-italic text-center">
                Sin reservas para este horario
              </q-item-section>
            </q-item>

            <q-item v-for="booking in activeBookings" :key="booking.id">
              <q-item-section>
                <q-item-label>{{ booking.memberName }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <div class="row items-center q-gutter-xs">
                  <q-badge
                    :color="getBookingStatusColor(booking.status)"
                    :label="getBookingStatusLabel(booking.status)"
                  />
                  <q-btn
                    v-if="!isSlotPast"
                    flat
                    dense
                    round
                    icon="delete"
                    color="negative"
                    size="sm"
                    @click="onRemoveBooking(booking.id)"
                  >
                    <q-tooltip>Eliminar reserva</q-tooltip>
                  </q-btn>
                </div>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>

        <q-separator />

        <q-card-section>
          <div class="text-subtitle2 q-mb-sm">Agregar alumno</div>
          <q-select
            v-model="slotAddMember"
            :options="memberSearchResults"
            option-value="id"
            option-label="displayLabel"
            label="Buscar alumno (nombre o DNI)"
            dense
            outlined
            use-input
            clearable
            input-debounce="300"
            :loading="searchingMembers"
            @filter="onMemberSearch"
          >
            <template #no-option>
              <q-item>
                <q-item-section class="text-grey-5 text-italic">
                  {{ memberSearchQuery ? 'Sin resultados' : 'Escribe para buscar' }}
                </q-item-section>
              </q-item>
            </template>
            <template #after>
              <q-btn
                round
                dense
                flat
                icon="add"
                color="primary"
                :disable="!slotAddMember"
                @click="onAddBooking"
              />
            </template>
          </q-select>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cerrar" color="grey-7" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ================================================================== -->
    <!-- Activities Management Dialog -->
    <!-- ================================================================== -->
    <q-dialog v-model="showActivitiesDialog">
      <q-card style="min-width: 500px; max-width: 600px">
        <q-card-section>
          <div class="text-h6">Gestionar Actividades</div>
        </q-card-section>

        <q-separator />

        <q-card-section class="q-pa-none" style="max-height: 400px; overflow-y: auto">
          <q-list separator>
            <q-item v-if="loadingActivities" class="flex flex-center q-pa-lg">
              <q-spinner-dots size="30px" color="primary" />
            </q-item>

            <q-item v-for="act in activities" :key="act.id">
              <q-item-section>
                <q-item-label>{{ act.name }}</q-item-label>
                <q-item-label caption>{{ act.description || 'Sin descripcion' }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <div class="row items-center q-gutter-xs">
                  <q-toggle
                    :model-value="act.isActive"
                    @update:model-value="
                      (val: boolean) => onToggleActivity(act.id, act.name, act.description, val)
                    "
                    color="positive"
                    size="sm"
                  />
                  <q-btn flat dense round icon="edit" size="sm" @click="startEditActivity(act)" />
                </div>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>

        <q-separator />

        <q-card-section>
          <div class="text-subtitle2 q-mb-sm">
            {{ editingActivity ? 'Editar actividad' : 'Nueva actividad' }}
          </div>
          <div class="row q-gutter-sm">
            <q-input v-model="activityForm.name" label="Nombre" dense outlined class="col" />
            <q-input
              v-model="activityForm.description"
              label="Descripcion"
              dense
              outlined
              class="col"
            />
            <q-btn
              :icon="editingActivity ? 'save' : 'add'"
              color="primary"
              dense
              :disable="!activityForm.name.trim()"
              @click="onSaveActivity"
            />
            <q-btn v-if="editingActivity" icon="close" flat dense @click="cancelEditActivity" />
          </div>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cerrar" color="grey-7" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ================================================================== -->
    <!-- Holidays Management Dialog -->
    <!-- ================================================================== -->
    <q-dialog v-model="showHolidaysDialog">
      <q-card style="min-width: 500px; max-width: 600px">
        <q-card-section>
          <div class="text-h6">Gestionar Feriados</div>
        </q-card-section>

        <q-separator />

        <q-card-section>
          <q-select
            v-model="holidayCountry"
            :options="countryOptions"
            label="Pais"
            dense
            outlined
            emit-value
            map-options
            @update:model-value="loadHolidays"
          />
        </q-card-section>

        <q-banner class="bg-amber-1 text-amber-9 q-mx-md q-mb-sm" dense rounded>
          <template #avatar>
            <q-icon name="warning" color="amber-9" />
          </template>
          Al agregar un feriado, las reservas existentes para ese dia se cancelan automaticamente
        </q-banner>

        <q-card-section class="q-pa-none" style="max-height: 300px; overflow-y: auto">
          <q-list separator>
            <q-item v-if="loadingHolidays" class="flex flex-center q-pa-lg">
              <q-spinner-dots size="30px" color="primary" />
            </q-item>

            <q-item v-else-if="holidays.length === 0">
              <q-item-section class="text-grey-5 text-italic text-center">
                Sin feriados registrados
              </q-item-section>
            </q-item>

            <q-item v-for="h in holidays" :key="h.id">
              <q-item-section>
                <q-item-label>{{ h.name }}</q-item-label>
                <q-item-label caption>{{ formatHolidayDate(h.date) }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-btn
                  flat
                  dense
                  round
                  icon="delete"
                  color="negative"
                  size="sm"
                  @click="onRemoveHoliday(h)"
                />
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>

        <q-separator />

        <q-card-section>
          <div class="text-subtitle2 q-mb-sm">Nuevo feriado</div>
          <div class="row q-gutter-sm">
            <q-input
              v-model="holidayForm.date"
              label="Fecha"
              dense
              outlined
              type="date"
              class="col"
            />
            <q-input v-model="holidayForm.name" label="Nombre" dense outlined class="col" />
            <q-btn
              icon="add"
              color="primary"
              dense
              :disable="!holidayForm.date || !holidayForm.name.trim()"
              @click="onAddHoliday"
            />
          </div>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cerrar" color="grey-7" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useSchedulingApi } from 'src/composables/useSchedulingApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import type {
  WeeklySlotView,
  SlotDetailView,
  ActivityRecord,
  HolidayRecord,
  BookingStatus,
  DayOfWeek,
} from 'src/types/scheduling';
import {
  DAY_LABELS,
  DAY_SHORT_LABELS,
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_COLORS,
} from 'src/types/scheduling';
import type { BranchOption } from 'src/types/member';

const log = createLogger('HorariosPage');
const $q = useQuasar();
const membersApi = useMembersApi();
const schedulingApi = useSchedulingApi();

// =========================================================================
// State
// =========================================================================

// Branch
const selectedBranchId = ref<number | null>(null);
const branchOptions = ref<Array<{ label: string; value: number }>>([]);
const loadingBranches = ref(false);

// Week navigation
const weekStartDate = ref(getMonday(new Date()));

// Grid data
const gridSlots = ref<WeeklySlotView[]>([]);
const gridHolidays = ref<HolidayRecord[]>([]);
const loadingGrid = ref(false);

// Slot detail dialog
const showSlotDialog = ref(false);
const slotDetail = ref<SlotDetailView | null>(null);
const loadingSlotDetail = ref(false);
const selectedSlotScheduleId = ref<number | null>(null);
const selectedSlotDate = ref('');

// Member search for slot dialog
const slotAddMember = ref<{ id: number; displayLabel: string } | null>(null);
const memberSearchResults = ref<Array<{ id: number; displayLabel: string }>>([]);
const searchingMembers = ref(false);
const memberSearchQuery = ref('');

// Activities dialog
const showActivitiesDialog = ref(false);
const activities = ref<ActivityRecord[]>([]);
const loadingActivities = ref(false);
const activityForm = ref({ name: '', description: '' });
const editingActivity = ref<ActivityRecord | null>(null);

// Holidays dialog
const showHolidaysDialog = ref(false);
const holidays = ref<HolidayRecord[]>([]);
const loadingHolidays = ref(false);
const holidayCountry = ref('AR');
const holidayForm = ref({ date: '', name: '' });

const countryOptions = [
  { label: 'Argentina', value: 'AR' },
  { label: 'Chile', value: 'CL' },
  { label: 'Uruguay', value: 'UY' },
  { label: 'Paraguay', value: 'PY' },
  { label: 'Colombia', value: 'CO' },
  { label: 'Mexico', value: 'MX' },
];

// =========================================================================
// Computed
// =========================================================================

/** Days of the week for the current weekStart */
const weekDays = computed(() => {
  const days: Array<{ dayOfWeek: DayOfWeek; shortLabel: string; dateLabel: string; date: string }> =
    [];
  const start = new Date(weekStartDate.value + 'T12:00:00');
  for (let i = 0; i < 6; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dow = (i + 1) as DayOfWeek;
    days.push({
      dayOfWeek: dow,
      shortLabel: DAY_SHORT_LABELS[dow],
      dateLabel: `${d.getDate()}`,
      date: formatDateISO(d),
    });
  }
  return days;
});

/** Unique sorted time slots across all schedule entries */
const timeSlots = computed(() => {
  const times = new Set<string>();
  for (const slot of gridSlots.value) {
    times.add(slot.startTime);
  }
  return Array.from(times).sort();
});

/** Week range label e.g. "10 Mar - 15 Mar 2026" */
const weekRangeLabel = computed(() => {
  const start = new Date(weekStartDate.value + 'T12:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 5);
  const fmt = (d: Date) => d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  return `${fmt(start)} - ${fmt(end)} ${end.getFullYear()}`;
});

/** CSS grid template: 1 time column + 6 day columns */
const gridTemplateStyle = computed(() => ({
  'grid-template-columns': '60px repeat(6, 1fr)',
  'grid-template-rows': `auto repeat(${timeSlots.value.length}, 1fr)`,
}));

/** Active bookings (not cancelled) for slot detail */
const activeBookings = computed(() => {
  if (!slotDetail.value) return [];
  return slotDetail.value.bookings.filter(
    (b) =>
      b.status === 'reservado' ||
      b.status === 'qr_escaneado' ||
      b.status === 'confirmado' ||
      b.status === 'lista_espera'
  );
});

const slotDetailBookingCount = computed(() => activeBookings.value.length);

const isSlotPast = computed(() => {
  if (!slotDetail.value) return false;
  const dt = new Date(`${slotDetail.value.date}T${slotDetail.value.schedule.startTime}:00`);
  return dt < new Date();
});

const slotDetailDayLabel = computed(() => {
  if (!slotDetail.value) return '';
  const dow = slotDetail.value.schedule.dayOfWeek as DayOfWeek;
  return DAY_LABELS[dow] ?? '';
});

const slotDetailDate = computed(() => {
  if (!slotDetail.value) return '';
  const d = new Date(slotDetail.value.date + 'T12:00:00');
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
});

// =========================================================================
// Helpers
// =========================================================================

function getMonday(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  // getDay() returns 0 for Sunday, 1 for Monday
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return formatDateISO(date);
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatHolidayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Build a lookup key from startTime + dayOfWeek */
function slotKey(startTime: string, dayOfWeek: number): string {
  return `${startTime}-${dayOfWeek}`;
}

/** Build lookup map for quick cell rendering */
const slotMap = computed(() => {
  const map = new Map<string, WeeklySlotView>();
  for (const s of gridSlots.value) {
    map.set(slotKey(s.startTime, s.dayOfWeek), s);
  }
  return map;
});

/** Holiday dates set for quick lookup */
const holidayDates = computed(() => {
  const set = new Set<string>();
  for (const h of gridHolidays.value) {
    set.add(h.date);
  }
  return set;
});

function getCellSlot(time: string, dayOfWeek: DayOfWeek): WeeklySlotView | undefined {
  return slotMap.value.get(slotKey(time, dayOfWeek));
}

function isCellHoliday(date: string): boolean {
  return holidayDates.value.has(date);
}

function cellClass(time: string, dayOfWeek: DayOfWeek): string {
  const slot = getCellSlot(time, dayOfWeek);
  if (!slot) return 'grid-cell--empty';

  // Find the date for this dayOfWeek
  const day = weekDays.value.find((d) => d.dayOfWeek === dayOfWeek);
  if (day && isCellHoliday(day.date)) return 'grid-cell--holiday';

  const pct = slot.maxCapacity > 0 ? (slot.bookedCount / slot.maxCapacity) * 100 : 0;
  if (pct >= 100) return 'grid-cell--full';
  if (pct >= 70) return 'grid-cell--warning';
  return 'grid-cell--available';
}

function getBookingStatusLabel(status: BookingStatus): string {
  return BOOKING_STATUS_LABELS[status];
}

function getBookingStatusColor(status: BookingStatus): string {
  return BOOKING_STATUS_COLORS[status];
}

// =========================================================================
// Data Loading
// =========================================================================

async function loadBranches() {
  loadingBranches.value = true;
  try {
    const branches: BranchOption[] = await membersApi.getBranches();
    branchOptions.value = branches.map((b) => ({ label: b.name, value: b.id }));
    if (branchOptions.value.length > 0) {
      selectedBranchId.value = branchOptions.value[0].value;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading branches', { error: message });
  } finally {
    loadingBranches.value = false;
  }
}

async function loadWeeklyGrid() {
  if (!selectedBranchId.value) return;
  loadingGrid.value = true;
  try {
    const result = await schedulingApi.getWeeklyGrid(selectedBranchId.value, weekStartDate.value);
    gridSlots.value = result.slots;
    gridHolidays.value = result.holidays;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading weekly grid', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando horarios' });
  } finally {
    loadingGrid.value = false;
  }
}

async function loadSlotDetail(scheduleId: number, date: string) {
  loadingSlotDetail.value = true;
  slotDetail.value = null;
  try {
    slotDetail.value = await schedulingApi.getSlotDetail(scheduleId, date);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading slot detail', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando detalle del horario' });
  } finally {
    loadingSlotDetail.value = false;
  }
}

async function loadActivities() {
  loadingActivities.value = true;
  try {
    activities.value = await schedulingApi.listActivities();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading activities', { error: message });
  } finally {
    loadingActivities.value = false;
  }
}

async function loadHolidays() {
  loadingHolidays.value = true;
  try {
    const year = new Date().getFullYear();
    holidays.value = await schedulingApi.listHolidays({
      country: holidayCountry.value,
      year,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading holidays', { error: message });
  } finally {
    loadingHolidays.value = false;
  }
}

// =========================================================================
// Week Navigation
// =========================================================================

function prevWeek() {
  const d = new Date(weekStartDate.value + 'T12:00:00');
  d.setDate(d.getDate() - 7);
  weekStartDate.value = formatDateISO(d);
}

function nextWeek() {
  const d = new Date(weekStartDate.value + 'T12:00:00');
  d.setDate(d.getDate() + 7);
  weekStartDate.value = formatDateISO(d);
}

function goToCurrentWeek() {
  weekStartDate.value = getMonday(new Date());
}

// =========================================================================
// Branch Change
// =========================================================================

function onBranchChange() {
  gridSlots.value = [];
  gridHolidays.value = [];
  loadWeeklyGrid();
}

// =========================================================================
// Cell Click -> Slot Detail
// =========================================================================

function onCellClick(time: string, dayOfWeek: DayOfWeek, date: string) {
  const slot = getCellSlot(time, dayOfWeek);
  if (!slot) return;
  if (isCellHoliday(date)) return;

  selectedSlotScheduleId.value = slot.id;
  selectedSlotDate.value = date;
  showSlotDialog.value = true;
  slotAddMember.value = null;
  memberSearchResults.value = [];
  loadSlotDetail(slot.id, date);
}

// =========================================================================
// Booking Management
// =========================================================================

function onMemberSearch(val: string, update: (fn: () => void) => void, _abort: () => void) {
  memberSearchQuery.value = val;
  if (!val || val.length < 2) {
    update(() => {
      memberSearchResults.value = [];
    });
    return;
  }

  searchingMembers.value = true;
  membersApi
    .getMembers({ search: val, limit: 10 })
    .then((result) => {
      update(() => {
        memberSearchResults.value = result.members.map((m) => ({
          id: m.id,
          displayLabel: `${m.firstName} ${m.lastName}${m.dni ? ` (${m.dni})` : ''}`,
        }));
      });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error searching members', { error: message });
      update(() => {
        memberSearchResults.value = [];
      });
    })
    .finally(() => {
      searchingMembers.value = false;
    });
}

async function onAddBooking() {
  if (!slotAddMember.value || !selectedSlotScheduleId.value) return;
  try {
    await schedulingApi.adminAddBooking({
      scheduleId: selectedSlotScheduleId.value,
      memberId: slotAddMember.value.id,
      date: selectedSlotDate.value,
    });
    $q.notify({ type: 'positive', message: 'Reserva agregada' });
    slotAddMember.value = null;
    memberSearchResults.value = [];
    await loadSlotDetail(selectedSlotScheduleId.value, selectedSlotDate.value);
    await loadWeeklyGrid();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error adding booking', { error: message });
    $q.notify({ type: 'negative', message: 'Error agregando reserva' });
  }
}

async function onRemoveBooking(bookingId: number) {
  $q.dialog({
    title: 'Eliminar reserva',
    message: 'Esta seguro que desea eliminar esta reserva?',
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Eliminar', color: 'negative' },
  }).onOk(async () => {
    try {
      await schedulingApi.adminRemoveBooking(bookingId);
      $q.notify({ type: 'positive', message: 'Reserva eliminada' });
      if (selectedSlotScheduleId.value) {
        await loadSlotDetail(selectedSlotScheduleId.value, selectedSlotDate.value);
      }
      await loadWeeklyGrid();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error removing booking', { error: message });
      $q.notify({ type: 'negative', message: 'Error eliminando reserva' });
    }
  });
}

// =========================================================================
// Activities Management
// =========================================================================

function startEditActivity(act: ActivityRecord) {
  editingActivity.value = act;
  activityForm.value = { name: act.name, description: act.description ?? '' };
}

function cancelEditActivity() {
  editingActivity.value = null;
  activityForm.value = { name: '', description: '' };
}

async function onSaveActivity() {
  if (!activityForm.value.name.trim()) return;
  try {
    if (editingActivity.value) {
      await schedulingApi.updateActivity(editingActivity.value.id, {
        name: activityForm.value.name,
        description: activityForm.value.description || undefined,
      });
      $q.notify({ type: 'positive', message: 'Actividad actualizada' });
    } else {
      await schedulingApi.createActivity({
        name: activityForm.value.name,
        description: activityForm.value.description || undefined,
      });
      $q.notify({ type: 'positive', message: 'Actividad creada' });
    }
    activityForm.value = { name: '', description: '' };
    editingActivity.value = null;
    await loadActivities();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error saving activity', { error: message });
    $q.notify({ type: 'negative', message: 'Error guardando actividad' });
  }
}

async function onToggleActivity(
  id: number,
  name: string,
  description: string | null,
  isActive: boolean
) {
  try {
    await schedulingApi.updateActivity(id, {
      name,
      description: description ?? undefined,
      isActive,
    });
    await loadActivities();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error toggling activity', { error: message });
    $q.notify({ type: 'negative', message: 'Error actualizando actividad' });
  }
}

// =========================================================================
// Holidays Management
// =========================================================================

function openHolidaysDialog() {
  showHolidaysDialog.value = true;
  loadHolidays();
}

async function onAddHoliday() {
  if (!holidayForm.value.date || !holidayForm.value.name.trim()) return;
  try {
    await schedulingApi.addHoliday({
      country: holidayCountry.value,
      date: holidayForm.value.date,
      name: holidayForm.value.name,
    });
    $q.notify({ type: 'positive', message: 'Feriado agregado' });
    holidayForm.value = { date: '', name: '' };
    await loadHolidays();
    await loadWeeklyGrid();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error adding holiday', { error: message });
    $q.notify({ type: 'negative', message: 'Error agregando feriado' });
  }
}

async function onRemoveHoliday(h: HolidayRecord) {
  $q.dialog({
    title: 'Eliminar feriado',
    message: `Eliminar "${h.name}" del ${formatHolidayDate(h.date)}?`,
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Eliminar', color: 'negative' },
  }).onOk(async () => {
    try {
      await schedulingApi.removeHoliday(h.id);
      $q.notify({ type: 'positive', message: 'Feriado eliminado' });
      await loadHolidays();
      await loadWeeklyGrid();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error removing holiday', { error: message });
      $q.notify({ type: 'negative', message: 'Error eliminando feriado' });
    }
  });
}

// =========================================================================
// =========================================================================
// Watchers
// =========================================================================

watch(weekStartDate, () => {
  if (selectedBranchId.value) {
    loadWeeklyGrid();
  }
});

watch(showActivitiesDialog, (val) => {
  if (val) {
    loadActivities();
    cancelEditActivity();
  }
});

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadBranches();
});

// Load grid after branches load if auto-selected
watch(selectedBranchId, (val) => {
  if (val) loadWeeklyGrid();
});
</script>

<style scoped>
.schedule-grid-container {
  overflow-x: auto;
}

.schedule-grid {
  display: grid;
  gap: 2px;
  min-width: 600px;
}

.grid-header {
  padding: 8px 4px;
  background: var(--q-primary);
  color: white;
  font-size: 0.85rem;
}

.grid-corner {
  background: var(--q-primary);
  border-radius: 4px 0 0 0;
}

.grid-day-header {
  border-radius: 0;
}

.grid-day-header:last-child {
  border-radius: 0 4px 0 0;
}

.grid-time-label {
  padding: 8px 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  font-weight: 500;
}

.grid-cell {
  padding: 6px;
  min-height: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px solid #e0e0e0;
  cursor: pointer;
  transition: background 0.15s;
  border-radius: 2px;
}

.grid-cell:hover {
  filter: brightness(0.95);
}

.grid-cell--empty {
  background: #fafafa;
  cursor: default;
}

.grid-cell--empty:hover {
  filter: none;
}

.grid-cell--available {
  background: #e8f5e9;
}

.grid-cell--warning {
  background: #fff8e1;
}

.grid-cell--full {
  background: #ffebee;
}

.grid-cell--holiday {
  background: #eeeeee;
  cursor: default;
  color: #9e9e9e;
}

.grid-cell--holiday:hover {
  filter: none;
}

.cell-activity {
  font-size: 0.7rem;
  color: #666;
  max-width: 100%;
  text-align: center;
}

.cell-occupancy {
  font-size: 1.1rem;
  margin-top: 2px;
}

.cell-holiday {
  font-size: 0.75rem;
  letter-spacing: 0.05em;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
