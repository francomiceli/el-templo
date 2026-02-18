<template>
  <q-item clickable :disable="disabled" @click="$emit('select')" class="exercise-item">
    <q-item-section>
      <q-item-label class="text-weight-medium text-body2">
        {{ exercise.exercise }}
      </q-item-label>
      <q-item-label caption>
        <q-badge :color="contractionColor(exercise.effort)" class="q-mr-xs">
          {{ contractionLabel(exercise.effort) }}
        </q-badge>
        <q-badge outline color="grey-7" class="q-mr-xs">
          Dif: {{ exercise.dificultadLineal }}
        </q-badge>
        <q-badge v-if="routeBadgeColor" :color="routeBadgeColor" text-color="white" class="q-mr-xs">
          {{ exercise.route }}
        </q-badge>
        <q-icon
          v-if="exercise.videoUrl"
          name="videocam"
          size="14px"
          color="green-7"
          class="q-ml-xs"
        >
          <q-tooltip>Tiene video</q-tooltip>
        </q-icon>
      </q-item-label>
    </q-item-section>

    <q-item-section side>
      <q-spinner-dots v-if="showSpinner" size="24px" color="primary" />
      <q-btn
        v-else
        flat
        dense
        round
        :icon="actionIcon"
        color="primary"
        :disable="disabled"
        @click.stop="$emit('select')"
      >
        <q-tooltip>{{ actionTooltip }}</q-tooltip>
      </q-btn>
    </q-item-section>
  </q-item>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PoolExercise } from 'src/types/session';
import { contractionLabel, contractionColor } from 'src/utils/contraction-helpers';

interface PoolExerciseWithSource extends PoolExercise {
  patternSource: 'pattern_1' | 'pattern_2';
}

const props = defineProps<{
  exercise: PoolExerciseWithSource;
  isAddMode: boolean;
  mobilityMode: boolean;
  disabled: boolean;
  showSpinner: boolean;
  showPatternBadge?: boolean;
}>();

defineEmits<{
  (e: 'select'): void;
}>();

const routeBadgeColor = computed(() => {
  if (!props.showPatternBadge) return null;
  if (props.mobilityMode) {
    return props.exercise.patternSource === 'pattern_1' ? 'green' : 'grey-5';
  }
  return props.exercise.patternSource === 'pattern_2' ? 'deep-orange' : 'green';
});

const actionIcon = computed(() => (props.isAddMode ? 'add_circle' : 'swap_horiz'));

const actionTooltip = computed(() => {
  if (props.isAddMode) return 'Agregar este ejercicio';
  if (props.mobilityMode) return 'Usar este ejercicio de movilidad';
  return 'Reemplazar con este ejercicio';
});
</script>

<style scoped>
.exercise-item {
  padding-top: 6px;
  padding-bottom: 6px;
}
</style>
