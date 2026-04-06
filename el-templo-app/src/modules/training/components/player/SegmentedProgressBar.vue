<template>
  <div class="story-progress">
    <div
      v-for="index in totalSegments"
      :key="index"
      class="story-progress__segment"
      :class="{
        'story-progress__segment--active': index - 1 === activeIndex,
      }"
    />
  </div>
</template>

<script setup lang="ts">
interface Props {
  totalSegments: number
  activeIndex: number
}

defineProps<Props>()
</script>

<style scoped lang="scss">
.story-progress {
  display: flex;
  gap: 2px;
  padding: 8px 12px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
}

.story-progress__segment {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.55);
  transition: background-color 0.3s ease;
}

.story-progress__segment--active {
  background: #d4b46a;
  box-shadow: 0 0 4px rgba(212, 180, 106, 0.6);
}
</style>
