<template>
  <div class="block-list">
    <!-- Loading state -->
    <div v-if="loading" class="flex flex-center q-pa-lg">
      <q-spinner-dots color="primary" size="50px" />
    </div>

    <!-- Empty state -->
    <div
      v-else-if="blocks.length === 0"
      class="empty-state flex flex-center column q-pa-lg"
    >
      <q-icon name="fitness_center" size="64px" color="grey-5" class="q-mb-md" />
      <div class="text-h6 text-grey-6">No hay bloques para este día</div>
      <div class="text-caption text-grey-5 q-mt-sm">
        Selecciona otro día o verifica la sesión
      </div>
    </div>

    <!-- Block list -->
    <div v-else class="blocks-container">
      <BlockCard
        v-for="block in sortedBlocks"
        :key="block.blockId"
        :block="block"
        :color-class="getBlockColorClass(block.role)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Block } from '../types/session';
import BlockCard, { getBlockColorClass } from './BlockCard.vue';

interface Props {
  blocks: Block[];
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});

/**
 * Sort blocks by their sortOrder property to ensure correct display sequence
 */
const sortedBlocks = computed(() => {
  return [...props.blocks].sort((a, b) => a.sortOrder - b.sortOrder);
});
</script>

<style scoped lang="scss">
.block-list {
  width: 100%;
  height: 100%;
  overflow-y: auto;
}

.blocks-container {
  padding: 16px;
  padding-bottom: 100px; // Space for fixed Start button
}

.empty-state {
  min-height: 300px;
  text-align: center;
}

// Smooth scrolling on iOS
.block-list {
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
}
</style>
