<template>
  <div class="cq-step">
    <div class="cq-step__head">
      <CqGreek :step="step.step" />
      <div class="cq-step__title">
        <b>{{ isHold ? 'Hold final' : `Escalón ${index}` }}</b>
        <span>{{ objective }}</span>
      </div>
      <span v-if="!isHold" class="cq-chip" :class="chipClass">{{ chip.label }}</span>
    </div>

    <div class="cq-step__sels">
      <select
        class="cq-select"
        aria-label="Progresión"
        :value="step.rungId"
        :disabled="busy"
        @change="onRungChange"
      >
        <option v-for="rung in rungs" :key="rung.id" :value="rung.id">{{ rung.name }}</option>
      </select>
      <select
        v-if="!isHold"
        class="cq-select"
        aria-label="Modo"
        :value="step.mode"
        :disabled="busy"
        @change="onModeChange"
      >
        <option v-for="m in MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
      </select>
    </div>

    <div class="cq-step__count">
      <div class="cq-sub cq-step__hint">{{ effortHint(level, step.step) }} · {{ failure }}</div>
      <CqCounter
        :model-value="value"
        :max="counterMax(unit, step.step)"
        :unit="unit === 's' ? 's' : 'reps'"
        :label="isHold ? 'Hold final' : `Escalón ${index}`"
        :disabled="busy"
        @update:model-value="(v: number) => emit('update:value', v)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { effortHint, estadoChip, failureHint, unitText } from '../../utils/format'
import { counterMax } from '../../utils/todayForm'
import type { Level, Mode, TodayRung, TodayStep, Unit } from '../../types'
import CqGreek from '../brand/CqGreek.vue'
import CqCounter from './CqCounter.vue'

// Fase 201 §1.4, §2, §7.1 Hoy: un escalón de la sesión. Letra griega, objetivo del motor ("objetivo
// 4 reps", "4 por lado" o "al fallo" en el hold), estado, desplegables de progresión y modo, ayuda
// por nivel y por brazos rectos, y el contador precargado. El app no calcula nada: `step.target`
// y `step.estado` vienen del API.
const MODES: readonly { value: Mode; label: string }[] = [
  { value: 'completa', label: 'Completa' },
  { value: 'negativa', label: 'Negativa' },
  { value: 'hold', label: 'Hold' },
]

const props = withDefaults(
  defineProps<{
    step: TodayStep
    rungs: TodayRung[]
    /** Unidad del ejercicio (el hold siempre va en segundos). */
    unit: Unit
    level: Level
    value: number
    /** 1, 2 o 3 (el hold no usa número). */
    index?: number
    busy?: boolean
  }>(),
  { index: 1, busy: false },
)

const emit = defineEmits<{
  'update:value': [value: number]
  'change-step': [rungId: number, mode: Mode]
}>()

const isHold = computed(() => props.step.step === 'hold')
const chip = computed(() => estadoChip(props.step.estado))
const chipClass = computed(() =>
  chip.value.tone === 'neutro' ? '' : `cq-chip--${chip.value.tone}`,
)
const failure = computed(() => failureHint(props.step.brazosRectos))

const objective = computed(() => {
  if (isHold.value) return props.step.unilateral ? 'al fallo por lado' : 'al fallo'
  if (props.step.target === null) return ''
  return `objetivo ${unitText(props.step.target, props.unit, props.step.unilateral)}`
})

function onRungChange(event: Event): void {
  const rungId = Number((event.target as HTMLSelectElement).value)
  if (rungId !== props.step.rungId) emit('change-step', rungId, props.step.mode)
}

function onModeChange(event: Event): void {
  const mode = (event.target as HTMLSelectElement).value as Mode
  if (mode !== props.step.mode) emit('change-step', props.step.rungId, mode)
}
</script>

<style scoped lang="scss">
.cq-step {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0;
  border-top: 1px solid var(--cq-hair2);

  &:first-of-type {
    border-top: 0;
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__title {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;

    b {
      font-size: 14px;
      font-weight: 500;
    }

    span {
      font-size: 12px;
      color: var(--cq-gold);
    }
  }

  &__sels {
    display: flex;
    gap: 6px;
  }

  &__count {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  &__hint {
    flex: 1;
    min-width: 0;
    font-size: 12px;
  }
}
</style>
