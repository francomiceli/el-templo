<template>
  <span class="cq-greek" :class="`cq-greek--${size}`" aria-hidden="true">{{
    GREEK_STEP[step]
  }}</span>
</template>

<script setup lang="ts">
import { GREEK_STEP } from '../../utils/format'
import type { StepKey } from '../../types'

// Fase 201 DA-16: la letra griega del escalón (Α Β Γ y Ω del hold final) en un disco azul noche con
// doble aro (sketch 022 B `.vB .greek`). `size` md = 34 px, sm = 28 px. Es decorativa: el nombre del
// escalón va en el texto de al lado, por eso `aria-hidden`. La letra va en la fuente griega de
// Conquer (Montserrat y Cinzel no traen griego).
withDefaults(
  defineProps<{
    step: StepKey
    size?: 'md' | 'sm'
  }>(),
  { size: 'md' },
)
</script>

<style scoped lang="scss">
.cq-greek {
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cq-night);
  box-shadow:
    0 0 0 2px var(--cq-surface),
    0 0 0 3px var(--cq-deco-gold);
  font-family: var(--cq-font-greek);
  font-weight: 600;
  font-size: 17px;
  color: var(--cq-on-night-hi);

  &--sm {
    width: 28px;
    height: 28px;
    font-size: 13px;
  }
}
</style>
