<template>
  <div
    class="splash-screen fixed-full column items-center justify-center"
    :class="{ 'fade-out': isFading }"
  >
    <div class="splash-content column items-center q-gutter-y-md">
      <!-- Logo placeholder -->
      <div class="logo-container">
        <q-icon name="fitness_center" size="80px" color="white" />
      </div>

      <!-- Session info -->
      <div class="session-info text-center">
        <div class="text-h6 text-white text-weight-medium">
          {{ sessionLabel }}
        </div>
      </div>

      <!-- Motivational message -->
      <div class="motivation text-center">
        <div class="text-h5 text-white text-weight-bold">
          Vamos a entrenar!
        </div>
      </div>

      <!-- Loading indicator -->
      <div class="loading-dots q-mt-lg">
        <q-spinner-dots color="white" size="40px" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

interface SessionInfo {
  /** Day name (e.g., "Lunes", "Martes") */
  day: string;
  /** Level group (e.g., "ALFA_DELTA", "SIGMA") */
  levelGroup: string;
}

interface Props {
  /** Session metadata to display */
  sessionInfo: SessionInfo;
}

interface Emits {
  (e: 'complete'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

/** Fade-out animation state */
const isFading = ref(false);

/** Timer reference for cleanup */
let splashTimer: ReturnType<typeof setTimeout> | null = null;
let fadeTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Format session info as "Lunes - ALFA_DELTA"
 */
const sessionLabel = computed(() => {
  const day = props.sessionInfo.day.charAt(0).toUpperCase() + props.sessionInfo.day.slice(1);
  const group = props.sessionInfo.levelGroup.toUpperCase().replace('_', ' ');
  return `${day} - ${group}`;
});

onMounted(() => {
  // Start fade out after 2.5 seconds
  splashTimer = setTimeout(() => {
    isFading.value = true;
    // Complete after fade animation (0.5s)
    fadeTimer = setTimeout(() => {
      emit('complete');
    }, 500);
  }, 2500);
});

onUnmounted(() => {
  // Clean up timers if component is unmounted early
  if (splashTimer) clearTimeout(splashTimer);
  if (fadeTimer) clearTimeout(fadeTimer);
});
</script>

<style scoped lang="scss">
.splash-screen {
  z-index: 9999;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  transition: opacity 0.5s ease-out;

  &.fade-out {
    opacity: 0;
    pointer-events: none;
  }
}

.splash-content {
  padding: 24px;
}

.logo-container {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
}

.session-info {
  opacity: 0.9;
}

.motivation {
  margin-top: 16px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.loading-dots {
  opacity: 0.8;
}
</style>
