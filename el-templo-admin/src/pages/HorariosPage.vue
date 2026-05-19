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

      <div class="col-auto row items-center q-gutter-sm">
        <q-btn icon="chevron_left" flat round @click="prevWeek" />
        <div class="text-subtitle1">{{ weekRangeLabel }}</div>
        <q-btn icon="chevron_right" flat round @click="nextWeek" />
        <q-btn icon="event" flat round dense>
          <q-popup-proxy
            v-model="showWeekDatePicker"
            cover
            transition-show="scale"
            transition-hide="scale"
          >
            <q-date
              :model-value="weekStartDate.replaceAll('-', '/')"
              @update:model-value="onWeekDatePicked"
              minimal
              first-day-of-week="1"
            />
          </q-popup-proxy>
        </q-btn>
      </div>

      <q-space />

      <div class="col-auto row q-gutter-xs">
        <q-btn
          outline
          icon="how_to_reg"
          label="Sesiones de Prueba"
          color="warning"
          @click="showTrialsDialog = true"
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
    <!-- Tabs: Horarios / Actividades (Phase 113) -->
    <!-- ================================================================== -->
    <q-tabs
      v-model="activeTab"
      dense
      align="left"
      class="text-primary q-mb-md"
      indicator-color="primary"
    >
      <q-tab name="horarios" label="Horarios" icon="schedule" />
      <q-tab name="actividades" label="Actividades" icon="sports_gymnastics" />
    </q-tabs>

    <q-tab-panels v-model="activeTab" animated keep-alive class="bg-transparent">
      <q-tab-panel name="horarios" class="q-pa-none">
        <!-- ================================================================== -->
        <!-- Slot Action Buttons (Crear / Eliminar) -->
        <!-- ================================================================== -->
        <div class="row items-center q-mb-md q-gutter-sm">
          <q-btn
            icon="add"
            label="Crear horario"
            color="primary"
            :disable="!selectedBranchId || deleteSelectionMode"
            @click="showCreateSlotDialog = true"
          />
          <q-btn
            :outline="!deleteSelectionMode"
            :color="deleteSelectionMode ? 'negative' : 'negative'"
            icon="delete"
            :label="deleteSelectionMode ? 'Cancelar selección' : 'Eliminar horario'"
            :disable="!selectedBranchId"
            @click="toggleDeleteSelectionMode"
          />
          <div v-if="deleteSelectionMode" class="text-caption text-negative q-ml-sm">
            Tocá un horario de la grilla para elegirlo
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

        <!-- Mobile layout: day picker + vertical slot list -->
        <div v-else-if="isMobile">
          <!-- Day picker -->
          <div class="day-picker row no-wrap q-mb-md q-gutter-xs">
            <q-btn
              v-for="day in weekDays"
              :key="day.dayOfWeek"
              dense
              flat
              no-caps
              class="day-picker-btn col"
              :class="{
                'day-picker-btn--active': day.dayOfWeek === selectedDay,
                'day-picker-btn--today': day.date === todayISO,
              }"
              @click="selectedDay = day.dayOfWeek"
            >
              <div class="column items-center">
                <div class="text-caption">{{ day.shortLabel }}</div>
                <div class="text-weight-bold text-body1">{{ day.dateLabel }}</div>
              </div>
            </q-btn>
          </div>

          <!-- Vertical slot list for selected day -->
          <div v-if="selectedDayHoliday" class="text-center q-pa-lg text-grey-5 text-italic">
            FERIADO
          </div>
          <div
            v-else-if="selectedDaySlots.length === 0"
            class="text-center q-pa-lg text-grey-5 text-italic"
          >
            Sin horarios en este día
          </div>
          <q-list v-else bordered separator class="rounded-borders">
            <q-item
              v-for="slot in selectedDaySlots"
              :key="slot.id"
              clickable
              v-ripple
              :class="rowClass(slot)"
              @click="onMobileSlotClick(slot)"
            >
              <q-item-section side>
                <div class="text-weight-bold text-h6">{{ slot.startTime }}</div>
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-medium">{{ slot.activityName }}</q-item-label>
                <q-item-label
                  v-if="!slot.isActive"
                  caption
                  class="text-negative text-weight-medium"
                >
                  Cancelada
                </q-item-label>
                <q-item-label v-else caption>
                  {{ slot.bookedCount }}/{{ slot.maxCapacity }} reservados
                  <span v-if="slot.trialCount > 0" class="text-warning text-weight-medium q-ml-xs">
                    · {{ slot.trialCount }} SP
                  </span>
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-icon name="chevron_right" color="grey-6" />
              </q-item-section>
            </q-item>
          </q-list>
        </div>

        <!-- Desktop/tablet layout: weekly grid -->
        <div
          v-else
          class="schedule-grid-container"
          :class="{ 'schedule-grid-container--delete-mode': deleteSelectionMode }"
        >
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
                  <div
                    v-else-if="!getCellSlot(time, day.dayOfWeek)!.isActive"
                    class="cell-inactive text-weight-bold"
                  >
                    CANCELADA
                  </div>
                  <div v-else class="cell-occupancy text-weight-bold">
                    {{ getCellSlot(time, day.dayOfWeek)!.bookedCount }}/{{
                      getCellSlot(time, day.dayOfWeek)!.maxCapacity
                    }}
                    <span
                      v-if="(getCellSlot(time, day.dayOfWeek)!.trialCount ?? 0) > 0"
                      class="text-warning cell-trial-count"
                    >
                      +{{ getCellSlot(time, day.dayOfWeek)!.trialCount }} SP
                    </span>
                  </div>
                </template>
              </div>
            </template>
          </div>
        </div>
      </q-tab-panel>

      <q-tab-panel name="actividades" class="q-pa-none">
        <ActivitiesPanel :active="activeTab === 'actividades'" @cascade-error="onCascadeError" />
      </q-tab-panel>
    </q-tab-panels>

    <!-- ================================================================== -->
    <!-- Extracted Dialog Components -->
    <!-- ================================================================== -->
    <SlotDetailDialog
      v-model:show="showSlotDialog"
      :schedule-id="selectedSlotScheduleId"
      :date="selectedSlotDate"
      :branch-timezone="branchTimezone"
      @bookings-changed="loadWeeklyGrid"
    />
    <CreateSlotDialog
      v-model:show="showCreateSlotDialog"
      :branches="branchesRaw"
      :default-branch-id="selectedBranchId"
      @created="loadWeeklyGrid"
    />
    <DeleteSlotDialog
      v-model:show="showDeleteSlotDialog"
      :slot-info="deleteSlotInfo"
      :branch-timezone="branchTimezone"
      @deleted="onSlotDeleted"
    />
    <HolidaysDialog v-model:show="showHolidaysDialog" @holidays-changed="loadWeeklyGrid" />
    <SesionesDePruebaDialog v-model:show="showTrialsDialog" />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useSchedulingApi } from 'src/composables/useSchedulingApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import type {
  WeeklySlotView,
  HolidayRecord,
  DayOfWeek,
  AffectedScheduleRef,
} from 'src/types/scheduling';
import { DAY_SHORT_LABELS } from 'src/types/scheduling';
import type { BranchOption } from 'src/types/member';
import SlotDetailDialog from 'src/components/scheduling/SlotDetailDialog.vue';
// Phase 113: ActivitiesDialog.vue was refactored into an embedded panel.
// Filename kept for git history; import alias reflects the new shape.
import ActivitiesPanel from 'src/components/scheduling/ActivitiesDialog.vue';
import CreateSlotDialog from 'src/components/scheduling/CreateSlotDialog.vue';
import DeleteSlotDialog from 'src/components/scheduling/DeleteSlotDialog.vue';
import HolidaysDialog from 'src/components/scheduling/HolidaysDialog.vue';
import SesionesDePruebaDialog from 'src/components/scheduling/SesionesDePruebaDialog.vue';
import { todayInTz, dowInTz, getMondayInTz } from 'src/utils/tz';

const log = createLogger('HorariosPage');
const $q = useQuasar();
const membersApi = useMembersApi();
const schedulingApi = useSchedulingApi();

// ─── State ──────────────────────────────────────────────────────────────────

const selectedBranchId = ref<number | null>(null);
const branchOptions = ref<Array<{ label: string; value: number }>>([]);
const branchesRaw = ref<BranchOption[]>([]);
const loadingBranches = ref(false);
const activeTab = ref<'horarios' | 'actividades'>('horarios');
const showCreateSlotDialog = ref(false);
// Default to AR until the weekly grid response returns the viewing branch's tz.
// Admin changes branch → grid reloads → branchTimezone refreshes.
const branchTimezone = ref<string>('America/Argentina/Buenos_Aires');
const weekStartDate = ref(getMondayInTz(branchTimezone.value));
const gridSlots = ref<WeeklySlotView[]>([]);
const gridHolidays = ref<HolidayRecord[]>([]);
const loadingGrid = ref(false);
const showSlotDialog = ref(false);
const selectedSlotScheduleId = ref<number | null>(null);
const selectedSlotDate = ref('');
const deleteSelectionMode = ref(false);
const showDeleteSlotDialog = ref(false);
const deleteSlotInfo = ref<{
  scheduleId: number;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  activityName: string;
  branchName: string;
} | null>(null);
const showHolidaysDialog = ref(false);
const showTrialsDialog = ref(false);
const showWeekDatePicker = ref(false);

// ─── Mobile detection + day picker state ────────────────────────────────────

const isMobile = computed(() => $q.screen.lt.sm);

/** Today's date as seen in the viewing branch's timezone. */
const todayISO = computed(() => todayInTz(branchTimezone.value));

/** Day-of-week index (1-6, Mon-Sat) selected in the mobile day picker. Defaults to today's dow if in range, else Monday. */
const selectedDay = ref<DayOfWeek>(getTodayDowOrMonday(branchTimezone.value));

function getTodayDowOrMonday(tz: string): DayOfWeek {
  const iso = dowInTz(tz); // 1=Mon ... 7=Sun
  // Sunday defaults to Monday (Mon–Sat week).
  return (iso === 7 ? 1 : iso) as DayOfWeek;
}

// ─── Computed ───────────────────────────────────────────────────────────────

/** Days of the week for the current weekStart */
const weekDays = computed(() => {
  const days: Array<{ dayOfWeek: DayOfWeek; shortLabel: string; dateLabel: string; date: string }> =
    [];
  // Anchor at UTC noon so setUTCDate increments cleanly across DST without
  // leaking the browser's local timezone into the grid's dates.
  const start = new Date(weekStartDate.value + 'T12:00:00Z');
  for (let i = 0; i < 6; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const dow = (i + 1) as DayOfWeek;
    days.push({
      dayOfWeek: dow,
      shortLabel: DAY_SHORT_LABELS[dow],
      dateLabel: `${d.getUTCDate()}`,
      date: d.toISOString().slice(0, 10),
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
  const start = new Date(weekStartDate.value + 'T12:00:00Z');
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 5);
  const fmt = (d: Date) =>
    d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmt(start)} - ${fmt(end)} ${end.getUTCFullYear()}`;
});

/** CSS grid template: 1 time column + 6 day columns */
const gridTemplateStyle = computed(() => ({
  'grid-template-columns': '60px repeat(6, 1fr)',
  'grid-template-rows': `auto repeat(${timeSlots.value.length}, 1fr)`,
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

// getMondayInTz + tz.ts helpers replaced the local-TZ getMonday/formatDateISO
// pair — weekStart is now a branch-TZ-aware "YYYY-MM-DD" built at UTC noon.

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
  if (!slot.isActive) return 'grid-cell--inactive';

  // Find the date for this dayOfWeek
  const day = weekDays.value.find((d) => d.dayOfWeek === dayOfWeek);
  if (day && isCellHoliday(day.date)) return 'grid-cell--holiday';

  const pct = slot.maxCapacity > 0 ? (slot.bookedCount / slot.maxCapacity) * 100 : 0;
  if (pct >= 100) return 'grid-cell--full';
  if (pct >= 70) return 'grid-cell--warning';
  return 'grid-cell--available';
}

// ─── Mobile helpers: selected-day slot list ────────────────────────────────

/** Full info for the currently-selected mobile day */
const selectedDayInfo = computed(() =>
  weekDays.value.find((d) => d.dayOfWeek === selectedDay.value)
);

const selectedDayHoliday = computed(() => {
  const info = selectedDayInfo.value;
  return info ? isCellHoliday(info.date) : false;
});

const selectedDaySlots = computed(() => {
  return gridSlots.value
    .filter((s) => s.dayOfWeek === selectedDay.value)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
});

/** Row color class mirrors cell coloring in the desktop grid */
function rowClass(slot: WeeklySlotView): string {
  const info = selectedDayInfo.value;
  if (info && isCellHoliday(info.date)) return 'slot-row--holiday';
  if (!slot.isActive) return 'slot-row--inactive';
  const pct = slot.maxCapacity > 0 ? (slot.bookedCount / slot.maxCapacity) * 100 : 0;
  if (pct >= 100) return 'slot-row--full';
  if (pct >= 70) return 'slot-row--warning';
  return 'slot-row--available';
}

function onMobileSlotClick(slot: WeeklySlotView) {
  const info = selectedDayInfo.value;
  if (!info) return;
  onCellClick(slot.startTime, slot.dayOfWeek, info.date);
}

// ─── Data Loading ───────────────────────────────────────────────────────────

async function loadBranches() {
  loadingBranches.value = true;
  try {
    const branches: BranchOption[] = await membersApi.getBranches();
    branchesRaw.value = branches;
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

    // Adopt the viewing branch's timezone. On branch switch, realign week
    // and selected day to the viewed branch's current week so admins don't
    // land on yesterday-in-AR when looking at BCN on a Sunday evening.
    const prevTz = branchTimezone.value;
    branchTimezone.value = result.branchTimezone;
    if (result.branchTimezone !== prevTz) {
      weekStartDate.value = getMondayInTz(result.branchTimezone);
      selectedDay.value = getTodayDowOrMonday(result.branchTimezone);
    }

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
  const d = new Date(weekStartDate.value + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 7);
  weekStartDate.value = d.toISOString().slice(0, 10);
}

function nextWeek() {
  const d = new Date(weekStartDate.value + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 7);
  weekStartDate.value = d.toISOString().slice(0, 10);
}

function onWeekDatePicked(val: string | null) {
  showWeekDatePicker.value = false;
  if (!val) return;
  // q-date emits "YYYY/MM/DD"; snap to the Monday of that week so the grid
  // stays aligned to the Mon–Sat layout.
  const picked = new Date(val.replaceAll('/', '-') + 'T12:00:00Z');
  const dow = picked.getUTCDay(); // 0=Sun..6=Sat
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  picked.setUTCDate(picked.getUTCDate() + diffToMon);
  weekStartDate.value = picked.toISOString().slice(0, 10);
}

function onBranchChange() {
  gridSlots.value = [];
  gridHolidays.value = [];
  loadWeeklyGrid();
}

// ─── Cascade error handler (Phase 113 — Activities deactivation 409) ────────

function onCascadeError(payload: { message: string; affectedSchedules: AffectedScheduleRef[] }) {
  const list = payload.affectedSchedules
    .slice(0, 5)
    .map(
      (s) =>
        `${DAY_SHORT_LABELS[s.dayOfWeek as DayOfWeek]} ${s.startTime}-${s.endTime} (${s.branchName})`
    )
    .join(', ');
  const more =
    payload.affectedSchedules.length > 5 ? ` y ${payload.affectedSchedules.length - 5} más` : '';
  $q.notify({
    type: 'negative',
    message: `${payload.message} Afectados: ${list}${more}`,
    timeout: 8000,
    multiLine: true,
  });
}

// ─── Cell Click -> Open Slot Detail or Attendance Panel ──────────────────────

function onCellClick(time: string, dayOfWeek: DayOfWeek, date: string) {
  const slot = getCellSlot(time, dayOfWeek);
  if (!slot) return;

  // Delete-selection mode short-circuits the normal slot-detail flow.
  // Holiday cells are still selectable here because the deletion targets
  // the recurring schedule, not the individual day.
  if (deleteSelectionMode.value) {
    deleteSlotInfo.value = {
      scheduleId: slot.id,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      activityName: slot.activityName,
      branchName: slot.branchName,
    };
    showDeleteSlotDialog.value = true;
    deleteSelectionMode.value = false;
    return;
  }

  if (isCellHoliday(date)) return;

  // Always open the slot detail dialog — the legacy right-drawer attendance
  // panel is superseded by the unified dialog + QR-based check-in.
  selectedSlotScheduleId.value = slot.id;
  selectedSlotDate.value = date;
  showSlotDialog.value = true;
}

function toggleDeleteSelectionMode() {
  deleteSelectionMode.value = !deleteSelectionMode.value;
}

function onSlotDeleted() {
  showDeleteSlotDialog.value = false;
  deleteSlotInfo.value = null;
  loadWeeklyGrid();
}

// ─── Watchers & Lifecycle ────────────────────────────────────────────────────

watch(weekStartDate, () => {
  if (selectedBranchId.value) {
    loadWeeklyGrid();
  }
});

const route = useRoute();

onMounted(() => {
  loadBranches();
  // Deep-link from AlumnoDetailPage's "Sesión de Prueba" card → open the
  // Sesiones de Prueba dialog directly so the admin can find the alumno's
  // booking without an extra click.
  if (route.query.openTrials === '1') {
    showTrialsDialog.value = true;
  }
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

.schedule-grid-container--delete-mode .grid-cell {
  cursor: crosshair;
}

.schedule-grid-container--delete-mode .grid-cell:not(.grid-cell--empty) {
  outline: 2px dashed var(--q-negative);
  outline-offset: -2px;
}

.schedule-grid-container--delete-mode .grid-cell:not(.grid-cell--empty):hover {
  background: #ffcdd2;
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

.grid-cell--inactive {
  background: repeating-linear-gradient(45deg, #fce4ec, #fce4ec 6px, #f8bbd0 6px, #f8bbd0 12px);
  color: #b71c1c;
}

.cell-inactive {
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  margin-top: 2px;
}

.slot-row--inactive {
  background: #fce4ec;
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

.cell-trial-count {
  display: block;
  font-size: 0.65rem;
  font-weight: 600;
  line-height: 1;
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

/* Mobile: day picker */
.day-picker-btn {
  min-height: 56px;
  border-radius: 8px;
  background: #f5f5f5;
  padding: 4px 0;
}

.day-picker-btn--today {
  background: #e3f2fd;
}

.day-picker-btn--active {
  background: var(--q-primary);
  color: white;
}

.day-picker-btn--active.day-picker-btn--today {
  background: var(--q-primary);
  color: white;
}

/* Mobile: slot row coloring — matches desktop cell palette */
.slot-row--available {
  background: #e8f5e9;
}

.slot-row--warning {
  background: #fff8e1;
}

.slot-row--full {
  background: #ffebee;
}

.slot-row--holiday {
  background: #eeeeee;
  color: #9e9e9e;
}
</style>
