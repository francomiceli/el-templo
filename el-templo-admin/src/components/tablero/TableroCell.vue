<template>
  <div class="tablero-cell" :class="{ 'tablero-cell--muted': muted }">
    <!-- Valor de la semana (y, debajo, la semana anterior con su ▲▼). -->
    <template v-if="part === 'cell'">
      <div class="tablero-cell__value" :class="{ 'tablero-cell__value--danger': danger }">
        {{ valueText }}
      </div>
      <div v-if="showPrevious && cell" class="tablero-cell__previous">
        <span>ant. {{ previousText }}</span>
        <span
          v-if="delta.direction"
          class="tablero-cell__delta"
          :class="`tablero-cell__delta--${tone}`"
        >
          {{ arrow }} {{ delta.label }}
        </span>
      </div>
    </template>

    <!-- Solo la semana anterior (columna "Semana anterior" del Total). -->
    <div v-else-if="part === 'previous'" class="tablero-cell__value">{{ previousText }}</div>

    <!-- Solo el ▲▼ (columna "▲▼" del Total). -->
    <div v-else class="tablero-cell__value">
      <span
        v-if="delta.direction"
        class="tablero-cell__delta"
        :class="`tablero-cell__delta--${tone}`"
      >
        {{ arrow }} {{ delta.label }}
      </span>
      <span v-else>—</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  BoardCell,
  BoardMetricKey,
  BoardMetricUnit,
  CountryCurrency,
} from 'src/types/weekly-board';
import { boardDelta, deltaTone, formatBoardValue } from 'src/utils/weekly-board-format';

const props = withDefaults(
  defineProps<{
    metricKey: BoardMetricKey;
    unit: BoardMetricUnit;
    currency: CountryCurrency;
    cell: BoardCell | undefined;
    /** Muestra debajo "ant. X" y el ▲▼ (solo para `part="cell"`). */
    showPrevious?: boolean;
    /** Columna informativa (Online): se ve apagada. */
    muted?: boolean;
    /** Valor en rojo y negrita ("Sin contactar" > 0). */
    danger?: boolean;
    /** Qué dibuja: la celda completa, solo la semana anterior o solo el ▲▼. */
    part?: 'cell' | 'previous' | 'delta';
  }>(),
  { showPrevious: true, muted: false, danger: false, part: 'cell' }
);

const valueText = computed(() =>
  formatBoardValue(props.cell?.value ?? null, props.unit, props.currency)
);
const previousText = computed(() =>
  formatBoardValue(props.cell?.previous ?? null, props.unit, props.currency)
);
const delta = computed(() =>
  props.cell
    ? boardDelta(props.cell, props.unit, props.currency)
    : { diff: null, direction: null, label: '' }
);
const tone = computed(() => deltaTone(props.metricKey, delta.value.direction));
const arrow = computed(() => {
  if (delta.value.direction === 'up') return '▲';
  if (delta.value.direction === 'down') return '▼';
  return '=';
});
</script>

<style scoped>
.tablero-cell {
  text-align: right;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
}
.tablero-cell--muted {
  opacity: 0.75;
}
.tablero-cell__value {
  color: #3d3732;
}
.tablero-cell__value--danger {
  color: #b34a4a;
  font-weight: 700;
}
.tablero-cell__previous {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  font-size: 11px;
  /* Olive Stone oscurecido (#6b6459): el #8A8472 de la marca no llega a 4.5:1 en texto chico. */
  color: #6b6459;
}
.tablero-cell__delta {
  font-weight: 600;
  white-space: nowrap;
}
.tablero-cell__delta--positive {
  color: #3b7249;
}
.tablero-cell__delta--negative {
  color: #b34a4a;
}
.tablero-cell__delta--neutral {
  color: #6b6459;
}
</style>
