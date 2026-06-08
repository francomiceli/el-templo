<script setup lang="ts">
/**
 * VariantFlowNode — a variante hanging under its hito on the tree map canvas
 * (Phase 135 Plan 04, D-09). Read-only render: dl band (color by kairos→spartan
 * via dlBand) + dl number. Not draggable / not selectable (the page sets that),
 * so it never participates in chain reorder (onNodeDragStop filters 'exercise').
 */
import { computed } from 'vue';
import { colors } from 'quasar';
import { Handle, Position } from '@vue-flow/core';
// R2-BANDS: la banda se resuelve contra DL_BANDS (mapeo locked) vía dlBand().
import { dlBand, bandTextClass } from 'src/constants/levels';

/** Data payload of a variante sub-node. */
export interface VariantNodeData {
  /** milestone_variants row id (exercises.id of the variante). */
  variantId: number;
  name: string;
  /** dificultad_lineal of the variante. */
  dl: number;
}

const props = defineProps<{ data: VariantNodeData }>();

const band = computed(() => dlBand(props.data.dl));

/** Stripe de 4px del color de la banda (lado izquierdo) — mismo lenguaje que el hito. */
const stripeStyle = computed(() =>
  band.value ? { borderLeft: `4px solid ${colors.getPaletteColor(band.value.color)}` } : {}
);

const badgeColor = computed(() => band.value?.color ?? 'grey-6');
const badgeTextClass = computed(() => (band.value ? bandTextClass(band.value) : 'text-white'));

const bandTooltip = computed(() => {
  if (!band.value) return null;
  const { level, min, max } = band.value;
  return min === max ? `${level} (dl ${min})` : `${level} (dl ${min}–${max})`;
});
</script>

<template>
  <div class="variant-flow-node" :style="stripeStyle">
    <!-- Visual-only inlet for the hito→variante edge. -->
    <Handle
      type="target"
      :position="Position.Top"
      :connectable="false"
      class="variant-flow-node__handle"
    />
    <div class="variant-flow-node__body">
      <div class="variant-flow-node__name">{{ data.name }}</div>
      <div class="variant-flow-node__meta">
        <q-badge :color="badgeColor" :class="badgeTextClass" :label="`dl ${data.dl}`">
          <q-tooltip v-if="bandTooltip">{{ bandTooltip }}</q-tooltip>
        </q-badge>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.variant-flow-node {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 176px;
  padding: 6px 9px;
  border: 1px dashed $grey-5;
  border-radius: 8px;
  background: $grey-1;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);

  &__body {
    min-width: 0;
  }

  &__name {
    font-size: 11px;
    font-weight: 500;
    line-height: 1.2;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  &__meta {
    display: flex;
    align-items: center;
    font-size: 10px;
    color: $grey-7;
  }

  &__handle {
    opacity: 0;
  }
}
</style>
