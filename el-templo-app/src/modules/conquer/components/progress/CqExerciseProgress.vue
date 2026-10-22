<template>
  <div class="cq-pe">
    <h3 class="cq-pe__name">{{ exercise.name }}</h3>

    <div v-for="row in rows" :key="row.step" class="cq-pe__row">
      <span class="cq-pe__label">{{ row.label }}</span>
      <span class="cq-pe__marks">
        {{ row.last }} →
        <b>{{ row.target }}</b>
      </span>
      <span class="cq-chip" :class="row.chipClass">{{ row.chipLabel }}</span>
    </div>

    <CqSparkline
      v-if="exercise.e1Curve.length > 0"
      :values="exercise.e1Curve"
      :unit="exercise.unit"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { estadoChip, unitText } from '../../utils/format'
import type { ProgressExercise } from '../../types'
import CqSparkline from './CqSparkline.vue'

// Fase 201 §7.1 Progreso (ref `vProg`): un ejercicio con sus escalones E1-E3. Por cada uno: el
// peldaño (con "neg." si es negativa), la última marca → el próximo objetivo que calculó el motor y
// el chip de estado (verde solo "Subir"). Abajo, la curva del E1. El app no recalcula nada.
const props = defineProps<{ exercise: ProgressExercise }>()

interface Row {
  step: string
  label: string
  last: string
  target: string
  chipLabel: string
  chipClass: string
}

const rows = computed<Row[]>(() =>
  props.exercise.steps
    .filter((s) => s.step !== 'hold')
    .map((s, i) => {
      const chip = estadoChip(s.estado)
      return {
        step: s.step,
        label: `E${i + 1} · ${s.rungName}${s.mode === 'negativa' ? ' neg.' : ''}`,
        last: s.last === null ? '—' : unitText(s.last, props.exercise.unit, s.unilateral),
        target: s.target === null ? '—' : unitText(s.target, props.exercise.unit, s.unilateral),
        chipLabel: chip.label,
        chipClass: chip.tone === 'neutro' ? '' : `cq-chip--${chip.tone}`,
      }
    }),
)
</script>

<style scoped lang="scss">
.cq-pe {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 0;
  border-top: 1px solid var(--cq-hair2);

  &__name {
    margin: 0;
    font-family: var(--cq-display);
    font-size: 19px;
    font-weight: 600;
    color: var(--cq-cream);
  }

  &__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 10px;
    row-gap: 2px;
    align-items: center;
    font-size: 13px;
  }

  &__label {
    grid-column: 1;
    color: var(--cq-muted);
  }

  &__marks {
    grid-column: 1;
    color: var(--cq-cream);

    b {
      color: var(--cq-gold-hi);
    }
  }

  .cq-chip {
    grid-column: 2;
    grid-row: 1 / span 2;
    justify-self: end;
    font-size: 11.5px;
    padding: 5px 9px;
  }
}
</style>
