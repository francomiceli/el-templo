<template>
  <div class="cq-card cq-ex">
    <div class="cq-ex__head cq-dark">
      <h3 class="cq-ex__name">{{ index }} · {{ exercise.name }}</h3>
      <CqTemple :filled="templeFilled(values)" />
    </div>
    <div class="cq-ex__steps">
      <CqStepRow
        v-for="(step, i) in exercise.steps"
        :key="step.step"
        :step="step"
        :rungs="step.step === 'hold' ? exercise.holdRungs : exercise.rungs"
        :unit="step.step === 'hold' ? 's' : exercise.unit"
        :level="level"
        :value="values[step.step]"
        :index="i + 1"
        :busy="busy"
        @update:value="(v: number) => emit('update:value', step.step, v)"
        @change-step="(rungId: number, mode: Mode) => emit('change-step', step.step, rungId, mode)"
      />
    </div>
    <div class="cq-ex__notes">
      <p class="cq-ex__note">{{ CQ_TEXTOS.ayuda_carga }}</p>
      <p class="cq-ex__note">{{ holdHelp(level) }}</p>
      <p v-if="hasUnilateral" class="cq-ex__note">{{ CQ_TEXTOS.ayuda_unilateral }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CQ_TEXTOS, holdHelp } from '../../utils/format'
import { templeFilled } from '../../utils/todayForm'
import type { StepValues } from '../../utils/todayForm'
import type { Level, Mode, StepKey, TodayExercise } from '../../types'
import CqTemple from '../brand/CqTemple.vue'
import CqStepRow from './CqStepRow.vue'

// Fase 201 §7.1 Hoy, DA-31 (sketch 022 B `.exhead.dk`): un ejercicio con la cabecera oscura (nombre y
// templo, que se llena con los escalones cargados) y los 4 escalones Α Β Γ Ω debajo, en la card clara. Ayudas del anexo §9: `ayuda_carga` (§4.1: un número por escalón), la del hold
// final según el nivel y `ayuda_unilateral` si algún escalón se carga por lado. E1-E3 eligen
// progresión en `exercise.rungs` y el hold final en `exercise.holdRungs` (su propia escalera).
const props = defineProps<{
  exercise: TodayExercise
  /** 1, 2 o 3: posición del ejercicio en el día. */
  index: number
  level: Level
  values: StepValues
  busy?: boolean
}>()

const emit = defineEmits<{
  'update:value': [step: StepKey, value: number]
  'change-step': [step: StepKey, rungId: number, mode: Mode]
}>()

const hasUnilateral = computed(() => props.exercise.steps.some((s) => s.unilateral))
</script>

<style scoped lang="scss">
.cq-ex {
  // `.cq-card` pone gap 12: con dos clases le gana (con una sola empatan)
  &.cq-card {
    gap: 0;
  }

  // Cabecera oscura pegada arriba de la card: se come el padding de 16 px de `.cq-card`. Dos clases
  // en el mismo elemento le ganan a `.cq-root .cq-dark` (sombra y borde de la pieza oscura suelta)
  &__head.cq-dark {
    margin: -16px -16px 0;
    padding: 14px 16px;
    border: 0;
    border-radius: 16px 16px 0 0;
    box-shadow: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  &__name {
    margin: 0;
    min-width: 0;
    font-family: var(--cq-font-head);
    font-size: 17px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: normal;
    color: var(--cq-on-night);
  }

  &__steps {
    display: flex;
    flex-direction: column;
  }

  &__notes {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 12px;
    border-top: 1px solid var(--cq-line);
  }

  &__note {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.4;
    color: var(--cq-text-2);
  }
}
</style>
