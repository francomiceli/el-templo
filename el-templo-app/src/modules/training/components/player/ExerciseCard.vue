<template>
  <q-card
    :class="[
      'exercise-card',
      { 'exercise-card--active': isActive },
      { 'exercise-card--completed': completed }
    ]"
    :style="isActive ? { borderLeftColor: `var(--q-${accentColor})` } : {}"
    flat
    bordered
  >
    <q-card-section class="exercise-card__content">
      <div class="exercise-card__row">
        <!-- Left: exercise details -->
        <div class="exercise-card__details">
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

          <!-- Main metrics: reps OR seconds -->
          <div class="exercise-card__metrics">
            <div v-if="hasReps" class="exercise-card__metric">
              <span class="exercise-card__metric-value">{{ exercise.reps }}</span>
              <span class="exercise-card__metric-label">reps</span>
            </div>

            <div v-else-if="hasTime" class="exercise-card__metric">
              <span class="exercise-card__metric-value">{{ exercise.seconds }}</span>
              <span class="exercise-card__metric-label">seg</span>
            </div>
          </div>

          <!-- Notes section (if present) -->
          <div v-if="exercise.notes" class="exercise-card__notes">
            {{ exercise.notes }}
          </div>
        </div>

        <!-- Right: completion checkmark -->
        <div class="exercise-card__check" @click.stop="emit('toggle-complete')">
          <q-icon
            :name="completed ? 'check_circle' : 'radio_button_unchecked'"
            :color="completed ? 'positive' : 'grey-5'"
            size="28px"
            class="exercise-card__check-icon"
          />
        </div>
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
  /** Whether this exercise has been completed */
  completed?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isActive: false,
  completed: false,
});

const emit = defineEmits<{
  (e: 'toggle-complete'): void;
}>();

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
  transition: all 0.3s ease;
}

.exercise-card--active {
  border-left: 4px solid transparent;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.exercise-card--completed .exercise-card__details {
  opacity: 0.5;
}

.exercise-card--completed .exercise-card__name {
  text-decoration: line-through;
}

.exercise-card__content {
  padding: 16px;
}

.exercise-card__row {
  display: flex;
  align-items: center;
}

.exercise-card__details {
  flex: 1;
  min-width: 0;
  transition: opacity 0.3s ease;
}

.exercise-card__check {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  margin-left: 12px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.exercise-card__check-icon {
  transition: color 0.3s ease, transform 0.3s ease;
}

.exercise-card--completed .exercise-card__check-icon {
  transform: scale(1.1);
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
  transition: text-decoration 0.3s ease;
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
