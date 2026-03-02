<template>
  <div class="block-header" :style="headerStyle">
    <div class="block-header__left">
      <div class="block-name text-h5 text-weight-bold text-uppercase">
        {{ blockName }}
      </div>
      <div v-if="route || intensity" class="block-route text-caption">
        <span v-if="route">{{ route }}</span>
        <span v-if="route && intensity"> · </span>
        <span v-if="intensity">{{ intensity }}%</span>
      </div>
    </div>
    <div v-if="formatExplanation" class="block-header__right">
      <q-btn flat round dense icon="info_outline" color="grey-7" @click="showFormatDialog = true" />
      <q-dialog v-model="showFormatDialog">
        <q-card style="min-width: 280px; max-width: 400px">
          <q-card-section class="row items-center q-pb-none">
            <div class="text-h6">{{ formatExplanation.name }}</div>
            <q-space />
            <q-btn icon="close" flat round dense v-close-popup />
          </q-card-section>
          <q-card-section>
            {{ formatExplanation.description }}
          </q-card-section>
        </q-card>
      </q-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { getBlockCSSColor } from '../../utils/blockColors'
import { getFormatExplanation } from '../../utils/formatExplanations'
import type { BlockRole } from '../../types/session'

interface Props {
  /** Display name of the block (e.g., "NUCLEUS", "INITIUM") */
  blockName: string
  /** Block role for accent color lookup */
  blockRole: BlockRole
  /** Optional route name to show below block name */
  route?: string
  /** Optional intensity percentage (e.g., 85 for 85%) */
  intensity?: number
  /** Optional format string (e.g., "EMOM", "AMRAP") */
  format?: string
}

const props = defineProps<Props>()

const showFormatDialog = ref(false)

/**
 * Get format explanation if available
 */
const formatExplanation = computed(() => {
  return getFormatExplanation(props.format)
})

/**
 * Dynamic style object for header with accent color border and background
 */
const headerStyle = computed(() => {
  const accentColor = getBlockCSSColor(props.blockRole)
  return {
    borderLeftColor: accentColor,
    backgroundColor: `${accentColor}1A`, // 10% opacity (hex alpha)
  }
})
</script>

<style scoped lang="scss">
.block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px 8px 16px;
  border-left: 4px solid;
  border-radius: 0 8px 8px 0;
  margin-bottom: 12px;
}

.block-header__left {
  flex: 1;
  min-width: 0; // Allow text truncation if needed
}

.block-header__right {
  flex-shrink: 0;
  margin-left: 16px;
}

.block-name {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  letter-spacing: 0.1em;
  line-height: 1.3;
}

.block-route {
  margin-top: 2px;
  color: #b89b5e;
  font-weight: 500;
  letter-spacing: 0.05em;
}
</style>
