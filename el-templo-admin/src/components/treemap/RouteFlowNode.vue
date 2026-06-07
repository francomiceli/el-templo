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
  /** true ⇒ the route has INCOMING cross-route prerequisites (R4 — élite route). */
  hasPrereq: boolean;
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
    <!-- R4: badge prereq (ruta élite) — a la IZQUIERDA del pending cuando coexisten. -->
    <q-badge
      v-if="data.hasPrereq"
      outline
      color="grey-8"
      label="prereq"
      class="route-flow-node__prereq"
      :class="{ 'route-flow-node__prereq--shifted': data.pendingCount > 0 }"
    >
      <q-tooltip
        >Esta ruta tiene prerequisitos en otra ruta. Expandí ambas para ver las aristas.</q-tooltip
      >
    </q-badge>
    <q-badge
      v-if="data.pendingCount > 0"
      color="orange-8"
      class="route-flow-node__pending"
      @click.stop="$emit('review')"
    >
      {{ data.pendingCount }}
      <q-tooltip>{{ data.pendingCount }} propuestas por revisar — click para abrir</q-tooltip>
    </q-badge>
    <!-- Visual-only inlet for the aggregated cross-route prereq edge (R4, collapsed endpoints). -->
    <Handle
      type="target"
      :position="Position.Top"
      :connectable="false"
      class="route-flow-node__handle"
    />
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

  &__prereq {
    position: absolute;
    top: -8px;
    right: -8px;
    background: #fff;

    // pending mantiene la prioridad visual (UI-SPEC C6) — prereq corre a su izquierda.
    &--shifted {
      right: 24px;
    }
  }
}
</style>
