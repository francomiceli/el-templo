<template>
  <q-card :class="['q-mb-md', `border-${blockColor}`]" bordered>
    <q-card-section :class="['text-white', `bg-${blockColor}`]">
      <div class="row items-center justify-between">
        <div>
          <div class="text-h6">{{ block.role }}</div>
          <div class="text-caption">{{ block.route }}</div>
        </div>
        <div class="row items-center q-gutter-sm">
          <q-btn
            v-if="showSwap"
            flat
            dense
            round
            icon="swap_horiz"
            color="white"
            @click="$emit('swap', block)"
          >
            <q-tooltip>Intercambiar bloque</q-tooltip>
          </q-btn>
          <q-badge color="white" :text-color="blockColor" :label="block.format" />
        </div>
      </div>
    </q-card-section>

    <!-- Block stats -->
    <q-card-section class="q-py-sm bg-grey-2">
      <div class="row q-gutter-md text-caption">
        <div>
          <q-icon name="fitness_center" size="xs" />
          {{ block.exercises.length }} ejercicios
        </div>
        <div v-if="block.repsBudget">
          <q-icon name="replay" size="xs" />
          {{ block.repsBudget }} reps budget
        </div>
        <div v-if="block.intensity">
          <q-icon name="speed" size="xs" />
          {{ block.intensity }}% intensidad
        </div>
        <div v-if="avgDifficulty">
          <q-icon name="trending_up" size="xs" />
          Dif: {{ avgDifficulty.toFixed(1) }}
        </div>
      </div>
    </q-card-section>

    <!-- Exercises list -->
    <q-list separator>
      <exercise-row
        v-for="exercise in block.exercises"
        :key="exercise.id"
        :exercise="exercise"
      />
    </q-list>
  </q-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SessionBlock } from 'src/types/session';
import ExerciseRow from './ExerciseRow.vue';

const props = defineProps<{
  block: SessionBlock;
  showSwap?: boolean;
}>();

defineEmits<{
  (e: 'swap', block: SessionBlock): void;
}>();

const blockColor = computed(() => {
  const role = props.block.role?.toLowerCase() || '';
  if (role.includes('initium')) return 'light-blue';
  if (role.includes('nucleus')) return 'deep-purple';
  if (role.includes('deuteros')) return 'teal';
  if (role.includes('athlos') || role.includes('epikos')) return 'amber';
  return 'grey';
});

const avgDifficulty = computed(() => {
  const difficulties = props.block.exercises
    .map(e => e.dificultadLineal)
    .filter((d): d is number => d !== null && d !== undefined);
  if (difficulties.length === 0) return null;
  return difficulties.reduce((a, b) => a + b, 0) / difficulties.length;
});

</script>

<style scoped>
.border-light-blue {
  border-left: 4px solid var(--q-light-blue) !important;
}
.border-deep-purple {
  border-left: 4px solid var(--q-deep-purple) !important;
}
.border-teal {
  border-left: 4px solid var(--q-teal) !important;
}
.border-amber {
  border-left: 4px solid var(--q-amber) !important;
}
.border-grey {
  border-left: 4px solid var(--q-grey) !important;
}
</style>
