<template>
  <div class="block-chip-stack" role="group" aria-label="Bloques de la sesión">
    <button
      v-for="(block, i) in blocks"
      :key="block.blockId"
      type="button"
      class="block-chip-stack__chip"
      :class="{ 'block-chip-stack__chip--on': i === selected }"
      :aria-pressed="i === selected"
      @click="onPick(i)"
    >
      <span class="block-chip-stack__role">{{ ROLE_LABELS[block.role] }}</span>
      <span class="block-chip-stack__name">{{ blockDisplayName(block) }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ROLE_LABELS } from 'src/constants/roleLabels'
import type { Block } from '../../types/session'
import { blockDisplayName } from '../../utils/blockMeta'

// Fase 197 D-03: chips de bloque apilados (rol arriba, nombre en una línea). Siempre hay uno
// elegido: tocar el elegido emite igual y no lo deselecciona.
const props = withDefaults(
  defineProps<{
    blocks: Block[]
    selected: number
    interactive?: boolean
  }>(),
  {
    interactive: true,
  },
)

const emit = defineEmits<{
  select: [index: number]
}>()

function onPick(index: number): void {
  if (props.interactive) emit('select', index)
}
</script>

<style scoped lang="scss">
@import 'src/css/brand';
@import 'src/css/premium-card';

.block-chip-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;

  &__chip {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    min-height: 44px;
    padding: 5px 10px;
    border: 1px solid $pd-light-edge;
    border-radius: 12px;
    background: #fff;
    color: $pd-ink;
    text-align: left;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid $pd-ink;
      outline-offset: 2px;
    }

    &--on {
      background: $pd-ink;
      border-color: $pd-ink;
      color: #fff;
    }
  }

  &__role {
    @include pd-role-label;
    display: block;
    line-height: 1.2;
    // Gap 197-24 (hallazgo 9): una línea, para que los chips queden parejos a 360
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  &__chip--on &__role {
    color: $pd-cream-2;
  }

  &__name {
    display: block;
    min-width: 0;
    overflow: hidden;
    font-family: 'Geologica', sans-serif;
    font-weight: 500;
    font-size: 13px;
    line-height: 1.2;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}
</style>
