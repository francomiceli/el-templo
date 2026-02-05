<template>
  <q-item>
    <q-item-section>
      <q-item-label class="text-weight-medium">
        {{ exercise.exerciseName }}
      </q-item-label>
      <q-item-label caption>
        <q-chip dense size="sm" :color="contractionColor" text-color="white">
          {{ contractionLabel }}
        </q-chip>
        <span class="q-ml-sm">
          <template v-if="exercise.reps">{{ exercise.reps }} reps</template>
          <template v-else-if="exercise.seconds">{{ exercise.seconds }}s</template>
        </span>
        <span v-if="exercise.rest" class="q-ml-sm text-grey">
          | {{ exercise.rest }}s descanso
        </span>
      </q-item-label>
    </q-item-section>

    <!-- Algorithm details (toggleable) -->
    <q-item-section side v-if="showDetails">
      <div class="text-caption text-grey">
        <div v-if="exercise.dificultadLineal">
          Dif: {{ exercise.dificultadLineal }}
        </div>
      </div>
    </q-item-section>

    <q-item-section side v-if="exercise.notes">
      <q-icon name="info" color="grey">
        <q-tooltip>{{ exercise.notes }}</q-tooltip>
      </q-icon>
    </q-item-section>
  </q-item>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SessionExercise } from 'src/types/session';

const props = defineProps<{
  exercise: SessionExercise;
  showDetails?: boolean;
}>();

const contractionLabel = computed(() => {
  switch (props.exercise.contraction?.toLowerCase()) {
    case 'con':
    case 'concentrico':
      return 'Concentrico';
    case 'exc':
    case 'excentrico':
      return 'Excentrico';
    case 'iso':
    case 'isometrico':
      return 'Isometrico';
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
