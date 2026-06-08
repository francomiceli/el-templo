<template>
  <div class="subfamily-row">
    <div class="subfamily-row__header">
      <span class="subfamily-row__name">{{ subfamily.name }}</span>
      <span class="subfamily-row__percent">{{ subfamily.percent }}% a tu alcance</span>
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

    <!-- Node list: state / band / dl rendered verbatim from the server (D-05/D-08) -->
    <ul v-if="subfamily.nodes.length > 0" class="subfamily-row__nodes">
      <li
        v-for="node in subfamily.nodes"
        :key="node.exerciseId"
        class="subfamily-row__node"
        :class="`subfamily-row__node--${node.state}`"
      >
        <q-icon
          :name="STATE_META[node.state].icon"
          size="16px"
          class="subfamily-row__node-icon"
          :style="{ color: STATE_META[node.state].color }"
        />
        <span class="subfamily-row__node-name">{{ node.name }}</span>
        <span class="subfamily-row__node-dl">dl{{ node.dificultadLineal }}</span>
        <span class="subfamily-row__node-band" :style="{ color: BAND_COLOR[node.band] }">
          {{ node.band }}
        </span>
        <span class="subfamily-row__node-state">{{ STATE_META[node.state].label }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * SubfamilyProgressRow component (Phase 127, refreshed Phase 134 R6/D-08).
 *
 * Renders a single subfamily row: its name, the server-provided percentage as a
 * progress bar (re-labelled "a tu alcance" — reach, not completion, D-05), the
 * reached/total node count, and the node list. Each node row shows its
 * server-computed state (icon + color), its `dl` number, and its difficulty
 * `band` (color per level). Computes NOTHING about state/band/percent — all come
 * straight from the server (D-05). The lookup maps below are presentation-only
 * (icon/color/label per the already-decided state), not a state computation.
 */
import { computed } from 'vue'
import type { TreeNode, TreeSubfamily } from '../types'

interface Props {
  /** Subfamily data from GET /api/tree-progress/me */
  subfamily: TreeSubfamily
}

const props = defineProps<Props>()

/** Scale the server percent (0..100) to the 0..1 q-linear-progress value. */
const progressValue = computed(() => props.subfamily.percent / 100)

/**
 * Presentation map for the 4 server-computed node states (D-01..D-04 / D-08).
 * Colors are resolved brand tokens from quasar.variables.scss — NO blue:
 * $positive (#3b7249, warm green), $primary (#96593a, terracotta), and charcoal
 * ($accent #3d3732) at low alpha for the neutral/locked states.
 */
const STATE_META: Record<TreeNode['state'], { icon: string; color: string; label: string }> = {
  dominado: { icon: 'check_circle', color: '#3b7249', label: 'DOMINADO' },
  en_progreso: { icon: 'local_fire_department', color: '#96593a', label: 'EN PROGRESO' },
  disponible: {
    icon: 'radio_button_unchecked',
    color: 'rgba(61, 55, 50, 0.5)',
    label: 'DISPONIBLE',
  },
  bloqueado: { icon: 'lock', color: 'rgba(61, 55, 50, 0.4)', label: 'BLOQUEADO' },
}

/**
 * Band → color. Reuses the warm brand palette (terracotta/clay/gold/charcoal
 * family) graded by tier; NO blue. Rendered verbatim from `node.band`.
 */
const BAND_COLOR: Record<TreeNode['band'], string> = {
  kairos: '#7d6520', // dark gold
  alfa: '#7d5d42', // clay
  delta: '#96593a', // terracotta
  sigma: '#8a4a2f', // deep terracotta
  omega: '#6b3f2a', // burnt clay
  spartan: '#3d3732', // charcoal — highest tier
}
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
    padding: 3px 0;
    font-size: 13px;
    color: rgba($accent, 0.5);
  }

  // Dominado / en_progreso nodes read as "active": full-strength text.
  &__node--dominado,
  &__node--en_progreso {
    color: $accent;
  }

  &__node-icon {
    flex-shrink: 0;
  }

  &__node-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__node-dl {
    flex-shrink: 0;
    font-family: 'Montserrat', sans-serif;
    font-size: 11px;
    font-weight: 700;
    color: rgba($accent, 0.6);
  }

  &__node-band {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  &__node-state {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgba($accent, 0.55);
  }

  &__node--bloqueado {
    opacity: 0.7;
  }
}
</style>
