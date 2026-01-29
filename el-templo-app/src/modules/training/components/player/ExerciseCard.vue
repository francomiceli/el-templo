<template>
  <q-card
    :class="[
      'exercise-card',
      { 'exercise-card--active': isActive }
    ]"
    :style="isActive ? { borderLeftColor: `var(--q-${accentColor})` } : {}"
    flat
    bordered
  >
    <q-card-section class="exercise-card__content">
      <!-- Header: exercise name + contraction badge -->
      <div class="exercise-card__header">
        <div class="text-h6 exercise-card__name">
          {{ exercise.exerciseName }}
        </div>
        <q-badge
          :color="accentColor"
          text-color="white"
          class="exercise-card__badge"
        >
          {{ exercise.contraction }}
        </q-badge>
      </div>

      <!-- Main metrics: reps OR seconds + rest -->
      <div class="exercise-card__metrics">
        <div v-if="hasReps" class="exercise-card__metric">
          <span class="exercise-card__metric-value">{{ exercise.reps }}</span>
          <span class="exercise-card__metric-label">reps</span>
        </div>

        <div v-else-if="hasTime" class="exercise-card__metric">
          <span class="exercise-card__metric-value">{{ exercise.seconds }}</span>
          <span class="exercise-card__metric-label">seg</span>
        </div>

        <div class="exercise-card__metric">
          <span class="exercise-card__metric-value">{{ exercise.rest }}</span>
          <span class="exercise-card__metric-label">descanso (s)</span>
        </div>
      </div>

      <!-- Notes section (if present) -->
      <div v-if="exercise.notes" class="exercise-card__notes">
        {{ exercise.notes }}
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Prescription } from '../../types/session';

interface Props {
  /** Exercise prescription data */
  exercise: Prescription;
  /** Quasar color name for accents (from block) */
  accentColor: string;
  /** Whether this exercise is currently selected */
  isActive?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isActive: false,
});

/**
 * Whether exercise has repetition-based prescription
 */
const hasReps = computed(() => props.exercise.reps !== null);

/**
 * Whether exercise has time-based prescription
 */
const hasTime = computed(() => props.exercise.seconds !== null);
</script>

<style scoped lang="scss">
.exercise-card {
  padding: 0;
  margin-bottom: 8px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.exercise-card--active {
  border-left: 4px solid transparent;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.exercise-card__content {
  padding: 16px;
}

.exercise-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.exercise-card__name {
  font-weight: 600;
  line-height: 1.2;
  flex: 1;
  margin-right: 12px;
}

.exercise-card__badge {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
  padding: 4px 8px;
}

.exercise-card__metrics {
  display: flex;
  flex-direction: row;
  gap: 24px;
  margin-bottom: 8px;
}

.exercise-card__metric {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.exercise-card__metric-value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
  color: #2c3e5c;
}

.exercise-card__metric-label {
  font-size: 12px;
  color: #b8956c;
  text-transform: uppercase;
  font-weight: 500;
  letter-spacing: 0.05em;
}

.exercise-card__notes {
  font-size: 13px;
  font-style: italic;
  color: #4a5568;
  padding-top: 8px;
  border-top: 1px solid rgba(44, 62, 92, 0.1);
}
</style>
