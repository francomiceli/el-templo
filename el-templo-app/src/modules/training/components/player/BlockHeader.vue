<template>
  <div class="block-header" :style="headerStyle">
    <div class="block-header__left">
      <div class="block-name text-h5 text-weight-bold text-uppercase">
        {{ blockName }}
      </div>
      <div v-if="route" class="block-route text-caption text-grey-7">
        {{ route }}
      </div>
    </div>
    <div v-if="showTimer && timerDisplay" class="block-header__right">
      <div class="block-timer text-h5 text-weight-bold" :class="timerColorClass">
        {{ timerDisplay }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getBlockCSSColor } from '../../utils/blockColors';
import type { BlockRole } from '../../types/session';

interface Props {
  /** Display name of the block (e.g., "NUCLEUS", "INITIUM") */
  blockName: string;
  /** Block role for accent color lookup */
  blockRole: BlockRole;
  /** Optional route name to show below block name */
  route?: string;
  /** Formatted time text (e.g., "3/8 — 0:42", "4:23") */
  timerDisplay?: string;
  /** CSS class for timer color ('text-grey-8', 'text-amber', 'text-red') */
  timerColorClass?: string;
  /** Whether to show timer (false for Straight Sets) */
  showTimer?: boolean;
}

const props = defineProps<Props>();

/**
 * Dynamic style object for header with accent color border and background
 */
const headerStyle = computed(() => {
  const accentColor = getBlockCSSColor(props.blockRole);
  return {
    borderLeftColor: accentColor,
    backgroundColor: `${accentColor}1A`, // 10% opacity (hex alpha)
  };
});
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
  letter-spacing: 0.05em;
  line-height: 1.3;
}

.block-route {
  margin-top: 2px;
}

.block-timer {
  font-family: 'Roboto Mono', monospace;
  letter-spacing: 0.05em;
  line-height: 1.3;
  transition: color 0.3s ease;
}
</style>
