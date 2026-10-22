<template>
  <div class="cq-card cq-ex">
    <div class="cq-row cq-ex__head">
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
    <div class="cq-sub cq-ex__note">{{ CQ_TEXTOS.ayuda_carga }}</div>
    <div class="cq-sub cq-ex__note">{{ holdHelp(level) }}</div>
    <div v-if="hasUnilateral" class="cq-sub cq-ex__note">{{ CQ_TEXTOS.ayuda_unilateral }}</div>
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

// Fase 201 §7.1 Hoy: un ejercicio con su templo (se llena con los escalones cargados) y los 4
// escalones Α Β Γ Ω. Ayudas del anexo §9: `ayuda_carga` (§4.1: un número por escalón), la del hold
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
  gap: 4px;

  &__name {
    margin: 0;
    min-width: 0;
    font-family: var(--cq-display);
    font-size: 21px;
    font-weight: 600;
    letter-spacing: 0.04em;
    line-height: 1.1;
    color: var(--cq-gold-hi);
  }

  &__steps {
    display: flex;
    flex-direction: column;
  }

  &__note {
    text-align: center;
  }
}
</style>
