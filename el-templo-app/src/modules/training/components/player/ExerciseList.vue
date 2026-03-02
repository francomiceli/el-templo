<template>
  <div class="exercise-list">
    <q-expansion-item
      v-for="(exercise, index) in exercises"
      :key="exercise.exerciseId"
      :model-value="index === selectedIndex"
      :class="[
        'exercise-item',
        { 'exercise-item--selected': index === selectedIndex },
        { 'exercise-item--completed': isExerciseCompleted(exercise.exerciseId) },
      ]"
      header-class="exercise-header"
      expand-icon-class="text-grey-6"
      @update:model-value="(expanded) => handleExpand(index, expanded)"
    >
      <!-- Exercise header (collapsed view) -->
      <template #header>
        <q-item-section side class="q-mr-sm">
          <q-icon
            :name="isExerciseCompleted(exercise.exerciseId) ? 'task_alt' : 'radio_button_unchecked'"
            :color="isExerciseCompleted(exercise.exerciseId) ? 'positive' : 'grey-5'"
            size="24px"
            class="exercise-check-icon cursor-pointer"
            @click.stop="emit('toggle-exercise-complete', { prescriptionId: exercise.exerciseId })"
          />
        </q-item-section>
        <q-item-section>
          <q-item-label
            class="text-body1 text-weight-medium"
            :class="{ 'exercise-name--completed': isExerciseCompleted(exercise.exerciseId) }"
          >
            {{ exercise.exerciseName }}
          </q-item-label>
          <q-item-label caption class="text-caption text-grey-7">
            {{ formatQuickInfo(exercise) }}
          </q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-badge
            :color="getContractionColor(exercise.contraction)"
            :label="exercise.contraction"
            class="text-weight-medium"
          />
        </q-item-section>
      </template>

      <!-- Exercise detail (expanded view) -->
      <q-card flat class="exercise-detail" :style="accentBorderStyle">
        <q-card-section class="q-pa-md">
          <div class="row q-col-gutter-sm">
            <!-- Prescription info -->
            <div class="col-6">
              <div class="detail-label text-caption text-grey-7">Cantidad</div>
              <div class="detail-value text-body1 text-weight-medium">
                {{ formatDose(exercise) }}
              </div>
            </div>

            <!-- Contraction type -->
            <div class="col-6">
              <div class="detail-label text-caption text-grey-7">Contraccion</div>
              <div class="detail-value text-body1 text-weight-medium">
                {{ formatContraction(exercise.contraction) }}
              </div>
            </div>

            <!-- Sort order (position in block) -->
            <div class="col-6">
              <div class="detail-label text-caption text-grey-7">Posicion</div>
              <div class="detail-value text-body1 text-weight-medium">
                {{ index + 1 }} de {{ exercises.length }}
              </div>
            </div>
          </div>

          <!-- Notes if present -->
          <div v-if="exercise.notes" class="q-mt-md">
            <div class="detail-label text-caption text-grey-7">Notas</div>
            <div class="detail-value text-body2 text-grey-8">
              {{ exercise.notes }}
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-expansion-item>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Prescription } from '../../types/session'
import { getBlockCSSColor } from '../../utils/blockColors'
import type { BlockRole } from '../../types/session'

interface Props {
  /** Array of exercises to display */
  exercises: Prescription[]
  /** Block role for accent color */
  blockRole: BlockRole
  /** Currently selected exercise index */
  selectedIndex: number
  /** Array of completed exercise (prescription) IDs */
  completedExercises?: number[]
}

interface Emits {
  (e: 'update:selectedIndex', index: number): void
  (e: 'toggle-exercise-complete', payload: { prescriptionId: number }): void
}

const props = withDefaults(defineProps<Props>(), {
  completedExercises: () => [],
})
const emit = defineEmits<Emits>()

/**
 * Check if a specific exercise is completed
 */
function isExerciseCompleted(exerciseId: number): boolean {
  return props.completedExercises.includes(exerciseId)
}

/**
 * Handle expansion item toggle - implements accordion behavior
 * Only one exercise can be expanded at a time
 */
function handleExpand(index: number, expanded: boolean): void {
  if (expanded) {
    // When expanding an item, emit its index
    emit('update:selectedIndex', index)
  }
  // When collapsing, we don't change selection (keep video playing)
  // The user must expand another exercise to change selection
}

/**
 * Dynamic border style using accent color
 */
const accentBorderStyle = computed(() => ({
  borderLeft: `3px solid ${getBlockCSSColor(props.blockRole)}`,
}))

/**
 * Format quick info for collapsed header
 */
function formatDeathBySeq(start: number, inc: number): string {
  return `${start} - ${start + inc} - ${start + inc * 2} - ...`
}

function formatQuickInfo(exercise: Prescription): string {
  if (exercise.notes === 'PAUSA') return 'PAUSA'
  if (exercise.reps !== null) {
    if (exercise.increment) return `${formatDeathBySeq(exercise.reps, exercise.increment)} reps`
    const repsText = exercise.repsMax
      ? `${exercise.reps} · ${exercise.repsMax}`
      : `${exercise.reps}`
    return `${repsText} reps`
  } else if (exercise.seconds !== null) {
    if (exercise.increment) return `${formatDeathBySeq(exercise.seconds, exercise.increment)}s`
    const secsText = exercise.secondsMax
      ? `${exercise.seconds} · ${exercise.secondsMax}`
      : `${exercise.seconds}`
    return `${secsText}s`
  }
  return '-'
}

/**
 * Format dose (reps or duration)
 */
function formatDose(exercise: Prescription): string {
  if (exercise.notes === 'PAUSA') return 'PAUSA'
  if (exercise.reps !== null) {
    if (exercise.increment) return formatDeathBySeq(exercise.reps, exercise.increment)
    const repsText = exercise.repsMax
      ? `${exercise.reps} · ${exercise.repsMax}`
      : `${exercise.reps}`
    return `${repsText} repeticiones`
  } else if (exercise.seconds !== null) {
    if (exercise.increment) return formatDeathBySeq(exercise.seconds, exercise.increment)
    const secsText = exercise.secondsMax
      ? `${exercise.seconds} · ${exercise.secondsMax}`
      : `${exercise.seconds}`
    return `${secsText} segundos`
  }
  return '-'
}

/**
 * Format contraction type for display
 */
function formatContraction(contraction: string): string {
  const contractionNames: Record<string, string> = {
    CON: 'Concentrica',
    EXC: 'Excentrica',
    ISO: 'Isometrica',
  }
  return contractionNames[contraction] || contraction
}

/**
 * Get badge color based on contraction type - uses brand colors
 */
function getContractionColor(contraction: string): string {
  // Use brand colors with different opacity effects via Quasar color modifiers
  const colorMap: Record<string, string> = {
    CON: 'primary', // Navy - concentric
    EXC: 'secondary', // Bronze - eccentric
    ISO: 'primary', // Navy - isometric
  }
  return colorMap[contraction] || 'primary'
}
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.exercise-list {
  display: flex;
  flex-direction: column;
}

.exercise-item {
  background: $cream;
  border-bottom: 1px solid rgba($secondary, 0.15);
  transition: background-color 0.2s ease;

  &:last-child {
    border-bottom: none;
  }

  &--selected {
    background: rgba($secondary, 0.08);
  }
}

.exercise-header {
  padding: 12px 16px;
}

.exercise-detail {
  margin: 0 8px 8px 8px;
  background: rgba($secondary, 0.05);
  border-radius: 0 8px 8px 0;
}

.detail-label {
  margin-bottom: 2px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-size: 0.7rem;
}

.detail-value {
  line-height: 1.4;
}

.exercise-name--completed {
  color: $positive;
}

.exercise-item--completed {
  background: rgba($positive, 0.06);
}

.exercise-item--completed .exercise-check-icon {
  transform: scale(1.15);
}

.exercise-check-icon {
  transition:
    color 0.3s ease,
    transform 0.3s ease;
  -webkit-tap-highlight-color: transparent;
}
</style>
