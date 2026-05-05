<template>
  <q-dialog v-model="show" persistent>
    <q-card style="min-width: 420px; max-width: 90vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Asignar programa adicional</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup :disable="submitting" />
      </q-card-section>

      <q-card-section>
        <q-form ref="formRef" class="q-gutter-md" @submit.prevent="onSubmit">
          <q-select
            v-model="selectedProgramId"
            :options="availablePrograms"
            option-value="id"
            option-label="name"
            emit-value
            map-options
            label="Programa"
            outlined
            :loading="programsLoading"
            :rules="[(v) => v !== null || 'Selecciona un programa']"
            :hint="
              availablePrograms.length === 0 && !programsLoading
                ? 'No hay programas disponibles para asignar.'
                : undefined
            "
          />

          <q-input
            v-model.number="pricePaid"
            type="number"
            min="0"
            step="1"
            label="Precio pagado (0 = regalo)"
            outlined
            hint="Si > 0, se registra una transaccion financiera tipo plan_charge."
            :rules="[(v) => (v !== null && v >= 0) || 'Precio invalido']"
          />

          <q-input
            v-model="notes"
            type="textarea"
            label="Notas (opcional)"
            outlined
            autogrow
            maxlength="500"
            counter
          />

          <div class="row q-gutter-sm justify-end q-mt-sm">
            <q-btn flat label="Cancelar" v-close-popup :disable="submitting" />
            <q-btn
              color="primary"
              label="Asignar"
              type="submit"
              :loading="submitting"
              :disable="!canSubmit"
            />
          </div>
        </q-form>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import type { AxiosError } from 'axios';
import { createLogger } from 'src/utils/logger';
import { useProgramsApi } from 'src/composables/useProgramsApi';
import type { ProgramOption } from 'src/types/program';

const log = createLogger('AssignProgramAddonDialog');
const $q = useQuasar();
const { listActivePrograms, assignAddon } = useProgramsApi();

const props = defineProps<{
  modelValue: boolean;
  userId: number;
  existingProgramIds: number[];
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  success: [];
}>();

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const allPrograms = ref<ProgramOption[]>([]);
const programsLoading = ref(false);
const selectedProgramId = ref<number | null>(null);
const pricePaid = ref<number>(0);
const notes = ref<string>('');
const submitting = ref(false);

const availablePrograms = computed(() =>
  allPrograms.value.filter((p) => !props.existingProgramIds.includes(p.id))
);

const canSubmit = computed(
  () => selectedProgramId.value !== null && pricePaid.value !== null && pricePaid.value >= 0
);

async function loadPrograms() {
  programsLoading.value = true;
  try {
    allPrograms.value = await listActivePrograms();
  } catch (err: unknown) {
    log.error('Failed to load active programs', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'No se pudieron cargar los programas.' });
  } finally {
    programsLoading.value = false;
  }
}

function reset() {
  selectedProgramId.value = null;
  pricePaid.value = 0;
  notes.value = '';
}

function mapBackendError(code: string | undefined, status: number | undefined): string {
  // Phase 112 D-22: explicit Spanish copy mapping per backend error code.
  if (code === 'ASSIGN_PLAN_FIRST') {
    return 'Asigna un plan al miembro antes de agregar un programa adicional.';
  }
  if (code === 'PROGRAM_ALREADY_ACTIVE') {
    return 'El miembro ya esta inscripto en este programa. Cancela la inscripcion existente primero.';
  }
  if (status === 403) return 'No tienes permisos para asignar programas.';
  if (status === 404) return 'Programa no encontrado o inactivo.';
  return 'Error inesperado, intenta nuevamente.';
}

async function onSubmit() {
  if (!canSubmit.value || selectedProgramId.value === null) return;
  submitting.value = true;
  try {
    await assignAddon(props.userId, {
      programId: selectedProgramId.value,
      pricePaid: pricePaid.value,
      notes: notes.value.length > 0 ? notes.value : null,
    });
    $q.notify({ type: 'positive', message: 'Programa asignado.' });
    reset();
    emit('success');
  } catch (err: unknown) {
    const axiosErr = err as AxiosError<{ code?: string; error?: string; message?: string }>;
    const status = axiosErr.response?.status;
    const code = axiosErr.response?.data?.code;
    const message = mapBackendError(code, status);
    log.warn('Assign addon failed', {
      userId: props.userId,
      programId: selectedProgramId.value,
      status,
      code,
    });
    $q.notify({ type: 'negative', message });
  } finally {
    submitting.value = false;
  }
}

watch(show, (v) => {
  if (v) {
    reset();
    void loadPrograms();
  }
});
</script>
