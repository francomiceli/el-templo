<template>
  <div class="cq-pe">
    <h3 class="cq-pe__name">{{ exercise.name }}</h3>

    <div v-for="row in rows" :key="row.step" class="cq-pe__row">
      <CqGreek :step="row.step" size="sm" />
      <div class="cq-pe__text">
        <span class="cq-pe__label">{{ row.label }}</span>
        <span class="cq-pe__marks">
          {{ row.last }} →
          <b class="cq-num">{{ row.target }}</b>
        </span>
      </div>
      <span class="cq-chip" :class="row.chipClass">{{ row.chipLabel }}</span>
    </div>

    <template v-if="exercise.e1Curve.length > 0">
      <CqSparkline :values="exercise.e1Curve" :unit="exercise.unit" />
      <p class="cq-sub cq-pe__curve">Escalón 1, últimas {{ exercise.e1Curve.length }} sesiones</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { estadoChip, unitText } from '../../utils/format'
import type { ProgressExercise, StepKey } from '../../types'
import CqGreek from '../brand/CqGreek.vue'
import CqSparkline from './CqSparkline.vue'

// Fase 201 §7.1 Progreso, DA-35 (sketch 022 B `.pe`): un ejercicio con sus escalones E1-E3. Por cada
// uno: el disco griego, el peldaño (con "neg." si es negativa), la última marca → el próximo objetivo
// que calculó el motor y el chip de estado (verde solo "Subir"). Abajo, la curva del E1. El app no
// recalcula nada.
const props = defineProps<{ exercise: ProgressExercise }>()

interface Row {
  step: StepKey
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
  padding-top: 12px;
  border-top: 1px solid var(--cq-line);

  &__name {
    // Quasar da estilos globales a h1-h6: se fijan todos los que importan
    margin: 0 0 6px;
    font-family: var(--cq-font-head);
    font-size: 15px;
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: normal;
    color: var(--cq-text);
  }

  // El aro de 3 px de la letra griega sobresale del disco: el gap lo deja respirar
  &__row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
  }

  &__text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    font-size: 14px;
    color: var(--cq-text);
    overflow-wrap: anywhere;
  }

  &__marks {
    font-size: 13px;
    color: var(--cq-text-2);

    // Más específico que `.cq-root .cq-num` (0,2,0): el número va un poco más grande que el texto
    .cq-num {
      font-size: 15px;
    }
  }

  // `.cq-sub` (0,2,0) empata con una sola clase scoped: se duplica la clase
  &__curve.cq-sub {
    margin-top: 4px;
    font-size: 12px;
  }
}
</style>
