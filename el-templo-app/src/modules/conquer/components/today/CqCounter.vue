<template>
  <div class="cq-counter">
    <button
      type="button"
      class="cq-counter__pm"
      aria-label="menos"
      :disabled="disabled || modelValue <= min"
      @click="emit('update:modelValue', Math.max(min, modelValue - 1))"
    >
      −
    </button>
    <div class="cq-counter__val cq-num" role="status" :aria-label="valueLabel">
      {{ modelValue }}<small v-if="unit"> {{ unit }}</small>
    </div>
    <button
      type="button"
      class="cq-counter__pm"
      aria-label="más"
      :disabled="disabled || modelValue >= max"
      @click="emit('update:modelValue', Math.min(max, modelValue + 1))"
    >
      +
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

// Fase 201 §7.1 Hoy, DA-31 (sketch 022 B `.ctr`): contador − valor + con botones de 48 px (S12-2,
// hitbox ≥ 44). El valor se acota entre `min` y `max`; la unidad es opcional ("reps", "s").
const props = withDefaults(
  defineProps<{
    modelValue: number
    min?: number
    max?: number
    unit?: string
    /** Texto accesible del valor, p. ej. "Escalón 1: 4 reps". */
    label?: string
    disabled?: boolean
  }>(),
  { min: 0, max: 100, unit: '', label: '', disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const valueLabel = computed(() => {
  const value = props.unit ? `${props.modelValue} ${props.unit}` : String(props.modelValue)
  return props.label ? `${props.label}: ${value}` : value
})
</script>

<style scoped lang="scss">
.cq-counter {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;

  &__pm {
    width: 48px;
    height: 48px;
    flex-shrink: 0;
    padding: 0;
    border-radius: 12px;
    border: 1.5px solid var(--cq-edge-gold);
    background: var(--cq-surface);
    color: var(--cq-night);
    font-size: 22px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;

    &:active:not(:disabled) {
      background: var(--cq-sand);
    }

    &:disabled {
      color: var(--cq-text-2);
      border-color: var(--cq-line);
      cursor: default;
    }
  }

  &__val {
    min-width: 68px;
    text-align: center;
    font-size: 26px;
    line-height: 1;

    small {
      margin-left: 2px;
      font-family: var(--cq-font-body);
      font-size: 12px;
      font-weight: 500;
      color: var(--cq-text-2);
    }
  }
}
</style>
