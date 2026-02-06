<template>
  <q-item dense class="editable-exercise-row">
    <!-- Exercise name + contraction badge -->
    <q-item-section>
      <q-item-label class="text-weight-medium row items-center">
        {{ exercise.exerciseName }}
        <q-chip
          dense
          size="sm"
          :color="contractionColor"
          text-color="white"
          class="q-ml-sm"
        >
          {{ contractionLabel }}
        </q-chip>
        <q-badge
          v-if="exercise.dificultadLineal"
          outline
          color="grey"
          class="q-ml-xs"
          :label="`Dif ${exercise.dificultadLineal}`"
        />
      </q-item-label>

      <!-- Inline editable fields -->
      <q-item-label class="row items-center q-gutter-sm q-mt-xs">
        <!-- Reps -->
        <q-input
          v-if="exercise.reps !== null || !exercise.seconds"
          v-model.number="localReps"
          type="number"
          dense
          outlined
          label="Reps"
          class="editable-field"
          input-class="text-center"
          @blur="emitUpdate"
        />

        <!-- Seconds -->
        <q-input
          v-if="exercise.seconds !== null"
          v-model.number="localSeconds"
          type="number"
          dense
          outlined
          label="Seg"
          class="editable-field"
          input-class="text-center"
          @blur="emitUpdate"
        />

        <!-- Rest -->
        <q-input
          v-model.number="localRest"
          type="number"
          dense
          outlined
          label="Descanso"
          class="editable-field"
          input-class="text-center"
          suffix="s"
          @blur="emitUpdate"
        />

        <!-- Notes -->
        <q-input
          v-model="localNotes"
          dense
          outlined
          label="Notas"
          class="editable-field editable-field--notes"
          @blur="emitUpdate"
        />
      </q-item-label>
    </q-item-section>

    <!-- Action buttons -->
    <q-item-section side>
      <div class="row q-gutter-xs">
        <q-btn
          flat
          dense
          round
          icon="swap_horiz"
          color="primary"
          @click="$emit('swap', { exercise })"
        >
          <q-tooltip>Intercambiar ejercicio</q-tooltip>
        </q-btn>
        <q-btn
          flat
          dense
          round
          icon="delete"
          color="negative"
          @click="$emit('remove', { prescriptionId: exercise.id })"
        >
          <q-tooltip>Eliminar ejercicio</q-tooltip>
        </q-btn>
      </div>
    </q-item-section>
  </q-item>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { SessionExercise, PrescriptionUpdate } from 'src/types/session';

const props = defineProps<{
  exercise: SessionExercise;
  sessionId: number;
  blockId: number;
}>();

const emit = defineEmits<{
  (e: 'swap', payload: { exercise: SessionExercise }): void;
  (e: 'remove', payload: { prescriptionId: number }): void;
  (e: 'update', payload: { prescriptionId: number; fields: PrescriptionUpdate }): void;
}>();

// Local refs for editable fields
const localReps = ref<number | null>(props.exercise.reps);
const localSeconds = ref<number | null>(props.exercise.seconds);
const localRest = ref<number | null>(props.exercise.rest);
const localNotes = ref<string>(props.exercise.notes || '');

// Sync local refs when props change (e.g. after API refresh)
watch(() => props.exercise, (ex) => {
  localReps.value = ex.reps;
  localSeconds.value = ex.seconds;
  localRest.value = ex.rest;
  localNotes.value = ex.notes || '';
});

function emitUpdate() {
  const fields: PrescriptionUpdate = {};
  let hasChanges = false;

  if (localReps.value !== props.exercise.reps) {
    fields.reps = localReps.value ?? undefined;
    hasChanges = true;
  }
  if (localSeconds.value !== props.exercise.seconds) {
    fields.seconds = localSeconds.value ?? undefined;
    hasChanges = true;
  }
  if (localRest.value !== props.exercise.rest) {
    fields.rest = localRest.value ?? undefined;
    hasChanges = true;
  }
  const currentNotes = props.exercise.notes || '';
  if (localNotes.value !== currentNotes) {
    fields.notes = localNotes.value || undefined;
    hasChanges = true;
  }

  if (hasChanges) {
    emit('update', { prescriptionId: props.exercise.id, fields });
  }
}

// Contraction display helpers
const contractionLabel = computed(() => {
  switch (props.exercise.contraction?.toLowerCase()) {
    case 'con':
    case 'concentrico':
      return 'CON';
    case 'exc':
    case 'excentrico':
      return 'EXC';
    case 'iso':
    case 'isometrico':
      return 'ISO';
    default:
      return props.exercise.contraction || '-';
  }
});

const contractionColor = computed(() => {
  switch (props.exercise.contraction?.toLowerCase()) {
    case 'con':
    case 'concentrico':
      return 'blue-grey';
    case 'exc':
    case 'excentrico':
      return 'teal';
    case 'iso':
    case 'isometrico':
      return 'orange';
    default:
      return 'grey';
  }
});
</script>

<style scoped>
.editable-exercise-row {
  padding-top: 8px;
  padding-bottom: 8px;
}
.editable-field {
  max-width: 80px;
}
.editable-field--notes {
  max-width: 160px;
}
</style>
