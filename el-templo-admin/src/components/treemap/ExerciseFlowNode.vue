<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import type { Effort, OrderSource } from 'src/types/tree-editor';

/** Data payload of an exercise (chain step) node in the tree map canvas. */
export interface ExerciseNodeData {
  exerciseId: number;
  name: string;
  dl: number | null;
  orderSource: OrderSource;
  /** routes.code of the owning chain. */
  route: string;
  /** Effort partition of the owning chain. */
  effort: Effort;
  /** 0-based position within the chain (display: escalón N). */
  stepIndex: number;
}

defineProps<{ data: ExerciseNodeData; selected?: boolean }>();
</script>

<template>
  <div
    class="exercise-flow-node"
    :class="{
      'exercise-flow-node--selected': selected,
      'exercise-flow-node--manual': data.orderSource === 'manual',
    }"
  >
    <!-- Top/bottom handles: chain edges land here (vertical layout); dragging from
         one node to another creates a manual precedence (page's onConnect). -->
    <Handle type="target" :position="Position.Top" class="exercise-flow-node__handle" />
    <div class="exercise-flow-node__step">{{ data.stepIndex + 1 }}</div>
    <div class="exercise-flow-node__body">
      <div class="exercise-flow-node__name">{{ data.name }}</div>
      <div class="exercise-flow-node__meta">
        <span>dl {{ data.dl ?? '—' }}</span>
        <q-badge
          v-if="data.orderSource === 'manual'"
          color="primary"
          label="Manual"
          class="q-ml-xs"
        />
      </div>
    </div>
    <Handle type="source" :position="Position.Bottom" class="exercise-flow-node__handle" />
  </div>
</template>

<style lang="scss" scoped>
.exercise-flow-node {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 200px;
  padding: 8px 10px;
  border: 1px solid $grey-5;
  border-radius: 8px;
  background: #fff;
  cursor: grab;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);

  &--manual {
    border-color: $primary;
  }

  &--selected {
    outline: 2px solid $primary;
    outline-offset: 1px;
  }

  &__step {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: $grey-3;
    color: $grey-8;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &--manual &__step {
    background: $primary;
    color: #fff;
  }

  &__body {
    min-width: 0;
  }

  &__name {
    font-size: 12px;
    font-weight: 500;
    line-height: 1.25;
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
    width: 8px;
    height: 8px;
    background: $grey-6;
  }
}
</style>
