<template>
  <span class="cq-greek" aria-hidden="true">{{ GREEK_STEP[step] }}</span>
</template>

<script setup lang="ts">
import { GREEK_STEP } from '../../utils/format'
import type { StepKey } from '../../types'

// Fase 201 D-09: la letra griega del escalón (Α Β Γ y Ω del hold final) en un círculo dorado. Es
// decorativa: el nombre del escalón va en el texto de al lado, por eso `aria-hidden`.
defineProps<{
  step: StepKey
}>()
</script>

<style scoped lang="scss">
.cq-greek {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid var(--cq-hair);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--cq-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--cq-gold-hi);
}
</style>
