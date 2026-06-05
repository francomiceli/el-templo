<template>
  <div class="subfamily-row">
    <div class="subfamily-row__header">
      <span class="subfamily-row__name">{{ subfamily.name }}</span>
      <span class="subfamily-row__percent">{{ subfamily.percent }}%</span>
    </div>

    <q-linear-progress
      :value="progressValue"
      rounded
      size="10px"
      color="primary"
      class="subfamily-row__bar"
    />

    <div class="subfamily-row__count">
      {{ subfamily.reachedNodes }} / {{ subfamily.totalNodes }} ejercicios
    </div>

    <!-- Node list: reached state rendered verbatim from the server -->
    <ul v-if="subfamily.nodes.length > 0" class="subfamily-row__nodes">
      <li
        v-for="node in subfamily.nodes"
        :key="node.exerciseId"
        class="subfamily-row__node"
        :class="{ 'subfamily-row__node--reached': node.reached }"
      >
        <q-icon
          :name="node.reached ? 'check_circle' : 'radio_button_unchecked'"
          size="16px"
          class="subfamily-row__node-icon"
        />
        <span class="subfamily-row__node-name">{{ node.name }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * SubfamilyProgressRow component (Phase 127).
 *
 * Renders a single subfamily row: its name, the server-provided percentage as a
 * progress bar, the reached/total node count, and the node list with each node's
 * reached state. Computes NOTHING — `subfamily.percent` and `node.reached` come
 * straight from the server (D-05). `progressValue` only scales the integer
 * percentage to the 0..1 range q-linear-progress expects (presentation, not a
 * progress computation).
 */
import { computed } from 'vue'
import type { TreeSubfamily } from '../types'

interface Props {
  /** Subfamily data from GET /api/tree-progress/me */
  subfamily: TreeSubfamily
}

const props = defineProps<Props>()

/** Scale the server percent (0..100) to the 0..1 q-linear-progress value. */
const progressValue = computed(() => props.subfamily.percent / 100)
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.subfamily-row {
  padding: 10px 0;

  & + & {
    border-top: 1px solid rgba($secondary, 0.15);
  }

  &__header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  &__name {
    font-size: 14px;
    font-weight: 600;
    color: $primary;
  }

  &__percent {
    font-family: 'Montserrat', sans-serif;
    font-size: 14px;
    font-weight: 700;
    color: $secondary;
  }

  &__bar {
    margin-bottom: 6px;
  }

  &__count {
    font-size: 11px;
    color: rgba($accent, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  &__nodes {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
  }

  &__node {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    font-size: 13px;
    color: rgba($accent, 0.5);
  }

  &__node--reached {
    color: $accent;
  }

  &__node-icon {
    color: rgba($secondary, 0.4);
  }

  &__node--reached &__node-icon {
    color: $positive;
  }
}
</style>
