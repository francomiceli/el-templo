<script setup lang="ts">
/** Data payload of a category header node (non-interactive canvas label). */
export interface CategoryNodeData {
  label: string;
}

defineProps<{ data: CategoryNodeData }>();
</script>

<template>
  <div class="category-flow-node">{{ data.label }}</div>
</template>

<style lang="scss" scoped>
.category-flow-node {
  font-size: 16px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: $grey-8;
  padding: 4px 0;
  pointer-events: none;
}
</style>
