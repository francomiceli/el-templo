<template>
  <q-item dense class="editable-exercise-row">
    <!-- Exercise name + contraction badge -->
    <q-item-section>
      <q-item-label class="text-weight-medium row items-center">
        {{ exercise.exerciseName }}
        <span class="q-ml-sm cursor-pointer">
          <q-chip
            dense
            size="sm"
            :color="contractionColor"
            text-color="white"
            clickable
            :label="contractionLabel"
          />
          <q-menu auto-close>
            <q-list dense style="min-width: 140px">
              <q-item
                v-for="opt in contractionOptions"
                :key="opt.value"
                clickable
                :active="normalizeContraction(exercise.contraction) === opt.value"
                @click="changeContraction(opt.value)"
              >
                <q-item-section avatar>
                  <q-badge
                    :color="getContractionColor(opt.value)"
                    text-color="white"
                    :label="opt.value"
                  />
                </q-item-section>
                <q-item-section>{{ opt.label }}</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </span>
        <q-btn
          dense
          no-caps
          size="sm"
          label="W"
          :color="exercise.weighted ? 'amber-8' : 'grey-4'"
          :text-color="exercise.weighted ? 'white' : 'grey-7'"
          :outline="!exercise.weighted"
          class="q-ml-xs"
          style="min-width: 28px; padding: 0 4px"
          @click="toggleWeighted"
        >
          <q-tooltip>{{ exercise.weighted ? 'Con peso externo' : 'Sin peso externo' }}</q-tooltip>
        </q-btn>
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

        <!-- Pyramid: per-exercise start + step + peak + preview -->
        <template v-else-if="isPyramid">
          <!-- ISO: use seconds fields -->
          <template v-if="isIso">
            <q-input
              v-model.number="localSecondsMax"
              type="number"
              dense
              outlined
              label="Inicio (seg)"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
            <q-input
              v-model.number="localIncrement"
              type="number"
              dense
              outlined
              label="Paso (seg)"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
            <q-input
              v-model.number="localSeconds"
              type="number"
              dense
              outlined
              label="Pico (seg)"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
          </template>
          <!-- CON/EXC: use reps fields -->
          <template v-else>
            <q-input
              v-model.number="localRepsMax"
              type="number"
              dense
              outlined
              label="Inicio"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
            <q-input
              v-model.number="localIncrement"
              type="number"
              dense
              outlined
              label="Paso"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
            <q-input
              v-model.number="localReps"
              type="number"
              dense
              outlined
              label="Pico"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
          </template>
          <span class="text-caption text-grey-6">{{ pyramidExercisePreview }}</span>
        </template>

        <!-- Ladder: per-exercise start + step + rounds + preview -->
        <template v-else-if="isLadder">
          <template v-if="isIso">
            <q-input
              v-model.number="localSecondsMax"
              type="number"
              dense
              outlined
              label="Inicio (seg)"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
            <q-input
              v-model.number="localIncrement"
              type="number"
              dense
              outlined
              label="Paso (seg)"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
            <q-input
              v-model.number="localSeconds"
              type="number"
              dense
              outlined
              label="Rondas"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
          </template>
          <template v-else>
            <q-input
              v-model.number="localRepsMax"
              type="number"
              dense
              outlined
              label="Inicio"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
            <q-input
              v-model.number="localIncrement"
              type="number"
              dense
              outlined
              label="Paso"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
            <q-input
              v-model.number="localReps"
              type="number"
              dense
              outlined
              label="Rondas"
              class="editable-field"
              input-class="text-center"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
          </template>
          <span class="text-caption text-grey-6">{{ ladderExercisePreview }}</span>
        </template>

        <!-- Param-driven formats (Tabata, HIIT): no per-exercise prescription -->
        <template v-else-if="isParamDrivenFormat">
          <q-badge outline color="grey" class="text-caption"
            >Cantidad dictada por el formato</q-badge
          >
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
          color="positive"
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
import { ref, watch, computed, onMounted } from 'vue';
import type { SessionExercise, PrescriptionUpdate } from 'src/types/session';
import {
  normalizeContraction,
  contractionColor as getContractionColor,
} from 'src/utils/contraction-helpers';
import {
  FORMAT_DICTATED_TYPES,
  normalizeFormatName,
  isFormatDictatedByName,
  isLadderFormat,
} from 'src/constants/formats';

const props = defineProps<{
  exercise: SessionExercise;
  sessionId: number;
  blockId: number;
  blockRoute: string;
  blockFormatName: string;
  /** Discriminated format type from formatParams (e.g. 'amrap', 'death_by', 'i_go_you_go') */
  formatType?: string;
  isFirst: boolean;
  isLast: boolean;
}>();

const emit = defineEmits<{
  (e: 'swap', payload: { exercise: SessionExercise }): void;
  (e: 'remove', payload: { prescriptionId: number }): void;
  (e: 'update', payload: { prescriptionId: number; fields: PrescriptionUpdate }): void;
  (e: 'move', payload: { prescriptionId: number; direction: 'up' | 'down' }): void;
}>();

// Contraction type options for the dropdown
const contractionOptions = [
  { value: 'CON' as const, label: 'Concéntrico' },
  { value: 'EXC' as const, label: 'Excéntrico' },
  { value: 'ISO' as const, label: 'Isométrico' },
];

// Guard: suppress blur-triggered emitUpdate during contraction changes
// (DOM teardown of reps/seconds fields fires @blur with stale data)
let contractionChanging = false;

// Local refs for editable fields
const localReps = ref<number | null>(props.exercise.reps);
const localRepsMax = ref<number | null>(props.exercise.repsMax);
const localSeconds = ref<number | null>(props.exercise.seconds);
const localSecondsMax = ref<number | null>(props.exercise.secondsMax);
const localIncrement = ref<number | null>(props.exercise.increment);
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

function toggleWeighted() {
  emit('update', {
    prescriptionId: props.exercise.id,
    fields: { weighted: !props.exercise.weighted },
  });
}

function changeContraction(newContraction: 'CON' | 'EXC' | 'ISO') {
  const current = normalizeContraction(props.exercise.contraction);
  if (current === newContraction) return;

  // Guard: suppress stale blur events from DOM teardown
  contractionChanging = true;
  setTimeout(() => {
    contractionChanging = false;
  }, 50);

  const fields: PrescriptionUpdate = { contraction: newContraction };

  // Switching to ISO: clear reps, set default seconds
  if (newContraction === 'ISO') {
    fields.reps = 0;
    fields.seconds = 30;
    fields.repsMax = null;
    localReps.value = 0;
    localSeconds.value = 30;
    localRepsMax.value = null;
  }
  // Switching from ISO to CON/EXC: clear seconds, set default reps
  else if (current === 'ISO') {
    fields.seconds = 0;
    fields.reps = 10;
    fields.secondsMax = null;
    localSeconds.value = 0;
    localReps.value = 10;
    localSecondsMax.value = null;
  }

  emit('update', { prescriptionId: props.exercise.id, fields });
}

/** Coerce v-model.number quirks: empty string / NaN → null */
function toIntOrNull(v: number | string | null | undefined): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function emitUpdate() {
  // Skip blur-triggered updates during contraction type change
  if (contractionChanging) return;

  // Sanitize all numeric locals — v-model.number can produce "" on empty input
  const reps = toIntOrNull(localReps.value);
  const repsMax = toIntOrNull(localRepsMax.value);
  const seconds = toIntOrNull(localSeconds.value);
  const secondsMax = toIntOrNull(localSecondsMax.value);
  const increment = toIntOrNull(localIncrement.value);

  // Revert required fields to their previous value when cleared.
  // An exercise must always have reps (CON/EXC) or seconds (ISO),
  // except PAUSA which is handled by togglePausa() directly.
  if (isIso.value) {
    if (seconds === null) {
      localSeconds.value = props.exercise.seconds;
      return;
    }
  } else {
    if (reps === null) {
      localReps.value = props.exercise.reps;
      return;
    }
  }

  // Write sanitized values back so the input reflects what we'll send
  localReps.value = reps;
  localRepsMax.value = repsMax;
  localSeconds.value = seconds;
  localSecondsMax.value = secondsMax;
  localIncrement.value = increment;

  const fields: PrescriptionUpdate = {};
  let hasChanges = false;

  if (reps !== props.exercise.reps) {
    fields.reps = reps ?? undefined;
    hasChanges = true;
  }
  if (repsMax !== props.exercise.repsMax) {
    fields.repsMax = repsMax;
    hasChanges = true;
  }
  if (seconds !== props.exercise.seconds) {
    fields.seconds = seconds ?? undefined;
    hasChanges = true;
  }
  if (secondsMax !== props.exercise.secondsMax) {
    fields.secondsMax = secondsMax;
    hasChanges = true;
  }
  if (increment !== props.exercise.increment) {
    fields.increment = increment;
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

// Format detection: prefer discriminated formatType prop, fall back to name matching
const isAmrap = computed(() => {
  if (props.formatType && props.formatType !== 'standard') {
    return props.formatType === 'amrap' || props.formatType === 'amrap_series';
  }
  const f = normalizeFormatName(props.blockFormatName);
  return f === 'amrap' || f === 'amrap_series';
});

const isPyramid = computed(() => {
  if (props.formatType && props.formatType !== 'standard') {
    return props.formatType === 'pyramid';
  }
  return normalizeFormatName(props.blockFormatName) === 'pyramid';
});

const pyramidExercisePreview = computed(() => {
  const start = Number(isIso.value ? localSecondsMax.value : localRepsMax.value) || 2;
  const step = Number(localIncrement.value) || 2;
  const peak = Number(isIso.value ? localSeconds.value : localReps.value) || 10;
  if (step <= 0 || peak <= 0 || start <= 0 || start > peak) return '';
  const up: number[] = [];
  for (let i = start; i <= peak; i += step) up.push(i);
  const down = up.slice(0, -1).reverse();
  const all = [...up, ...down];
  const suffix = isIso.value ? 's' : '';
  if (all.length <= 7) return all.join('-') + suffix;
  const first = all.slice(0, 3).join('-');
  const last = all.slice(-3).join('-');
  return `${first}...${peak}...${last}${suffix}`;
});

const isLadder = computed(() => isLadderFormat(props.formatType, props.blockFormatName));

const ladderExercisePreview = computed(() => {
  if (!isLadder.value) return '';
  const start = Number(isIso.value ? localSecondsMax.value : localRepsMax.value) || 1;
  const step = Number(localIncrement.value) || 1;
  const rounds = Number(isIso.value ? localSeconds.value : localReps.value) || 5;
  if (step <= 0 || rounds <= 0 || start <= 0) return '';
  const values: number[] = [];
  for (let i = 0; i < rounds; i++) values.push(start + i * step);
  const suffix = isIso.value ? 's' : '';
  if (values.length <= 7) return values.join('-') + suffix;
  const first = values.slice(0, 3).join('-');
  const last = values.slice(-2).join('-');
  return `${first}...${last}${suffix}`;
});

const isIGoYouGo = computed(() => {
  if (props.formatType && props.formatType !== 'standard') {
    return props.formatType === 'i_go_you_go';
  }
  return props.blockFormatName.toLowerCase().includes('i go');
});

// FORMAT_DICTATED_TYPES imported from src/constants/formats

const isParamDrivenFormat = computed(() => {
  // Check discriminated type first, but skip stale 'standard' — fall through to name match
  if (props.formatType && props.formatType !== 'standard') {
    return FORMAT_DICTATED_TYPES.has(props.formatType);
  }
  return isFormatDictatedByName(props.blockFormatName);
});

// Whether PAUSA is currently active
const isPausaSelected = computed(() => {
  return (
    props.exercise.reps === 0 && props.exercise.seconds === 0 && props.exercise.notes === 'PAUSA'
  );
});

// Contraction display helpers
const contractionLabel = computed(() => normalizeContraction(props.exercise.contraction) || '-');
const contractionColor = computed(() => getContractionColor(props.exercise.contraction));

// Set local display defaults for pyramid/ladder fields (display only, no API call)
onMounted(() => {
  if (isPyramid.value) {
    if (!localIncrement.value) localIncrement.value = 2;
    if (isIso.value) {
      if (!localSecondsMax.value) localSecondsMax.value = 2;
    } else {
      if (!localRepsMax.value) localRepsMax.value = 2;
    }
  }

  if (isLadder.value) {
    if (!localIncrement.value) localIncrement.value = 1;
    if (isIso.value) {
      if (!localSecondsMax.value) localSecondsMax.value = 5;
      if (!localSeconds.value) localSeconds.value = 5;
    } else {
      if (!localRepsMax.value) localRepsMax.value = 1;
      if (!localReps.value) localReps.value = 5;
    }
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
