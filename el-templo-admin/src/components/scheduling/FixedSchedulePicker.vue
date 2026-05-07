<template>
  <div>
    <div class="row items-center justify-between q-mb-sm">
      <div>
        <div class="text-subtitle2">{{ title }}</div>
        <div v-if="!multiBranch && branchName" class="text-caption text-grey-7">
          Sede: {{ branchName }}
        </div>
      </div>
      <q-badge :color="badgeColor" class="text-body2 q-pa-sm">
        Clases seleccionadas: {{ modelValue.length
        }}<template v-if="requiredCount !== null">/{{ requiredCount }}</template>
      </q-badge>
    </div>

    <div v-if="multiBranch && availableBranches && availableBranches.length > 0" class="q-mb-sm">
      <q-select
        v-model="activeBranchId"
        :options="branchOptions"
        emit-value
        map-options
        outlined
        dense
        label="Sede"
      />
    </div>

    <div v-if="modelValue.length > 0" class="q-mb-sm row q-gutter-xs">
      <q-chip
        v-for="info in selectedChips"
        :key="info.id"
        removable
        dense
        :color="info.branchId === activeBranchId ? 'primary' : 'grey-4'"
        :text-color="info.branchId === activeBranchId ? 'white' : 'grey-9'"
        @remove="removeSlot(info.id)"
      >
        {{ info.label }}
      </q-chip>
    </div>

    <div v-if="loading" class="flex flex-center q-pa-lg">
      <q-spinner-dots size="40px" color="primary" />
    </div>

    <div v-else-if="slots.length > 0" class="slot-picker-grid">
      <div class="slot-grid" :style="gridStyle">
        <div class="slot-header slot-corner" />
        <div
          v-for="day in days"
          :key="day.dayOfWeek"
          class="slot-header slot-day-header text-center"
        >
          {{ day.label }}
        </div>

        <template v-for="time in timeSlots" :key="time">
          <div class="slot-time-label text-caption text-grey-7">{{ time }}</div>
          <div
            v-for="day in days"
            :key="`${time}-${day.dayOfWeek}`"
            class="slot-cell"
            :class="cellClass(time, day.dayOfWeek)"
            @click="toggleCell(time, day.dayOfWeek)"
          >
            <template v-if="slotFor(time, day.dayOfWeek)">
              <div class="slot-cell-activity text-caption ellipsis">
                {{ slotFor(time, day.dayOfWeek)!.activityName }}
              </div>
              <div class="slot-cell-capacity text-caption">
                {{ slotFor(time, day.dayOfWeek)!.bookedCount }}/{{
                  slotFor(time, day.dayOfWeek)!.maxCapacity
                }}
              </div>
              <!-- Full slot: small icon to open the deferred-start modal.
                   Clicking the cell normally is a no-op (full); the icon is
                   the only entry point so the admin doesn't accidentally
                   trigger it. -->
              <q-btn
                v-if="
                  slotFor(time, day.dayOfWeek)!.isFull &&
                  !modelValue.includes(slotFor(time, day.dayOfWeek)!.id) &&
                  !selectedDays.has(day.dayOfWeek)
                "
                flat
                dense
                round
                size="xs"
                icon="event_upcoming"
                class="slot-cell-defer-btn"
                @click.stop="openDeferredModal(slotFor(time, day.dayOfWeek)!)"
              >
                <q-tooltip>Asignar desde una fecha futura</q-tooltip>
              </q-btn>
            </template>
          </div>
        </template>
      </div>
    </div>

    <div v-else class="text-center text-grey-5 text-italic q-pa-lg">
      No hay horarios configurados para esta sede
    </div>

    <!-- Deferred-start confirmation modal: opens from the icon on full
         cells. Asks the backend for the next date the slot has open
         capacity, then lets the admin assign it starting that day. -->
    <q-dialog v-model="deferredModal.open">
      <q-card style="min-width: 320px">
        <q-card-section>
          <div class="text-h6">Horario completo esta semana</div>
        </q-card-section>
        <q-card-section v-if="deferredModal.slot" class="q-pt-none">
          <div class="q-mb-sm">
            <strong>{{ deferredModal.slot.activityName }}</strong> ·
            {{ DAY_SHORT_LABELS[deferredModal.slot.dayOfWeek as DayOfWeek] }}
            {{ deferredModal.slot.startTime }}
          </div>
          <div v-if="deferredModal.loading" class="row items-center q-gutter-sm">
            <q-spinner-dots size="20px" color="primary" />
            <span class="text-caption">Buscando próxima fecha disponible…</span>
          </div>
          <div v-else-if="deferredModal.nextDate" class="text-body2">
            Próxima fecha disponible: <strong>{{ formatDate(deferredModal.nextDate) }}</strong>
            <div class="text-caption text-grey-7 q-mt-xs">
              El alumno empezará a tener este turno desde esa fecha.
            </div>
          </div>
          <div v-else class="text-body2 text-negative">
            No se encontró cupo en las próximas 12 semanas.
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" @click="closeDeferredModal" />
          <q-btn
            color="primary"
            label="Asignar desde esa fecha"
            :disable="!deferredModal.nextDate || deferredModal.loading"
            @click="confirmDeferredAssign"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { DAY_SHORT_LABELS, type WeeklySlotView, type DayOfWeek } from 'src/types/scheduling';
import { useSchedulingApi } from 'src/composables/useSchedulingApi';
import { createLogger } from 'src/utils/logger';

const schedulingApi = useSchedulingApi();

function getMonday(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

interface BranchOption {
  id: number;
  name: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: number[];
    branchId: number;
    /** Maximum number of slots that can be selected. */
    /**
     * Upper bound for selectable slots. `null` means no upper bound
     * (legacy flexible plans where classesPerWeek is not set).
     */
    requiredCount: number | null;
    /**
     * When true, the picker allows 0..requiredCount selections (partial mode).
     * When false (default), exactly requiredCount is expected (fixed mode).
     */
    allowPartial?: boolean;
    title?: string;
    branchName?: string;
    /**
     * Multi-branch mode: when true, the picker shows a sede selector and
     * accepts anchors across branches. The parent must pass
     * `availableBranches` listing the sedes the user can pick from
     * (typically scoped to the same country as `branchId`).
     */
    multiBranch?: boolean;
    availableBranches?: BranchOption[];
  }>(),
  { allowPartial: false, multiBranch: false }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: number[]): void;
}>();

const $q = useQuasar();
const log = createLogger('FixedSchedulePicker');

// Cumulative slot cache keyed by branchId. Multi-branch mode reuses entries
// across branch switches so we don't re-fetch when the admin flips back.
const branchSlots = ref<Map<number, WeeklySlotView[]>>(new Map());
const loading = ref(false);
const activeBranchId = ref(props.branchId);

// Per-slot deferred start dates. Populated when the admin clicks the
// event_upcoming icon on a full cell and confirms the next-available date
// suggested by the backend. Sent up to the parent dialog via getStartDates().
const selectedStartDates = ref<Record<number, string>>({});

interface DeferredModalState {
  open: boolean;
  slot: WeeklySlotView | null;
  nextDate: string | null;
  loading: boolean;
}
const deferredModal = ref<DeferredModalState>({
  open: false,
  slot: null,
  nextDate: null,
  loading: false,
});

// Metadata for slots the user has selected — keeps enough info to render
// chips even when activeBranchId points elsewhere (the slot row isn't in
// the current branch's grid).
interface SelectedSlotMeta {
  id: number;
  branchId: number;
  branchName: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  activityName: string;
}
const selectedMeta = ref<Map<number, SelectedSlotMeta>>(new Map());

const title = computed(() => props.title ?? 'Selecciona los horarios fijos');

const badgeColor = computed(() => {
  if (props.requiredCount === null) {
    return props.modelValue.length > 0 ? 'primary' : 'grey';
  }
  if (props.modelValue.length === props.requiredCount) return 'positive';
  if (props.allowPartial && props.modelValue.length < props.requiredCount) return 'primary';
  return 'grey';
});

const branchOptions = computed(() =>
  (props.availableBranches ?? []).map((b) => ({ label: b.name, value: b.id }))
);

const branchNameById = computed(() => {
  const m = new Map<number, string>();
  for (const b of props.availableBranches ?? []) m.set(b.id, b.name);
  if (props.branchName && !m.has(props.branchId)) m.set(props.branchId, props.branchName);
  return m;
});

const slots = computed<WeeklySlotView[]>(() => branchSlots.value.get(activeBranchId.value) ?? []);

const days = computed(() => {
  const arr: Array<{ dayOfWeek: DayOfWeek; label: string }> = [];
  for (let i = 1; i <= 6; i++) {
    const dow = i as DayOfWeek;
    arr.push({ dayOfWeek: dow, label: DAY_SHORT_LABELS[dow] });
  }
  return arr;
});

const timeSlots = computed(() => {
  const set = new Set<string>();
  for (const s of slots.value) set.add(s.startTime);
  return Array.from(set).sort();
});

const gridStyle = computed(() => ({
  'grid-template-columns': '55px repeat(6, 1fr)',
  'grid-template-rows': `auto repeat(${timeSlots.value.length}, 1fr)`,
}));

const slotMap = computed(() => {
  const map = new Map<string, WeeklySlotView>();
  for (const s of slots.value) map.set(`${s.startTime}-${s.dayOfWeek}`, s);
  return map;
});

function slotFor(time: string, dayOfWeek: DayOfWeek): WeeklySlotView | undefined {
  return slotMap.value.get(`${time}-${dayOfWeek}`);
}

// Days-of-week already covered by an anchor (across all branches in
// multi-branch mode, or just this branch otherwise) — used to grey out
// other cells in those days so the user picks one slot per day.
const selectedDays = computed<Set<DayOfWeek>>(() => {
  const set = new Set<DayOfWeek>();
  for (const meta of selectedMeta.value.values()) set.add(meta.dayOfWeek);
  return set;
});

const selectedChips = computed(() => {
  const items: Array<{ id: number; label: string; branchId: number }> = [];
  for (const id of props.modelValue) {
    const meta = selectedMeta.value.get(id);
    if (!meta) continue;
    const dayLabel = DAY_SHORT_LABELS[meta.dayOfWeek];
    const branchSuffix = props.multiBranch && meta.branchName ? ` · ${meta.branchName}` : '';
    const deferredDate = selectedStartDates.value[id];
    const deferredSuffix = deferredDate ? ` · desde ${shortDate(deferredDate)}` : '';
    items.push({
      id,
      label: `${dayLabel} ${meta.startTime}${branchSuffix}${deferredSuffix}`,
      branchId: meta.branchId,
    });
  }
  return items;
});

function shortDate(yyyymmdd: string): string {
  const d = new Date(yyyymmdd + 'T12:00:00Z');
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function cellClass(time: string, dayOfWeek: DayOfWeek): string {
  const s = slotFor(time, dayOfWeek);
  if (!s) return 'slot-cell--empty';
  if (props.modelValue.includes(s.id)) return 'slot-cell--selected';
  if (selectedDays.value.has(dayOfWeek)) return 'slot-cell--day-taken';
  if (s.isFull) return 'slot-cell--full';
  return 'slot-cell--available';
}

function recordSelection(s: WeeklySlotView): void {
  selectedMeta.value.set(s.id, {
    id: s.id,
    branchId: activeBranchId.value,
    branchName: branchNameById.value.get(activeBranchId.value) ?? '',
    dayOfWeek: s.dayOfWeek as DayOfWeek,
    startTime: s.startTime,
    activityName: s.activityName,
  });
}

function toggleCell(time: string, dayOfWeek: DayOfWeek): void {
  const s = slotFor(time, dayOfWeek);
  if (!s) return;
  const current = [...props.modelValue];
  const idx = current.indexOf(s.id);
  if (idx >= 0) {
    current.splice(idx, 1);
    selectedMeta.value.delete(s.id);
    emit('update:modelValue', current);
    return;
  }
  // Block: full slot, day already taken, or selection cap reached.
  if (s.isFull) return;
  if (selectedDays.value.has(dayOfWeek)) return;
  if (props.requiredCount !== null && current.length >= props.requiredCount) return;
  current.push(s.id);
  recordSelection(s);
  emit('update:modelValue', current);
}

function removeSlot(scheduleId: number): void {
  const current = [...props.modelValue];
  const idx = current.indexOf(scheduleId);
  if (idx < 0) return;
  current.splice(idx, 1);
  selectedMeta.value.delete(scheduleId);
  delete selectedStartDates.value[scheduleId];
  emit('update:modelValue', current);
}

/**
 * Open the deferred-start modal for a full slot. Fetches the next
 * date the slot has open capacity from the backend so the admin sees
 * a concrete date before confirming.
 */
async function openDeferredModal(slot: WeeklySlotView): Promise<void> {
  // Day already taken by another anchor → block the same way regular
  // selection is blocked. The button shouldn't render in that case but
  // belt-and-suspenders.
  if (selectedDays.value.has(slot.dayOfWeek as DayOfWeek)) return;
  if (props.requiredCount !== null && props.modelValue.length >= props.requiredCount) {
    $q.notify({
      type: 'warning',
      message: `Ya seleccionaste ${props.requiredCount} turnos.`,
    });
    return;
  }
  deferredModal.value = { open: true, slot, nextDate: null, loading: true };
  try {
    const date = await schedulingApi.getNextAvailableDate(slot.id);
    deferredModal.value.nextDate = date;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching next available date', { error: message, slotId: slot.id });
  } finally {
    deferredModal.value.loading = false;
  }
}

function closeDeferredModal(): void {
  deferredModal.value = { open: false, slot: null, nextDate: null, loading: false };
}

function confirmDeferredAssign(): void {
  const slot = deferredModal.value.slot;
  const date = deferredModal.value.nextDate;
  if (!slot || !date) return;
  const current = [...props.modelValue];
  if (!current.includes(slot.id)) {
    current.push(slot.id);
    recordSelection(slot);
  }
  selectedStartDates.value = { ...selectedStartDates.value, [slot.id]: date };
  emit('update:modelValue', current);
  closeDeferredModal();
}

function formatDate(yyyymmdd: string): string {
  const d = new Date(yyyymmdd + 'T12:00:00Z');
  return d.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

async function loadBranch(branchId: number): Promise<void> {
  if (branchSlots.value.has(branchId)) return; // cached
  loading.value = true;
  try {
    const monday = getMonday(new Date());
    const result = await schedulingApi.getWeeklyGrid(branchId, monday);
    branchSlots.value.set(branchId, result.slots);

    // Backfill metadata for any pre-selected scheduleIds that live in this
    // branch — this covers the "edit existing anchors" path where modelValue
    // arrives populated from the parent before the user has clicked anything.
    for (const s of result.slots) {
      if (props.modelValue.includes(s.id) && !selectedMeta.value.has(s.id)) {
        selectedMeta.value.set(s.id, {
          id: s.id,
          branchId,
          branchName: branchNameById.value.get(branchId) ?? '',
          dayOfWeek: s.dayOfWeek as DayOfWeek,
          startTime: s.startTime,
          activityName: s.activityName,
        });
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading branch schedules', { error: message, branchId });
    $q.notify({ type: 'negative', message: 'Error cargando horarios' });
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.branchId,
  (id) => {
    if (id) {
      activeBranchId.value = id;
      void loadBranch(id);
    }
  },
  { immediate: true }
);

watch(activeBranchId, (id) => {
  if (id) void loadBranch(id);
});

// Multi-branch edit path: when modelValue arrives populated and contains
// anchors not in branchId, eagerly load every branch in availableBranches
// so the chips render with the correct sede labels on first paint.
watch(
  () => [props.modelValue, props.availableBranches],
  () => {
    if (!props.multiBranch || !props.availableBranches) return;
    if (props.modelValue.length === 0) return;
    const missing = props.modelValue.some((id) => !selectedMeta.value.has(id));
    if (!missing) return;
    for (const b of props.availableBranches) {
      if (!branchSlots.value.has(b.id)) void loadBranch(b.id);
    }
  },
  { immediate: true, deep: true }
);

defineExpose({
  reload: () => loadBranch(activeBranchId.value),
  slots,
  /**
   * Returns the per-slot deferred start dates the admin chose via the
   * "event_upcoming" icon on full cells. Empty object when no deferral.
   * Parent dialogs forward this to the backend alongside scheduleIds.
   */
  getStartDates: (): Record<number, string> => ({ ...selectedStartDates.value }),
});
</script>

<style scoped>
.slot-picker-grid {
  overflow-x: auto;
}

.slot-grid {
  display: grid;
  gap: 2px;
  min-width: 420px;
}

.slot-header {
  padding: 6px 4px;
  background: var(--q-primary);
  color: white;
  font-size: 0.8rem;
  font-weight: 600;
}

.slot-corner {
  border-radius: 4px 0 0 0;
}

.slot-day-header {
  border-radius: 0;
}

.slot-day-header:last-child {
  border-radius: 0 4px 0 0;
}

.slot-time-label {
  padding: 6px 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  font-weight: 500;
}

.slot-cell {
  padding: 4px;
  min-height: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px solid #e0e0e0;
  cursor: pointer;
  transition: all 0.15s;
  border-radius: 4px;
}

.slot-cell:hover:not(.slot-cell--empty):not(.slot-cell--full) {
  filter: brightness(0.92);
}

.slot-cell--empty {
  background: #fafafa;
  cursor: default;
  border-color: transparent;
}

.slot-cell--available {
  background: #e8f5e9;
  border-color: #c8e6c9;
}

.slot-cell--selected {
  background: #bbdefb;
  border-color: var(--q-primary);
  /* outline keeps the highlight visible without changing the cell's
     box-size, so selecting/unselecting doesn't shift the grid layout. */
  outline: 1px solid var(--q-primary);
  outline-offset: -2px;
}

.slot-cell--full {
  background: #f5f5f5;
  color: #bdbdbd;
  cursor: not-allowed;
  border-color: #eeeeee;
  position: relative;
}

.slot-cell-defer-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  color: var(--q-primary);
  background: rgba(255, 255, 255, 0.85);
  cursor: pointer;
}

.slot-cell--day-taken {
  background: #fafafa;
  color: #bdbdbd;
  cursor: not-allowed;
  border-color: #eeeeee;
  opacity: 0.6;
}

.slot-cell-activity {
  font-size: 0.65rem;
  max-width: 100%;
  text-align: center;
}

.slot-cell-capacity {
  font-size: 0.7rem;
  margin-top: 1px;
  font-weight: 600;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
