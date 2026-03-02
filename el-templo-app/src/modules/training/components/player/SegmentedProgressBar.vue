<template>
  <div class="story-progress">
    <div
      v-for="index in totalSegments"
      :key="index"
      class="story-progress__segment"
      :class="{
        'story-progress__segment--completed': completedIndices.has(index - 1),
        'story-progress__segment--active': index - 1 === activeIndex,
      }"
    />
  </div>
</template>

<script setup lang="ts">
interface Props {
  /** Total number of segments (exercises + mobility) */
  totalSegments: number
  /** Index of the currently active segment (0-based) */
  activeIndex: number
  /** Set of completed segment indices */
  completedIndices: Set<number>
}

defineProps<Props>()
</script>

<style scoped lang="scss">
.story-progress {
  display: flex;
  gap: 2px;
  padding: 8px 12px;
}

.story-progress__segment {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.3);
  transition:
    background-color 0.3s ease,
    box-shadow 0.3s ease;
}

.story-progress__segment--completed {
  background: #b89b5e; // Aged Gold
}

.story-progress__segment--active {
  background: #b89b5e; // Aged Gold
  animation: segment-glow 1.5s ease-in-out infinite;
}

@keyframes segment-glow {
  0%,
  100% {
    box-shadow: 0 0 4px rgba(184, 155, 94, 0.4);
  }
  50% {
    box-shadow: 0 0 8px rgba(184, 155, 94, 0.8);
  }
}
</style>
