<!-- Franjas de turno por sede (cadencia de mensajes en Sesiones de Prueba,
     SPEC "DECISIONES DE FRANCO" §3): mañana/tarde por sede, editables solo
     owner/admin. Mismo patrón de "engranaje con diálogo" que
     RenewalReasonsDialog.vue — abierto desde el ícono de la cabecera del tab
     Sesiones de prueba. PUT por sede al perder foco (debounce), con
     validación de inicio<fin y mañana<tarde ANTES de mandar el request
     (el server también valida — esto es solo feedback inmediato). -->
<template>
  <q-dialog v-model="localOpen" @show="onShow">
    <q-card style="min-width: 420px; max-width: 640px; width: 100%">
      <q-card-section class="row items-center">
        <q-icon name="schedule" size="24px" class="q-mr-sm" />
        <div class="text-h6">Turnos de sesiones de prueba</div>
        <q-space />
        <q-btn flat round dense icon="close" v-close-popup />
      </q-card-section>
      <q-separator />

      <q-card-section>
        <div class="text-caption text-grey-7 q-mb-md">
          Franjas horarias por sede — determinan cuándo corresponde cada mensaje de la cadencia
          (M1/M2/M3).
        </div>

        <div v-if="loading" class="flex flex-center q-pa-lg">
          <q-spinner-dots size="32px" color="primary" />
        </div>

        <q-list v-else bordered separator class="rounded-borders">
          <q-item v-for="row in rows" :key="row.branchId" class="q-py-sm">
            <q-item-section>
              <div class="text-weight-medium q-mb-xs">{{ row.branchName }}</div>
              <div class="row q-col-gutter-sm">
                <div class="col-6">
                  <div class="text-caption text-grey-6">Mañana</div>
                  <div class="row q-gutter-xs items-center">
                    <q-input
                      :model-value="row.morningStart"
                      type="time"
                      dense
                      outlined
                      :error="!!rowErrors[row.branchId]"
                      style="max-width: 110px"
                      @update:model-value="(v) => onFieldChange(row, 'morningStart', String(v))"
                    />
                    <span class="text-grey-6">a</span>
                    <q-input
                      :model-value="row.morningEnd"
                      type="time"
                      dense
                      outlined
                      :error="!!rowErrors[row.branchId]"
                      style="max-width: 110px"
                      @update:model-value="(v) => onFieldChange(row, 'morningEnd', String(v))"
                    />
                  </div>
                </div>
                <div class="col-6">
                  <div class="text-caption text-grey-6">Tarde</div>
                  <div class="row q-gutter-xs items-center">
                    <q-input
                      :model-value="row.afternoonStart"
                      type="time"
                      dense
                      outlined
                      :error="!!rowErrors[row.branchId]"
                      style="max-width: 110px"
                      @update:model-value="(v) => onFieldChange(row, 'afternoonStart', String(v))"
                    />
                    <span class="text-grey-6">a</span>
                    <q-input
                      :model-value="row.afternoonEnd"
                      type="time"
                      dense
                      outlined
                      :error="!!rowErrors[row.branchId]"
                      style="max-width: 110px"
                      @update:model-value="(v) => onFieldChange(row, 'afternoonEnd', String(v))"
                    />
                  </div>
                </div>
              </div>
              <div v-if="rowErrors[row.branchId]" class="text-caption text-negative q-mt-xs">
                {{ rowErrors[row.branchId] }}
              </div>
            </q-item-section>
            <q-item-section side>
              <q-spinner v-if="savingBranchId === row.branchId" size="18px" color="primary" />
              <q-icon v-else-if="savedBranchId === row.branchId" name="check" color="positive" />
            </q-item-section>
          </q-item>
          <q-item v-if="rows.length === 0">
            <q-item-section class="text-grey-6 text-italic">Sin sedes para mostrar</q-item-section>
          </q-item>
        </q-list>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useReportsApi, type TrialShiftsRowClient } from 'src/composables/useReportsApi';

const log = createLogger('TrialShiftsDialog');
const $q = useQuasar();
const reportsApi = useReportsApi();

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const localOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const rows = ref<TrialShiftsRowClient[]>([]);
const loading = ref(false);
const savingBranchId = ref<number | null>(null);
const savedBranchId = ref<number | null>(null);
const rowErrors = ref<Record<number, string | null>>({});

/** "HH:MM:SS" (lo que devuelve MySQL TIME) → "HH:MM" — <input type="time"> no maneja segundos. */
function hhmm(t: string): string {
  return t.slice(0, 5);
}

async function onShow() {
  loading.value = true;
  try {
    const data = await reportsApi.getTrialShifts();
    rows.value = data.map((r) => ({
      ...r,
      morningStart: hhmm(r.morningStart),
      morningEnd: hhmm(r.morningEnd),
      afternoonStart: hhmm(r.afternoonStart),
      afternoonEnd: hhmm(r.afternoonEnd),
    }));
  } catch (err: unknown) {
    log.error('Error cargando turnos', { error: err instanceof Error ? err.message : String(err) });
    $q.notify({ type: 'negative', message: 'No se pudieron cargar los turnos' });
  } finally {
    loading.value = false;
  }
}

/** "HH:MM" o "HH:MM:SS" (lo que devuelve la API) → minutos desde medianoche. */
function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function validate(row: TrialShiftsRowClient): string | null {
  if (toMinutes(row.morningStart) >= toMinutes(row.morningEnd)) {
    return 'La mañana debe empezar antes de terminar';
  }
  if (toMinutes(row.afternoonStart) >= toMinutes(row.afternoonEnd)) {
    return 'La tarde debe empezar antes de terminar';
  }
  if (toMinutes(row.morningEnd) > toMinutes(row.afternoonStart)) {
    return 'La mañana debe terminar antes de que empiece la tarde';
  }
  return null;
}

let debounceTimers: Record<number, ReturnType<typeof setTimeout>> = {};

function onFieldChange(
  row: TrialShiftsRowClient,
  field: 'morningStart' | 'morningEnd' | 'afternoonStart' | 'afternoonEnd',
  value: string
): void {
  row[field] = value;
  savedBranchId.value = null;

  const error = validate(row);
  rowErrors.value = { ...rowErrors.value, [row.branchId]: error };
  if (error) return;

  if (debounceTimers[row.branchId]) clearTimeout(debounceTimers[row.branchId]);
  debounceTimers[row.branchId] = setTimeout(() => void saveRow(row), 500);
}

async function saveRow(row: TrialShiftsRowClient): Promise<void> {
  savingBranchId.value = row.branchId;
  try {
    const updated = await reportsApi.updateTrialShifts(row.branchId, {
      morningStart: row.morningStart,
      morningEnd: row.morningEnd,
      afternoonStart: row.afternoonStart,
      afternoonEnd: row.afternoonEnd,
    });
    const idx = rows.value.findIndex((r) => r.branchId === updated.branchId);
    if (idx !== -1) {
      rows.value[idx] = {
        ...updated,
        morningStart: hhmm(updated.morningStart),
        morningEnd: hhmm(updated.morningEnd),
        afternoonStart: hhmm(updated.afternoonStart),
        afternoonEnd: hhmm(updated.afternoonEnd),
      };
    }
    savedBranchId.value = row.branchId;
  } catch (err: unknown) {
    const message =
      reportsApi.error.value ?? (err instanceof Error ? err.message : 'No se pudo guardar el turno');
    log.error('Error guardando turno', { error: message, branchId: row.branchId });
    $q.notify({ type: 'negative', message });
  } finally {
    savingBranchId.value = null;
  }
}
</script>
