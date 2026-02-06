<template>
  <div class="budget-bar">
    <div class="row items-center q-gutter-xs q-mb-xs">
      <q-icon name="data_usage" size="xs" :color="barColor" />
      <span class="text-caption text-weight-medium" :class="`text-${barColor}`">
        {{ currentReps }} / {{ originalBudget }} reps
      </span>
    </div>
    <q-linear-progress
      :value="progressValue"
      :color="barColor"
      rounded
      size="20px"
      track-color="grey-3"
    >
      <div class="absolute-full flex flex-center">
        <span class="text-caption text-weight-bold" :class="progressTextClass">
          {{ percentLabel }}%
        </span>
      </div>
    </q-linear-progress>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  currentReps: number;
  originalBudget: number;
}>();

const ratio = computed(() => {
  if (props.originalBudget <= 0) return 0;
  return props.currentReps / props.originalBudget;
});

const progressValue = computed(() => {
  // Cap at 150% for visual display
  return Math.min(ratio.value, 1.5);
});

const percentLabel = computed(() => {
  return Math.round(ratio.value * 100);
});

const barColor = computed(() => {
  if (ratio.value <= 1) return 'positive';
  if (ratio.value <= 1.1) return 'amber';
  return 'negative';
});

const progressTextClass = computed(() => {
  // Use white text on green and red, dark on amber
  if (ratio.value <= 1) return 'text-white';
  if (ratio.value <= 1.1) return 'text-dark';
  return 'text-white';
});
</script>

<style scoped>
.budget-bar {
  min-width: 140px;
}
</style>
