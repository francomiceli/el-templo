<template>
  <div>
    <div class="row items-center justify-between q-mb-sm">
      <div>
        <div class="text-subtitle2">{{ title }}</div>
        <div v-if="branchName" class="text-caption text-grey-7">Sede: {{ branchName }}</div>
      </div>
      <q-badge
        :color="modelValue.length === requiredCount ? 'positive' : 'grey'"
        class="text-body2 q-pa-sm"
      >
        Clases seleccionadas: {{ modelValue.length }}/{{ requiredCount }}
      </q-badge>
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
            </template>
          </div>
        </template>
      </div>
    </div>

    <div v-else class="text-center text-grey-5 text-italic q-pa-lg">
      No hay horarios configurados para esta sede
    </div>
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

const props = defineProps<{
  modelValue: number[];
  branchId: number;
  requiredCount: number;
  title?: string;
  branchName?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: number[]): void;
}>();

const $q = useQuasar();
const log = createLogger('FixedSchedulePicker');

const slots = ref<WeeklySlotView[]>([]);
const loading = ref(false);

const title = computed(() => props.title ?? 'Selecciona los horarios fijos');

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

function cellClass(time: string, dayOfWeek: DayOfWeek): string {
  const s = slotFor(time, dayOfWeek);
  if (!s) return 'slot-cell--empty';
  if (s.isFull && !props.modelValue.includes(s.id)) return 'slot-cell--full';
  if (props.modelValue.includes(s.id)) return 'slot-cell--selected';
  return 'slot-cell--available';
}

function toggleCell(time: string, dayOfWeek: DayOfWeek): void {
  const s = slotFor(time, dayOfWeek);
  if (!s) return;
  const current = [...props.modelValue];
  const idx = current.indexOf(s.id);
  if (idx >= 0) {
    current.splice(idx, 1);
    emit('update:modelValue', current);
    return;
  }
  if (s.isFull) return;
  if (current.length >= props.requiredCount) return;
  current.push(s.id);
  emit('update:modelValue', current);
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const monday = getMonday(new Date());
    const result = await schedulingApi.getWeeklyGrid(props.branchId, monday);
    slots.value = result.slots;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading branch schedules', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando horarios' });
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.branchId,
  (id) => {
    if (id) void load();
  },
  { immediate: true }
);

defineExpose({ reload: load, slots });
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
  border-width: 3px;
}

.slot-cell--full {
  background: #f5f5f5;
  color: #bdbdbd;
  cursor: not-allowed;
  border-color: #eeeeee;
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
