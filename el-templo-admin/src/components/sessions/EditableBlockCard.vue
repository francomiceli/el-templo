<template>
  <q-card :class="['q-mb-md', `border-${blockColor}`]" bordered>
    <!-- Colored header -->
    <q-card-section :class="['text-white', `bg-${blockColor}`]">
      <div class="row items-center justify-between">
        <div>
          <div class="text-h6">{{ block.role }}</div>
          <div class="text-caption">{{ block.route }}</div>
        </div>
        <q-badge color="white" :text-color="blockColor" :label="block.format" />
      </div>
    </q-card-section>

    <!-- Block stats -->
    <q-card-section class="q-py-sm bg-grey-2">
      <div class="row q-gutter-md text-caption">
        <div>
          <q-icon name="fitness_center" size="xs" />
          {{ block.exercises.length }} ejercicios
        </div>
        <div v-if="block.repsBudget">
          <q-icon name="replay" size="xs" />
          {{ block.repsBudget }} reps budget
        </div>
        <div v-if="block.intensity">
          <q-icon name="speed" size="xs" />
          {{ block.intensity }}% intensidad
        </div>
        <div v-if="avgDifficulty">
          <q-icon name="trending_up" size="xs" />
          Dif: {{ avgDifficulty.toFixed(1) }}
        </div>
      </div>
    </q-card-section>

    <!-- Editable exercises list -->
    <q-list separator>
      <editable-exercise-row
        v-for="exercise in block.exercises"
        :key="exercise.id"
        :exercise="exercise"
        :session-id="sessionId"
        :block-id="block.id"
        @swap="onSwapExercise"
        @remove="onRemoveExercise"
        @update="onUpdatePrescription"
      />
    </q-list>

    <!-- Footer actions -->
    <q-card-actions align="left" class="q-px-md q-pb-md">
      <q-btn
        flat
        dense
        icon="add"
        color="primary"
        label="Agregar Ejercicio"
        @click="$emit('add-exercise', { blockId: block.id })"
      />
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useQuasar } from 'quasar';
import type { SessionBlock, SessionExercise, PrescriptionUpdate } from 'src/types/session';
import { useEditApi } from 'src/composables/useEditApi';
import EditableExerciseRow from './EditableExerciseRow.vue';

const props = defineProps<{
  block: SessionBlock;
  sessionId: number;
}>();

const emit = defineEmits<{
  (e: 'swap-exercise', payload: { blockId: number; exercise: SessionExercise }): void;
  (e: 'remove-exercise', payload: { blockId: number; prescriptionId: number }): void;
  (e: 'update-prescription', payload: { blockId: number; prescriptionId: number; fields: PrescriptionUpdate }): void;
  (e: 'add-exercise', payload: { blockId: number }): void;
  (e: 'refresh'): void;
}>();

const $q = useQuasar();
const editApi = useEditApi();

const blockColor = computed(() => {
  const role = props.block.role?.toLowerCase() || '';
  if (role.includes('initium')) return 'light-blue';
  if (role.includes('nucleus')) return 'deep-purple';
  if (role.includes('deuteros')) return 'teal';
  if (role.includes('athlos') || role.includes('epikos')) return 'amber';
  return 'grey';
});

const avgDifficulty = computed(() => {
  const difficulties = props.block.exercises
    .map(e => e.dificultadLineal)
    .filter((d): d is number => d !== null && d !== undefined);
  if (difficulties.length === 0) return null;
  return difficulties.reduce((a, b) => a + b, 0) / difficulties.length;
});

function onSwapExercise(payload: { exercise: SessionExercise }) {
  emit('swap-exercise', { blockId: props.block.id, exercise: payload.exercise });
}

async function onRemoveExercise(payload: { prescriptionId: number }) {
  $q.dialog({
    title: 'Eliminar Ejercicio',
    message: 'Se eliminara este ejercicio del bloque. Continuar?',
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Eliminar', color: 'negative' },
  }).onOk(async () => {
    try {
      await editApi.removeExercise(props.sessionId, props.block.id, payload.prescriptionId);
      $q.notify({ type: 'positive', message: 'Ejercicio eliminado' });
      emit('refresh');
    } catch {
      $q.notify({ type: 'negative', message: 'Error al eliminar ejercicio' });
    }
  });
}

async function onUpdatePrescription(payload: { prescriptionId: number; fields: PrescriptionUpdate }) {
  try {
    await editApi.updatePrescription(props.sessionId, props.block.id, payload.prescriptionId, payload.fields);
    $q.notify({ type: 'positive', message: 'Prescripcion actualizada', timeout: 1500 });
    emit('refresh');
  } catch {
    $q.notify({ type: 'negative', message: 'Error al actualizar prescripcion' });
  }
}
</script>

<style scoped>
.border-light-blue {
  border-left: 4px solid var(--q-light-blue) !important;
}
.border-deep-purple {
  border-left: 4px solid var(--q-deep-purple) !important;
}
.border-teal {
  border-left: 4px solid var(--q-teal) !important;
}
.border-amber {
  border-left: 4px solid var(--q-amber) !important;
}
.border-grey {
  border-left: 4px solid var(--q-grey) !important;
}
</style>
