<template>
  <q-item dense class="editable-exercise-row">
    <!-- Exercise name + contraction badge -->
    <q-item-section>
      <q-item-label class="text-weight-medium row items-center">
        {{ exercise.exerciseName }}
        <q-chip dense size="sm" :color="contractionColor" text-color="white" class="q-ml-sm">
          {{ contractionLabel }}
        </q-chip>
        <q-badge
          v-if="exercise.dificultadLineal"
          outline
          color="grey"
          class="q-ml-xs"
          :label="`Dif ${exercise.dificultadLineal}`"
        />
        <q-badge
          v-if="exercise.route"
          :color="exercise.route === blockRoute ? 'green' : 'deep-orange'"
          text-color="white"
          class="q-ml-xs"
        >
          {{ exercise.route }}
        </q-badge>
      </q-item-label>

      <!-- Inline editable fields -->
      <q-item-label class="row items-center q-gutter-sm q-mt-xs">
        <!-- I Go You Go: reps/secs OR Pausa toggle -->
        <template v-if="isIGoYouGo">
          <q-input
            v-if="!isIso"
            v-model.number="localReps"
            type="number"
            dense
            outlined
            label="Reps"
            class="editable-field"
            input-class="text-center"
            :disable="isPausaSelected"
            @blur="emitUpdate"
            @keyup.enter="emitUpdate"
          />
          <q-input
            v-else
            v-model.number="localSeconds"
            type="number"
            dense
            outlined
            label="Seg"
            class="editable-field"
            input-class="text-center"
            :disable="isPausaSelected"
            @blur="emitUpdate"
            @keyup.enter="emitUpdate"
          />
          <q-btn
            :color="isPausaSelected ? 'orange' : 'grey-5'"
            :text-color="isPausaSelected ? 'white' : 'grey-8'"
            dense
            no-caps
            label="Pausa"
            :outline="!isPausaSelected"
            @click="togglePausa"
          />
        </template>

        <!-- Death By mode: start + increment -->
        <template v-else-if="isDeathBy">
          <template v-if="!isIso">
            <q-input
              v-model.number="localReps"
              type="number"
              dense
              outlined
              label="Reps"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
            <span class="text-grey-6 text-body2">+</span>
            <q-input
              v-model.number="localIncrement"
              type="number"
              dense
              outlined
              label="Inc"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
          </template>
          <template v-else>
            <q-input
              v-model.number="localSeconds"
              type="number"
              dense
              outlined
              label="Seg"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
            <span class="text-grey-6 text-body2">+</span>
            <q-input
              v-model.number="localIncrement"
              type="number"
              dense
              outlined
              label="Inc"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
          </template>
        </template>

        <!-- AMRAP range mode -->
        <template v-else-if="isAmrap">
          <template v-if="!isIso">
            <q-input
              v-model.number="localReps"
              type="number"
              dense
              outlined
              label="Min"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
            <span class="text-grey-6 text-body2">·</span>
            <q-input
              v-model.number="localRepsMax"
              type="number"
              dense
              outlined
              label="Max"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
          </template>
          <template v-else>
            <q-input
              v-model.number="localSeconds"
              type="number"
              dense
              outlined
              label="Min seg"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
            <span class="text-grey-6 text-body2">·</span>
            <q-input
              v-model.number="localSecondsMax"
              type="number"
              dense
              outlined
              label="Max seg"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
          </template>
        </template>

        <!-- Param-driven formats (Tabata, HIIT): no per-exercise prescription -->
        <template v-else-if="isParamDrivenFormat">
          <span class="text-caption text-grey-6 q-ml-sm">Definido por formato</span>
        </template>

        <template v-else>
          <!-- Reps (CON / EXC) -->
          <q-input
            v-if="!isIso"
            v-model.number="localReps"
            type="number"
            dense
            outlined
            label="Reps"
            class="editable-field"
            input-class="text-center"
            @blur="emitUpdate"
            @keyup.enter="emitUpdate"
          />

          <!-- Seconds (ISO) -->
          <q-input
            v-if="isIso"
            v-model.number="localSeconds"
            type="number"
            dense
            outlined
            label="Seg"
            class="editable-field"
            input-class="text-center"
            @blur="emitUpdate"
            @keyup.enter="emitUpdate"
          />
        </template>

        <!-- Notes -->
        <q-input
          v-model="localNotes"
          dense
          outlined
          label="Notas"
          class="editable-field editable-field--notes"
          :disable="isPausaSelected"
          @blur="emitUpdate"
          @keyup.enter="emitUpdate"
        />
      </q-item-label>
    </q-item-section>

    <!-- Action buttons -->
    <q-item-section side>
      <div class="row items-center q-gutter-xs">
        <!-- Move up/down -->
        <div class="column q-mr-xs">
          <q-btn
            flat
            dense
            round
            size="xs"
            icon="keyboard_arrow_up"
            color="grey-7"
            :disable="isFirst"
            @click="$emit('move', { prescriptionId: exercise.id, direction: 'up' })"
          >
            <q-tooltip>Mover arriba</q-tooltip>
          </q-btn>
          <q-btn
            flat
            dense
            round
            size="xs"
            icon="keyboard_arrow_down"
            color="grey-7"
            :disable="isLast"
            @click="$emit('move', { prescriptionId: exercise.id, direction: 'down' })"
          >
            <q-tooltip>Mover abajo</q-tooltip>
          </q-btn>
        </div>
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
  blockRoute: string;
  blockFormatName: string;
  isFirst: boolean;
  isLast: boolean;
}>();

const emit = defineEmits<{
  (e: 'swap', payload: { exercise: SessionExercise }): void;
  (e: 'remove', payload: { prescriptionId: number }): void;
  (e: 'update', payload: { prescriptionId: number; fields: PrescriptionUpdate }): void;
  (e: 'move', payload: { prescriptionId: number; direction: 'up' | 'down' }): void;
}>();

// Local refs for editable fields
const localReps = ref<number | null>(props.exercise.reps);
const localRepsMax = ref<number | null>(props.exercise.repsMax);
const localSeconds = ref<number | null>(props.exercise.seconds);
const localSecondsMax = ref<number | null>(props.exercise.secondsMax);
const localIncrement = ref<number | null>(props.exercise.increment);
const localRest = ref<number | null>(props.exercise.rest);
const localNotes = ref<string>(props.exercise.notes || '');

// Sync local refs when props change (e.g. after API refresh)
watch(
  () => props.exercise,
  (ex) => {
    localReps.value = ex.reps;
    localRepsMax.value = ex.repsMax;
    localSeconds.value = ex.seconds;
    localSecondsMax.value = ex.secondsMax;
    localIncrement.value = ex.increment;
    localRest.value = ex.rest;
    localNotes.value = ex.notes || '';
  }
);

function togglePausa() {
  if (isPausaSelected.value) {
    // Deactivate PAUSA: restore defaults
    localReps.value = 0;
    localSeconds.value = 30;
    localNotes.value = '';
  } else {
    // Activate PAUSA
    localReps.value = 0;
    localSeconds.value = 0;
    localNotes.value = 'PAUSA';
  }
  emitUpdate();
}

function emitUpdate() {
  const fields: PrescriptionUpdate = {};
  let hasChanges = false;

  if (localReps.value !== props.exercise.reps) {
    fields.reps = localReps.value ?? undefined;
    hasChanges = true;
  }
  if (localRepsMax.value !== props.exercise.repsMax) {
    fields.repsMax = localRepsMax.value;
    hasChanges = true;
  }
  if (localSeconds.value !== props.exercise.seconds) {
    fields.seconds = localSeconds.value ?? undefined;
    hasChanges = true;
  }
  if (localSecondsMax.value !== props.exercise.secondsMax) {
    fields.secondsMax = localSecondsMax.value;
    hasChanges = true;
  }
  if (localIncrement.value !== props.exercise.increment) {
    fields.increment = localIncrement.value;
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

// Whether this exercise uses isometric contraction (show seconds instead of reps)
const isIso = computed(() => {
  const c = props.exercise.contraction?.toLowerCase();
  return c === 'iso' || c === 'isometrico';
});

// Whether this block uses AMRAP format (show range inputs)
const isAmrap = computed(() => {
  const f = props.blockFormatName.toLowerCase().trim().replace(/\s+/g, '_');
  return f === 'amrap' || f === 'amrap_series';
});

// Whether this block uses Death By format (show start + increment inputs)
const isDeathBy = computed(() => {
  const f = props.blockFormatName.toLowerCase().trim();
  return f.startsWith('death by');
});

// "I Go You Go" format detection — all exercises get PAUSA toggle
const isIGoYouGo = computed(() => {
  return props.blockFormatName.toLowerCase().includes('i go');
});

// Formats where per-exercise prescription is defined by format params, not per exercise
const isParamDrivenFormat = computed(() => {
  const f = props.blockFormatName.toLowerCase().trim();
  return f === 'tabata' || f === 'interval training' || f === 'hiit';
});

// Whether PAUSA is currently active
const isPausaSelected = computed(() => {
  return (
    props.exercise.reps === 0 && props.exercise.seconds === 0 && props.exercise.notes === 'PAUSA'
  );
});

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
