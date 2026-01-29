<template>
  <div
    class="splash-screen fixed-full column items-center justify-center"
    :class="{ 'fade-out': isFading }"
  >
    <div class="splash-content column items-center q-gutter-y-md">
      <!-- Logo/Icon -->
      <div class="logo-container">
        <q-icon :name="iconName" size="80px" color="white" />
      </div>

      <!-- Session info or completed block -->
      <div class="session-info text-center">
        <div class="text-h6 text-white text-weight-medium">
          {{ topLabel }}
        </div>
      </div>

      <!-- Motivational message or next block -->
      <div class="motivation text-center">
        <div class="text-h5 text-white text-weight-bold">
          {{ mainMessage }}
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
import { getLevelGreek, formatLevelName } from '../../utils/levelDisplay';

interface SessionInfo {
  /** Day name (e.g., "Lunes", "Martes") */
  day: string;
  /** Member's level (e.g., "alfa", "delta", "sigma", "omega") */
  level: string;
}

interface Props {
  /** Session metadata to display (for initial splash) */
  sessionInfo?: SessionInfo;
  /** Completed block name (for transition splash) */
  completedBlock?: string;
  /** Next block name (for transition splash) */
  nextBlock?: string;
  /** Splash duration in ms (default: 2500) */
  duration?: number;
}

interface Emits {
  (e: 'complete'): void;
}

const props = withDefaults(defineProps<Props>(), {
  duration: 2500,
});
const emit = defineEmits<Emits>();

/** Whether this is a block transition (vs initial splash) */
const isTransition = computed(() => !!props.nextBlock || !!props.completedBlock);

/** Icon to display */
const iconName = computed(() => {
  if (isTransition.value) {
    return 'check_circle';
  }
  return 'fitness_center';
});

/** Top label text */
const topLabel = computed(() => {
  if (props.completedBlock) {
    return `${props.completedBlock} completado!`;
  }
  if (props.sessionInfo) {
    const day = props.sessionInfo.day.charAt(0).toUpperCase() + props.sessionInfo.day.slice(1);
    const greek = getLevelGreek(props.sessionInfo.level);
    const levelName = formatLevelName(props.sessionInfo.level);
    return `${day} - ${greek} ${levelName}`;
  }
  return '';
});

/** Main message text */
const mainMessage = computed(() => {
  if (props.nextBlock) {
    return `Siguiente: ${props.nextBlock}`;
  }
  return 'Vamos a entrenar!';
});

/** Fade-out animation state */
const isFading = ref(false);

/** Timer reference for cleanup */
let splashTimer: ReturnType<typeof setTimeout> | null = null;
let fadeTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  // Start fade out after duration
  splashTimer = setTimeout(() => {
    isFading.value = true;
    // Complete after fade animation (0.5s)
    fadeTimer = setTimeout(() => {
      emit('complete');
    }, 500);
  }, props.duration);
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
  background: linear-gradient(135deg, #1a2a3e 0%, #2c3e5c 50%, #1a2a3e 100%);
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
  background: rgba(184, 149, 108, 0.2);
  border: 2px solid rgba(184, 149, 108, 0.4);
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
  font-family: 'Cinzel', Georgia, serif;
  letter-spacing: 0.05em;
}

.loading-dots {
  opacity: 0.8;
}
</style>
