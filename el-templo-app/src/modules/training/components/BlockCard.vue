<template>
  <q-expansion-item
    :class="['block-card', colorClass]"
    :label="block.role"
    :caption="blockCaption"
    expand-separator
    header-class="text-weight-medium"
  >
    <template #header>
      <q-item-section>
        <q-item-label class="text-weight-medium text-body1">
          {{ formatRole(block.role) }}
        </q-item-label>
        <q-item-label caption class="text-caption">
          {{ blockCaption }}
        </q-item-label>
      </q-item-section>
    </template>

    <q-card class="q-ma-sm">
      <q-card-section class="q-pa-sm">
        <div class="exercise-list">
          <div
            v-for="(exercise, index) in block.exercises"
            :key="exercise.exerciseId"
            class="exercise-item q-py-xs"
          >
            <div class="row items-center no-wrap">
              <div class="col-auto q-mr-sm text-caption text-grey-7">
                {{ index + 1 }}.
              </div>
              <div class="col">
                <div class="text-body2">{{ exercise.exerciseName }}</div>
                <div class="text-caption text-grey-7">
                  {{ formatPrescription(exercise) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </q-card-section>
    </q-card>
  </q-expansion-item>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Block, BlockRole, Prescription } from '../types/session';
import { getRouteName } from '../utils/routeNames';

interface Props {
  block: Block;
  colorClass?: string;
}

const props = withDefaults(defineProps<Props>(), {
  colorClass: 'bg-grey-1',
});

// getBlockColorClass is exported from utils/blockColors.ts for external use

/**
 * Format block role for display
 */
function formatRole(role: BlockRole): string {
  const roleNames: Record<BlockRole, string> = {
    INITIUM: 'Initium',
    NUCLEUS: 'Nucleus',
    DEUTEROS_1: 'Deuteros 1',
    DEUTEROS_2: 'Deuteros 2',
    ATHLOS_EPIKOS: 'Athlos Epikos',
  };
  return roleNames[role] || role;
}

/**
 * Build caption showing route, exercise count, and format
 */
const blockCaption = computed(() => {
  const parts: string[] = [];

  if (props.block.route) {
    parts.push(getRouteName(props.block.route));
  }

  const exerciseCount = props.block.exercises.length;
  parts.push(`${exerciseCount} ejercicio${exerciseCount !== 1 ? 's' : ''}`);

  if (props.block.format && typeof props.block.format === 'string') {
    parts.push(props.block.format);
  }

  return parts.join(' • ');
});

/**
 * Format prescription for display (reps or duration + rest)
 */
function formatPrescription(exercise: Prescription): string {
  const parts: string[] = [];

  // Reps or duration
  if (exercise.reps !== null) {
    parts.push(`${exercise.reps} reps`);
  } else if (exercise.seconds !== null) {
    parts.push(`${exercise.seconds}s`);
  }

  // Rest period
  if (exercise.rest > 0) {
    parts.push(`descanso ${exercise.rest}s`);
  }

  // Contraction type
  if (exercise.contraction) {
    parts.push(exercise.contraction);
  }

  return parts.join(' • ');
}
</script>

<style scoped lang="scss">
.block-card {
  border-radius: 8px;
  margin-bottom: 8px;
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
}

.exercise-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.exercise-item {
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);

  &:last-child {
    border-bottom: none;
  }
}
</style>
