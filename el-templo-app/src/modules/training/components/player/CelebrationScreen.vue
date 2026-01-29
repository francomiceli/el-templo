<template>
  <div
    class="celebration-screen fixed-full column items-center justify-center"
    :class="{ 'fade-out': isFading }"
  >
    <div class="celebration-content column items-center q-gutter-y-md">
      <!-- Animated trophy icon -->
      <div class="icon-container" :class="{ 'pulse-animation': !isFading }">
        <q-icon name="emoji_events" size="100px" color="amber" />
      </div>

      <!-- Congratulations text -->
      <div class="text-h4 text-white text-weight-bold text-center">
        Sesion Completada!
      </div>

      <!-- Subtitle -->
      <div class="text-subtitle1 text-white-70 text-center">
        Excelente trabajo
      </div>

      <!-- Loading indicator for transition -->
      <div class="loading-dots q-mt-lg">
        <q-spinner-dots color="white" size="40px" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

interface Props {
  /** Duration before auto-advancing (default: 3500ms per CONTEXT.md) */
  duration?: number;
}

interface Emits {
  (e: 'complete'): void;
}

const props = withDefaults(defineProps<Props>(), {
  duration: 3500,
});
const emit = defineEmits<Emits>();

/** Fade-out animation state */
const isFading = ref(false);

/** Timer references for cleanup */
let displayTimer: ReturnType<typeof setTimeout> | null = null;
let fadeTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  // Display for duration, then start fade
  displayTimer = setTimeout(() => {
    isFading.value = true;
    // Complete after fade animation (0.5s)
    fadeTimer = setTimeout(() => {
      emit('complete');
    }, 500);
  }, props.duration);
});

onUnmounted(() => {
  if (displayTimer) clearTimeout(displayTimer);
  if (fadeTimer) clearTimeout(fadeTimer);
});
</script>

<style scoped lang="scss">
.celebration-screen {
  z-index: 9999;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  transition: opacity 0.5s ease-out;

  &.fade-out {
    opacity: 0;
    pointer-events: none;
  }
}

.celebration-content {
  padding: 24px;
}

.icon-container {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
}

.pulse-animation {
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
}

.text-white-70 {
  color: rgba(255, 255, 255, 0.7);
}

.loading-dots {
  opacity: 0.8;
}
</style>
