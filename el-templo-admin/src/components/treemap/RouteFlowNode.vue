<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';

/** Data payload of a route node in the tree map canvas. */
export interface RouteNodeData {
  /** routes.display_name (or code fallback). */
  name: string;
  /** routes.code — partition dimension + expand key. */
  code: string;
  /** Exercise count of the selected effort partition. */
  count: number;
  /** true ⇒ the selected partition is profe-overridden (manual chain). */
  overridden: boolean;
  /** true ⇒ the chain is currently rendered on the canvas. */
  expanded: boolean;
  /** Dimension proposals pending profe review for this route (0 = none). */
  pendingCount: number;
}

defineProps<{ data: RouteNodeData }>();

defineEmits<{ review: [] }>();
</script>

<template>
  <div
    class="route-flow-node"
    :class="{
      'route-flow-node--expanded': data.expanded,
      'route-flow-node--empty': data.count === 0,
    }"
  >
    <q-icon
      :name="data.expanded ? 'unfold_less' : 'unfold_more'"
      size="18px"
      class="route-flow-node__chevron"
    />
    <div class="route-flow-node__body">
      <div class="route-flow-node__name ellipsis">{{ data.name }}</div>
      <div class="route-flow-node__meta">
        <span class="route-flow-node__code">{{ data.code }}</span>
        <span>· {{ data.count }} ej.</span>
        <q-badge v-if="data.overridden" color="primary" label="Manual" />
      </div>
    </div>
    <q-badge
      v-if="data.pendingCount > 0"
      color="orange-8"
      class="route-flow-node__pending"
      @click.stop="$emit('review')"
    >
      {{ data.pendingCount }}
      <q-tooltip>{{ data.pendingCount }} propuestas por revisar — click para abrir</q-tooltip>
    </q-badge>
    <!-- Visual-only outlet for the dashed "start of chain" edge (chain grows down). -->
    <Handle
      type="source"
      :position="Position.Bottom"
      :connectable="false"
      class="route-flow-node__handle"
    />
  </div>
</template>

<style lang="scss" scoped>
.route-flow-node {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 240px;
  padding: 10px 12px;
  border: 1px solid $grey-5;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);

  &--expanded {
    border-color: $primary;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  }

  &--empty {
    opacity: 0.45;
    cursor: default;
  }

  &__chevron {
    color: $grey-7;
    flex-shrink: 0;
  }

  &__body {
    min-width: 0;
  }

  &__name {
    font-weight: 600;
    font-size: 13px;
    line-height: 1.2;
  }

  &__meta {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: $grey-7;
  }

  &__code {
    font-weight: 500;
  }

  &__handle {
    opacity: 0;
  }

  &__pending {
    position: absolute;
    top: -8px;
    right: -8px;
    cursor: pointer;
    font-weight: 700;
  }
}
</style>
