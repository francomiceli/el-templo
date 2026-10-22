<!--
  Bajar un escalón (fase 201, §5.1 paso 6, S12-6): cuando el recorte propuesto es "bajar una
  progresión" (Ternero, Novillo o un Toro con las etapas agotadas) el coach elige qué escalón
  baja. Los ejercicios del día de la alerta (`detail.dayKey`, o el de `detail.exerciseId` en una
  caída) van primero. El escalón por defecto es el E1. Manda `alertId` para que el API cierre la
  alerta en la misma operación y devuelve la ficha completa con `done`.
-->
<template>
  <q-dialog :model-value="modelValue" @update:model-value="onDialogModel">
    <q-card style="width: 420px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Bajar un escalón</div>
        <q-space />
        <q-btn icon="close" flat round dense :disable="submitting" @click="close" />
      </q-card-section>

      <q-card-section class="q-gutter-md">
        <div v-if="alert" class="text-body2">{{ alert.label }}</div>
        <q-select
          v-model="exerciseId"
          :options="exerciseOptions"
          label="Ejercicio *"
          emit-value
          map-options
          dense
          outlined
          options-dense
          :disable="submitting"
          data-test="conquer-cut-exercise"
        />
        <q-select
          v-model="step"
          :options="STEP_OPTIONS"
          label="Escalón *"
          emit-value
          map-options
          dense
          outlined
          options-dense
          :disable="submitting"
          data-test="conquer-cut-step"
        />
        <div class="text-caption text-grey-8">
          El alumno pasa a la progresión inmediatamente más fácil de ese escalón.
        </div>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat no-caps label="Cancelar" :disable="submitting" @click="close" />
        <q-btn
          unelevated
          no-caps
          color="secondary"
          label="Bajar un escalón"
          :loading="submitting"
          :disable="exerciseId === null"
          style="min-height: 44px"
          data-test="conquer-cut-confirm"
          @click="submit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import type { BoardAlert, FichaResponse, StepKey } from 'src/types/conquer';

const props = defineProps<{
  modelValue: boolean;
  ficha: FichaResponse;
  /** La molestia o caída que se está resolviendo. */
  alert: BoardAlert | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /** El API aplicó el recorte y devolvió la ficha completa. */
  done: [ficha: FichaResponse];
}>();

const $q = useQuasar();
const conquerApi = useConquerAdminApi();

const STEP_OPTIONS: { label: string; value: StepKey }[] = [
  { label: 'E1 (el primero)', value: 'e1' },
  { label: 'E2', value: 'e2' },
  { label: 'E3', value: 'e3' },
  { label: 'Hold final', value: 'hold' },
];

const exerciseId = ref<number | null>(null);
const step = ref<StepKey>('e1');
const submitting = ref(false);

interface ExerciseOption {
  label: string;
  value: number;
}

// Día de la alerta (molestia) o ejercicio de la caída: sus ejercicios van primero.
const alertDayKey = computed(() => {
  const dayKey = props.alert?.detail.dayKey;
  return typeof dayKey === 'string' ? dayKey : null;
});
const alertExerciseId = computed(() => {
  const id = props.alert?.detail.exerciseId;
  return typeof id === 'number' ? id : null;
});

const exerciseOptions = computed<ExerciseOption[]>(() => {
  const days = props.ficha.progress.days.filter((d) => d.exercises.length > 0);
  const ordered = [
    ...days.filter((d) => d.dayKey === alertDayKey.value),
    ...days.filter((d) => d.dayKey !== alertDayKey.value),
  ];
  return ordered.flatMap((day) =>
    day.exercises.map((ex) => ({ label: `${day.label} · ${ex.name}`, value: ex.exerciseId }))
  );
});

// Al abrir: el ejercicio de la caída, si no el primero del día de la alerta, si no el primero.
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    step.value = 'e1';
    const options = exerciseOptions.value;
    const fromAlert = options.find((o) => o.value === alertExerciseId.value);
    exerciseId.value = fromAlert?.value ?? options[0]?.value ?? null;
  }
);

function close(): void {
  if (!submitting.value) emit('update:modelValue', false);
}

function onDialogModel(value: boolean): void {
  if (!value) close();
}

async function submit(): Promise<void> {
  if (exerciseId.value === null) return;
  submitting.value = true;
  try {
    const alertId = props.alert?.id ?? null;
    const ficha = await conquerApi.applyCut(props.ficha.member.userId, {
      action: 'bajar_escalon',
      exerciseId: exerciseId.value,
      step: step.value,
      ...(alertId !== null ? { alertId } : {}),
    });
    $q.notify({ type: 'positive', message: 'Escalón bajado' });
    emit('done', ficha);
    emit('update:modelValue', false);
  } catch (err: unknown) {
    $q.notify({
      type: 'negative',
      message: err instanceof Error ? err.message : 'No pudimos aplicar el recorte',
    });
  } finally {
    submitting.value = false;
  }
}
</script>
