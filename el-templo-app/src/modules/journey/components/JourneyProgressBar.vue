<template>
  <div class="journey-progress">
    <q-linear-progress
      :value="progress"
      :color="progressColor"
      track-color="grey-3"
      size="8px"
      rounded
    />
    <div class="journey-progress__labels">
      <span
        v-for="(label, index) in labels"
        :key="label + index"
        :class="[
          'journey-progress__label',
          { 'journey-progress__label--completed': index < completedCount },
        ]"
      >
        {{ label }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BlockRole } from '../../training/types/session'
import { getBlockAccentColor } from '../../training/utils/blockColors'

interface Props {
  /** Array of completed block roles */
  completedBlocks: BlockRole[]
  /** Currently active block role */
  currentBlock: BlockRole
  /** Labels for each block step */
  labels: string[]
  /** Total number of blocks */
  totalBlocks: number
}

const props = defineProps<Props>()

const completedCount = computed(() => props.completedBlocks.length)

const progress = computed(() => {
  if (props.totalBlocks === 0) return 0
  return completedCount.value / props.totalBlocks
})

const progressColor = computed(() => getBlockAccentColor(props.currentBlock))
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.journey-progress {
  padding: 8px 16px;
  background: $cream;
}

.journey-progress__labels {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
}

.journey-progress__label {
  font-size: 10px;
  color: rgba($primary, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-family: 'Cinzel', serif;
}

.journey-progress__label--completed {
  color: $secondary;
  font-weight: 600;
}
</style>
