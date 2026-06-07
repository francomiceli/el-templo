<script setup lang="ts">
/**
 * Data payload of a sub-grupo label node (R3 — non-interactive canvas label).
 * Visual grouper only — NOT a navigation axis (locked decision 5).
 */
export interface SubgroupNodeData {
  label: string;
}

defineProps<{ data: SubgroupNodeData }>();
</script>

<template>
  <div class="subgroup-flow-node">{{ data.label }}</div>
</template>

<style lang="scss" scoped>
// UI-SPEC C3/Typography: caption 12px / 600 / uppercase / grey-7 / letter-spacing 0.5px.
// Sin caja ni borde: agrupador visual, no eje de navegación (locked).
.subgroup-flow-node {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: $grey-7;
  padding: 2px 0;
  pointer-events: none;
}
</style>
