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
}

.story-progress__segment {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.3);
  transition: background-color 0.3s ease;
}

.story-progress__segment--active {
  background: #b89b5e;
}
</style>
