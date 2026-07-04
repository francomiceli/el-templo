<template>
  <q-dialog :model-value="show" @update:model-value="onShowUpdate">
    <q-card style="min-width: 480px; max-width: 560px">
      <q-card-section>
        <div class="text-h6">Crear horario</div>
        <div class="text-caption text-grey-7">
          Para cambiar el horario de un slot existente, desactivalo y crea uno nuevo.
        </div>
      </q-card-section>

      <q-separator />

      <q-card-section>
        <q-form @submit.prevent="onSubmit" class="q-gutter-md">
          <q-select
            v-model="form.branchId"
            :options="branchOptions"
            label="Sucursal"
            outlined
            emit-value
            map-options
            :rules="[(v) => v != null || 'Seleccioná una sucursal']"
          />

          <q-select
            v-model="form.dayOfWeek"
            :options="dayOptions"
            label="Día"
            outlined
            emit-value
            map-options
            :rules="[(v) => v != null || 'Seleccioná un día']"
          />

          <div class="row q-gutter-sm">
            <q-input
              v-model="form.startTime"
              label="Inicio (HH:MM)"
              outlined
              mask="##:##"
              class="col"
              :rules="[validateTime, validateRange]"
            />
            <q-input
              v-model="form.endTime"
              label="Fin (HH:MM)"
              outlined
              mask="##:##"
              class="col"
              :rules="[validateTime, validateRange]"
            />
          </div>

          <q-select
            v-model="form.activityId"
            :options="activityOptions"
            label="Actividad"
            outlined
            emit-value
            map-options
            :loading="loadingActivities"
            :rules="[(v) => v != null || 'Seleccioná una actividad']"
          />

          <!--
            Actividad inline (D-04): crea una actividad al vuelo reusando
            createActivity y deja el slot con esa actividad seleccionada, sin
            salir del flujo de crear horario.
          -->
          <q-card v-if="showNewActivity" flat bordered class="q-pa-sm bg-grey-1">
            <div class="text-subtitle2 q-mb-sm">Nueva actividad</div>
            <div class="q-gutter-sm">
              <q-input v-model="newActivity.name" label="Nombre" dense outlined autofocus />
              <q-input
                v-model="newActivity.description"
                label="Descripción (opcional)"
                dense
                outlined
              />
              <q-input
                v-model="newActivity.maxCapacity"
                label="Cupo"
                type="number"
                dense
                outlined
                min="1"
                hint="vacío = hereda el cupo de la sucursal"
                :rules="[validateCapacity]"
              />
              <div v-if="activityErrorMessage" class="text-negative text-caption">
                {{ activityErrorMessage }}
              </div>
              <div class="row justify-end q-gutter-sm">
                <q-btn flat dense label="Cancelar" @click="cancelNewActivity" />
                <q-btn
                  color="primary"
                  dense
                  label="Crear actividad"
                  :loading="creatingActivity"
                  :disable="!newActivity.name.trim()"
                  @click="onCreateActivity"
                />
              </div>
            </div>
          </q-card>

          <div v-if="errorMessage" class="text-negative text-caption q-mt-sm">
            {{ errorMessage }}
          </div>

          <div class="row justify-end q-gutter-sm">
            <q-btn flat label="Cancelar" @click="onCancel" />
            <q-btn type="submit" color="primary" label="Crear" :loading="submitting" />
          </div>
        </q-form>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { useSchedulingApi } from 'src/composables/useSchedulingApi';
import type { ActivityRecord, DayOfWeek } from 'src/types/scheduling';
import type { BranchOption } from 'src/types/member';

const log = createLogger('CreateSlotDialog');
const $q = useQuasar();
const schedulingApi = useSchedulingApi();

// ─── Props & Emits ──────────────────────────────────────────────────────────

const props = defineProps<{
  show: boolean;
  branches: BranchOption[];
  defaultBranchId: number | null;
  /**
   * D-03 prefill: cuando la grilla abre el dialog clickeando una celda vacía,
   * precarga sucursal/día/hora. Los campos quedan EDITABLES (prefill, no lock).
   * Consumido por 155-04 (click-para-crear desde HorariosPage).
   */
  initial?: {
    branchId?: number | null;
    dayOfWeek?: DayOfWeek;
    startTime?: string;
    endTime?: string;
  };
}>();

const emit = defineEmits<{
  'update:show': [value: boolean];
  created: [];
}>();

// ─── State ──────────────────────────────────────────────────────────────────

interface SlotForm {
  branchId: number | null;
  dayOfWeek: DayOfWeek | null;
  startTime: string;
  endTime: string;
  activityId: number | null;
}

const form = ref<SlotForm>({
  branchId: null,
  dayOfWeek: null,
  startTime: '',
  endTime: '',
  activityId: null,
});
const submitting = ref(false);
const errorMessage = ref<string | null>(null);
const activities = ref<ActivityRecord[]>([]);
const loadingActivities = ref(false);

// ─── Inline activity creation (D-04) ─────────────────────────────────────────
// Sentinel value for the "crear nueva actividad" option in the activity select.
const CREATE_NEW_ACTIVITY = -1;
const showNewActivity = ref(false);
const creatingActivity = ref(false);
const activityErrorMessage = ref<string | null>(null);
// maxCapacity is bound to a number-type q-input, so it may arrive as a string,
// number, or empty string; normalized to `number | null` on submit.
const newActivity = ref<{ name: string; description: string; maxCapacity: number | string | null }>(
  { name: '', description: '', maxCapacity: null }
);

// ─── Computed ───────────────────────────────────────────────────────────────

const branchOptions = computed(() => props.branches.map((b) => ({ label: b.name, value: b.id })));

const dayOptions: Array<{ label: string; value: DayOfWeek }> = [
  { label: 'Lunes', value: 1 },
  { label: 'Martes', value: 2 },
  { label: 'Miércoles', value: 3 },
  { label: 'Jueves', value: 4 },
  { label: 'Viernes', value: 5 },
  { label: 'Sábado', value: 6 },
];

const activityOptions = computed(() => [
  ...activities.value.filter((a) => a.isActive).map((a) => ({ label: a.name, value: a.id })),
  { label: '＋ Crear nueva actividad', value: CREATE_NEW_ACTIVITY },
]);

// ─── Validators ─────────────────────────────────────────────────────────────

function validateTime(v: string): true | string {
  return /^\d{2}:\d{2}$/.test(v) || 'Formato HH:MM';
}

function validateRange(): true | string {
  if (!form.value.startTime || !form.value.endTime) return true;
  if (!/^\d{2}:\d{2}$/.test(form.value.startTime)) return true;
  if (!/^\d{2}:\d{2}$/.test(form.value.endTime)) return true;
  return form.value.endTime > form.value.startTime || 'La hora de fin debe ser posterior al inicio';
}

/**
 * Cupo (D-08): vacío (hereda sucursal) o entero positivo. La validación
 * autoritativa vive en el JSON schema del API (155-02, 1-500).
 */
function validateCapacity(v: number | string | null): true | string {
  if (v === null || v === undefined || v === '') return true;
  const n = Number(v);
  return (Number.isInteger(n) && n > 0) || 'El cupo debe ser un entero positivo';
}

function normalizeCapacity(v: number | string | null): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ─── Data Loading ───────────────────────────────────────────────────────────

async function loadActivities() {
  loadingActivities.value = true;
  try {
    activities.value = await schedulingApi.listActivities();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading activities for slot creation', { error: message });
  } finally {
    loadingActivities.value = false;
  }
}

// ─── Form Lifecycle ─────────────────────────────────────────────────────────

function resetForm() {
  // D-03: si viene `initial` (prefill desde la grilla), precarga esos campos;
  // fallback al comportamiento actual (branchId = defaultBranchId). Los campos
  // quedan editables.
  const initial = props.initial;
  form.value = {
    branchId: initial?.branchId ?? props.defaultBranchId,
    dayOfWeek: initial?.dayOfWeek ?? null,
    startTime: initial?.startTime ?? '',
    endTime: initial?.endTime ?? '',
    activityId: null,
  };
  errorMessage.value = null;
  cancelNewActivity();
}

// ─── Inline activity creation (D-04) ─────────────────────────────────────────

function cancelNewActivity() {
  showNewActivity.value = false;
  activityErrorMessage.value = null;
  newActivity.value = { name: '', description: '', maxCapacity: null };
}

async function onCreateActivity() {
  if (!newActivity.value.name.trim()) return;
  if (validateCapacity(newActivity.value.maxCapacity) !== true) return;
  creatingActivity.value = true;
  activityErrorMessage.value = null;
  try {
    const created = await schedulingApi.createActivity({
      name: newActivity.value.name,
      description: newActivity.value.description || undefined,
      maxCapacity: normalizeCapacity(newActivity.value.maxCapacity),
    });
    await loadActivities();
    form.value.activityId = created.id;
    $q.notify({ type: 'positive', message: 'Actividad creada' });
    cancelNewActivity();
  } catch (err: unknown) {
    // 409 de nombre duplicado (u otro 4xx) inline en el mini-form para no
    // perder el contexto del alta del horario (patrón de onSubmit).
    activityErrorMessage.value = extractError(err, 'Error creando actividad');
    log.error('Inline activity creation failed', { error: activityErrorMessage.value });
  } finally {
    creatingActivity.value = false;
  }
}

function onShowUpdate(value: boolean) {
  emit('update:show', value);
}

function onCancel() {
  emit('update:show', false);
}

async function onSubmit() {
  if (form.value.branchId == null || form.value.dayOfWeek == null || form.value.activityId == null)
    return;
  submitting.value = true;
  errorMessage.value = null;
  try {
    await schedulingApi.createSchedule({
      branchId: form.value.branchId,
      activityId: form.value.activityId,
      dayOfWeek: form.value.dayOfWeek,
      startTime: form.value.startTime,
      endTime: form.value.endTime,
    });
    $q.notify({ type: 'positive', message: 'Horario creado' });
    emit('created');
    emit('update:show', false);
  } catch (err: unknown) {
    // Backend (Plan 113-01) devuelve 409 con message accionable:
    // "Ya existe un horario activo HH:MM-HH:MM que se solapa..."
    // o 400 "La hora de fin debe ser posterior al inicio".
    // Mostrar inline en el form (no toast genérico) para que el admin pueda
    // corregir sin perder contexto.
    errorMessage.value = extractError(err, 'Error creando horario');
    log.error('Create slot failed', { error: errorMessage.value });
  } finally {
    submitting.value = false;
  }
}

// ─── Watchers ───────────────────────────────────────────────────────────────

watch(
  () => props.show,
  (val) => {
    if (val) {
      resetForm();
      void loadActivities();
    }
  }
);

// Selecting the "＋ Crear nueva actividad" sentinel opens the inline mini-form
// and clears the select so it doesn't hold the sentinel value.
watch(
  () => form.value.activityId,
  (val) => {
    if (val === CREATE_NEW_ACTIVITY) {
      form.value.activityId = null;
      showNewActivity.value = true;
      activityErrorMessage.value = null;
    }
  }
);
</script>
