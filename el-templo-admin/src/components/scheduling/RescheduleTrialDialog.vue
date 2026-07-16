<template>
  <q-dialog
    :model-value="show"
    @update:model-value="$emit('update:show', $event)"
    persistent
  >
    <q-card style="width: 460px; max-width: 95vw">
      <q-card-section class="q-pb-sm">
        <div class="text-h6">Reprogramar sesión de prueba</div>
        <div v-if="trial" class="text-caption text-grey-7 q-mt-xs">
          {{ trial.firstName }} {{ trial.lastName }} · turno actual
          {{ trial.startTime }}
        </div>
      </q-card-section>

      <q-separator />

      <q-card-section class="q-gutter-md">
        <!-- Nueva fecha. q-date emite "YYYY/MM/DD" → normalizamos a "-"
             (mismo patrón que SesionesDePruebaDialog.onDatePicked). -->
        <div>
          <div class="text-body2 text-grey-8 q-mb-xs">Nueva fecha</div>
          <q-input
            :model-value="selectedDateLabel"
            outlined
            dense
            readonly
            placeholder="Elegí una fecha"
            :error="false"
          >
            <template #append>
              <q-icon name="event" class="cursor-pointer">
                <q-popup-proxy
                  v-model="showDatePicker"
                  cover
                  transition-show="scale"
                  transition-hide="scale"
                >
                  <q-date
                    :model-value="selectedDate"
                    @update:model-value="onDatePicked"
                    :options="isSelectableDate"
                    minimal
                    first-day-of-week="1"
                  />
                </q-popup-proxy>
              </q-icon>
            </template>
          </q-input>
        </div>

        <!-- Slot disponible para la fecha elegida (mismo día de semana). -->
        <div>
          <div class="text-body2 text-grey-8 q-mb-xs">Turno</div>
          <q-select
            v-model="selectedScheduleId"
            :options="slotOptions"
            option-value="value"
            option-label="label"
            emit-value
            map-options
            outlined
            dense
            :disable="!selectedDate || loadingSlots"
            :loading="loadingSlots"
            placeholder="Elegí un turno"
          >
            <template #no-option>
              <q-item>
                <q-item-section class="text-grey-5 text-italic">
                  {{
                    selectedDate
                      ? 'No hay turnos para ese día'
                      : 'Elegí una fecha primero'
                  }}
                </q-item-section>
              </q-item>
            </template>
          </q-select>
        </div>
      </q-card-section>

      <q-separator />

      <q-card-actions align="right" class="q-pa-md">
        <q-btn
          flat
          label="Cancelar"
          color="grey-7"
          :disable="submitting"
          @click="$emit('update:show', false)"
        />
        <q-btn
          unelevated
          label="Reprogramar"
          color="primary"
          no-caps
          :loading="submitting"
          :disable="!canSubmit"
          @click="onSubmit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useSchedulingApi } from 'src/composables/useSchedulingApi';
import type { TrialListItem, WeeklySlotView } from 'src/types/scheduling';

const log = createLogger('RescheduleTrialDialog');
const $q = useQuasar();
const schedulingApi = useSchedulingApi();

const props = defineProps<{
  show: boolean;
  trial: TrialListItem | null;
  branchId: number | null;
}>();

const emit = defineEmits<{
  'update:show': [value: boolean];
  rescheduled: [];
}>();

const showDatePicker = ref(false);
const selectedDate = ref<string | null>(null); // YYYY-MM-DD
const selectedScheduleId = ref<number | null>(null);
const weeklySlots = ref<WeeklySlotView[]>([]);
const loadingSlots = ref(false);
const submitting = ref(false);

/** Monday (branch-agnostic local) of the given date — same shape as FixedSchedulePicker.getMonday. */
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

/** schedule.dayOfWeek is 1=Lun..6=Sáb; getUTCDay at noon → stable 0=Dom..6=Sáb. */
function dayOfWeekOf(dateISO: string): number {
  return new Date(dateISO + 'T12:00:00Z').getUTCDay();
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** q-date option filter: no reprogramar hacia el pasado. */
function isSelectableDate(dateStr: string): boolean {
  // q-date passes "YYYY/MM/DD".
  return dateStr.replaceAll('/', '-') >= todayISO();
}

const selectedDateLabel = computed(() => {
  if (!selectedDate.value) return '';
  const d = new Date(selectedDate.value + 'T12:00:00Z');
  return d.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
});

// Slots del día de semana de la fecha elegida (plantillas recurrentes activas).
const slotOptions = computed<Array<{ value: number; label: string }>>(() => {
  if (!selectedDate.value) return [];
  const dow = dayOfWeekOf(selectedDate.value);
  return weeklySlots.value
    .filter((s) => s.dayOfWeek === dow && s.isActive)
    .map((s) => ({
      value: s.id,
      label: `${s.startTime} — ${s.activityName}`,
    }));
});

const canSubmit = computed(
  () =>
    !!selectedDate.value &&
    selectedScheduleId.value !== null &&
    props.branchId !== null &&
    props.trial !== null
);

/** Parse "YYYY-MM-DD" to a local Date at noon (avoids tz day-drift in getMonday). */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

function onDatePicked(val: string | null): void {
  showDatePicker.value = false;
  if (val) {
    // q-date emite "YYYY/MM/DD" — normalizar a "YYYY-MM-DD".
    selectedDate.value = val.replaceAll('/', '-');
    // La fecha cambió → el turno anterior puede no aplicar a ese día.
    selectedScheduleId.value = null;
    // WR-04: recargar la grilla de la SEMANA de la fecha elegida (no la actual)
    // para reflejar isActive/feriados/cancelaciones específicos de esa semana.
    if (props.branchId !== null) void loadSlots(props.branchId, selectedDate.value);
  }
}

async function loadSlots(branchId: number, referenceDate?: string): Promise<void> {
  loadingSlots.value = true;
  try {
    // WR-04: grilla del lunes de la fecha de referencia (la elegida) o, al abrir
    // sin fecha aún, la semana actual. El estado isActive/feriado es por-semana.
    const monday = getMonday(
      referenceDate ? parseLocalDate(referenceDate) : new Date(),
    );
    const result = await schedulingApi.getWeeklyGrid(branchId, monday);
    weeklySlots.value = result.slots;
  } catch (err: unknown) {
    const fallback = err instanceof Error ? err.message : 'Error cargando turnos';
    const msg = schedulingApi.error.value ?? fallback;
    log.error('Error loading weekly grid for reschedule', { error: msg, branchId });
    $q.notify({ type: 'negative', message: msg, timeout: 5000 });
  } finally {
    loadingSlots.value = false;
  }
}

async function onSubmit(): Promise<void> {
  if (!canSubmit.value || !props.trial || props.branchId === null || selectedScheduleId.value === null || !selectedDate.value) {
    return;
  }
  submitting.value = true;
  try {
    await schedulingApi.rescheduleTrial(props.trial.bookingId, {
      scheduleId: selectedScheduleId.value,
      date: selectedDate.value,
      branchId: props.branchId,
    });
    $q.notify({ type: 'positive', message: 'Sesión de prueba reprogramada' });
    emit('rescheduled');
    emit('update:show', false);
  } catch (err: unknown) {
    const fallback = err instanceof Error ? err.message : 'Error reprogramando sesión de prueba';
    const msg = schedulingApi.error.value ?? fallback;
    log.error('Error rescheduling trial', { error: msg, bookingId: props.trial.bookingId });
    $q.notify({ type: 'negative', message: msg, timeout: 5000 });
  } finally {
    submitting.value = false;
  }
}

// Al abrir: resetear selección y cargar los turnos de la sede.
watch(
  () => props.show,
  (open) => {
    if (open) {
      selectedDate.value = null;
      selectedScheduleId.value = null;
      weeklySlots.value = [];
      if (props.branchId !== null) void loadSlots(props.branchId);
    }
  }
);
</script>
