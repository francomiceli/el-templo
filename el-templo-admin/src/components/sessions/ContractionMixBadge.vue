<template>
  <div class="contraction-mix-badge row items-center q-gutter-xs">
    <q-chip
      dense
      size="sm"
      color="blue-grey"
      text-color="white"
    >
      CON: {{ conCount }}
    </q-chip>
    <q-chip
      dense
      size="sm"
      color="teal"
      text-color="white"
    >
      EXC: {{ excCount }}
    </q-chip>
    <q-chip
      dense
      size="sm"
      color="orange"
      text-color="white"
    >
      ISO: {{ isoCount }}
    </q-chip>
    <q-icon
      v-if="warning && !isInitium"
      name="warning"
      color="negative"
      size="sm"
    >
      <q-tooltip>{{ warning }}</q-tooltip>
    </q-icon>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SessionExercise } from 'src/types/session';

const props = defineProps<{
  exercises: SessionExercise[];
  intensity: number;
  blockRole: string;
  warning?: string;
}>();

const isInitium = computed(() => {
  return props.blockRole?.toLowerCase().includes('initium');
});

function countContraction(type: string): number {
  return props.exercises.filter(ex => {
    const c = ex.contraction?.toLowerCase() || '';
    return c === type || c === `${type}centrico` || c === `${type}ometrico`;
  }).length;
}

const conCount = computed(() => countContraction('con'));
const excCount = computed(() => countContraction('exc'));
const isoCount = computed(() => {
  return props.exercises.filter(ex => {
    const c = ex.contraction?.toLowerCase() || '';
    return c === 'iso' || c === 'isometrico';
  }).length;
});
</script>
