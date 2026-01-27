<template>
  <div v-if="!isComplete" class="timer-controls">
    <!-- Not started state: Show "Iniciar Timer" button -->
    <q-btn
      v-if="!isRunning && !wasStarted"
      class="full-width"
      :color="buttonColor"
      size="lg"
      label="Iniciar Timer"
      unelevated
      @click="handleStart"
    />

    <!-- Running state: Show stop button -->
    <q-btn
      v-else-if="isRunning"
      round
      flat
      :color="buttonColor"
      icon="pause"
      size="lg"
      class="stop-button"
      @click="handleStop"
    />

    <!-- Stopped state: Show play button -->
    <q-btn
      v-else
      round
      flat
      :color="buttonColor"
      icon="play_arrow"
      size="lg"
      class="play-button"
      @click="handlePlay"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getBlockAccentColor } from '../../utils/blockColors';
import type { BlockRole } from '../../types/session';

interface Props {
  /** Timer is currently ticking */
  isRunning: boolean;
  /** Timer has finished (hide controls) */
  isComplete: boolean;
  /** Whether the timer has been started (distinguishes "not started" from "stopped") */
  wasStarted: boolean;
  /** Block role for accent color */
  blockRole: BlockRole;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /** User tapped stop */
  stop: [];
  /** User tapped play/resume */
  play: [];
  /** User tapped start (initial start) */
  start: [];
}>();

/**
 * Button color based on block role
 */
const buttonColor = computed(() => getBlockAccentColor(props.blockRole));

/**
 * Handle initial timer start
 */
function handleStart() {
  emit('start');
}

/**
 * Handle timer stop/pause
 */
function handleStop() {
  emit('stop');
}

/**
 * Handle timer resume
 */
function handlePlay() {
  emit('play');
}
</script>

<style scoped lang="scss">
.timer-controls {
  display: flex;
  justify-content: center;
  align-items: center;
}

.stop-button,
.play-button {
  width: 48px;
  height: 48px;
}
</style>
