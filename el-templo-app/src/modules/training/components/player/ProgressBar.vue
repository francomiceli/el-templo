<template>
  <div class="session-progress">
    <q-linear-progress
      :value="progress"
      :color="currentBlockColor"
      track-color="grey-3"
      size="8px"
      rounded
    />
    <div class="session-progress__labels">
      <span
        v-for="(label, index) in blockLabels"
        :key="label"
        :class="[
          'session-progress__label',
          { 'session-progress__label--completed': index < completedCount },
        ]"
      >
        {{ label }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BlockRole } from '../../types/session'
import { getBlockAccentColor } from '../../utils/blockColors'

interface Props {
  /** Array of completed block roles */
  completedBlocks: BlockRole[]
  /** Currently active block role */
  currentBlock: BlockRole
}

const props = defineProps<Props>()

/**
 * Block labels for 4-step progress display
 * User completes 4 blocks: Initium, Nucleus, one Deuteros, Athlos
 */
const blockLabels = ['Initium', 'Nucleus', 'Deuteros', 'Athlos']

/**
 * Number of completed blocks
 */
const completedCount = computed(() => props.completedBlocks.length)

/**
 * Progress value (0-1 scale)
 * Based on 4 blocks total
 */
const progress = computed(() => completedCount.value / 4)

/**
 * Current block accent color for progress bar fill
 */
const currentBlockColor = computed(() => getBlockAccentColor(props.currentBlock))
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.session-progress {
  padding: 8px 16px;
  background: $cream;
}

.session-progress__labels {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
}

.session-progress__label {
  font-size: 10px;
  color: rgba($primary, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-family: 'Montserrat', sans-serif;
}

.session-progress__label--completed {
  color: $secondary;
  font-weight: 600;
}
</style>
