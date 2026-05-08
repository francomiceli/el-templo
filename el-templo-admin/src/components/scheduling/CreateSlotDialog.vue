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
            :options="activeActivityOptions"
            label="Actividad"
            outlined
            emit-value
            map-options
            :loading="loadingActivities"
            :rules="[(v) => v != null || 'Seleccioná una actividad']"
          />

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

const activeActivityOptions = computed(() =>
  activities.value.filter((a) => a.isActive).map((a) => ({ label: a.name, value: a.id }))
);

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
  form.value = {
    branchId: props.defaultBranchId,
    dayOfWeek: null,
    startTime: '',
    endTime: '',
    activityId: null,
  };
  errorMessage.value = null;
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
</script>
