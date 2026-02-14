<template>
  <BlockChoice
    title="Elige tu bloque Deuteros"
    :options="deuterosOptions"
    confirm-button-prefix="Comenzar"
    @select="onSelect"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BlockChoice from './player/BlockChoice.vue'
import type { Block } from '../types/session'

interface Props {
  /** DEUTEROS_1 block data */
  deuteros1Block: Block
  /** DEUTEROS_2 block data */
  deuteros2Block: Block
}

interface Emits {
  (e: 'select', choiceId: 'DEUTEROS_1' | 'DEUTEROS_2'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

/**
 * Build options array for BlockChoice from the two Deuteros blocks
 */
const deuterosOptions = computed(() => {
  return [
    {
      id: 'DEUTEROS_1',
      label: 'Deuteros 1',
      block: props.deuteros1Block,
    },
    {
      id: 'DEUTEROS_2',
      label: 'Deuteros 2',
      block: props.deuteros2Block,
    },
  ]
})

function onSelect(choiceId: string): void {
  if (choiceId === 'DEUTEROS_1' || choiceId === 'DEUTEROS_2') {
    emit('select', choiceId)
  }
}
</script>
