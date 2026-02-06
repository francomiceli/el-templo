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
      </q-item-label>
    </q-item-section>

    <q-item-section side v-if="exercise.dificultadLineal">
      <div class="text-caption text-grey">
        Dif: {{ exercise.dificultadLineal }}
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
}>();

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
