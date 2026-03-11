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
          @click="showHolidaysDialog = true"
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
    <!-- Extracted Dialog Components -->
    <!-- ================================================================== -->
    <SlotDetailDialog
      v-model:show="showSlotDialog"
      :schedule-id="selectedSlotScheduleId"
      :date="selectedSlotDate"
      @bookings-changed="loadWeeklyGrid"
    />
    <ActivitiesDialog v-model:show="showActivitiesDialog" />
    <HolidaysDialog v-model:show="showHolidaysDialog" @holidays-changed="loadWeeklyGrid" />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useSchedulingApi } from 'src/composables/useSchedulingApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import type { WeeklySlotView, HolidayRecord, DayOfWeek } from 'src/types/scheduling';
import { DAY_SHORT_LABELS } from 'src/types/scheduling';
import type { BranchOption } from 'src/types/member';
import SlotDetailDialog from 'src/components/scheduling/SlotDetailDialog.vue';
import ActivitiesDialog from 'src/components/scheduling/ActivitiesDialog.vue';
import HolidaysDialog from 'src/components/scheduling/HolidaysDialog.vue';

const log = createLogger('HorariosPage');
const $q = useQuasar();
const membersApi = useMembersApi();
const schedulingApi = useSchedulingApi();

// ─── State ──────────────────────────────────────────────────────────────────

const selectedBranchId = ref<number | null>(null);
const branchOptions = ref<Array<{ label: string; value: number }>>([]);
const loadingBranches = ref(false);
const weekStartDate = ref(getMonday(new Date()));
const gridSlots = ref<WeeklySlotView[]>([]);
const gridHolidays = ref<HolidayRecord[]>([]);
const loadingGrid = ref(false);
const showSlotDialog = ref(false);
const selectedSlotScheduleId = ref<number | null>(null);
const selectedSlotDate = ref('');
const showActivitiesDialog = ref(false);
const showHolidaysDialog = ref(false);

// ─── Computed ───────────────────────────────────────────────────────────────

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

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── Data Loading ───────────────────────────────────────────────────────────

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

// ─── Week Navigation ────────────────────────────────────────────────────────

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

function onBranchChange() {
  gridSlots.value = [];
  gridHolidays.value = [];
  loadWeeklyGrid();
}

// ─── Cell Click -> Open Slot Detail Dialog ──────────────────────────────────

function onCellClick(time: string, dayOfWeek: DayOfWeek, date: string) {
  const slot = getCellSlot(time, dayOfWeek);
  if (!slot) return;
  if (isCellHoliday(date)) return;

  selectedSlotScheduleId.value = slot.id;
  selectedSlotDate.value = date;
  showSlotDialog.value = true;
}

// ─── Watchers & Lifecycle ────────────────────────────────────────────────────

watch(weekStartDate, () => {
  if (selectedBranchId.value) {
    loadWeeklyGrid();
  }
});

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
