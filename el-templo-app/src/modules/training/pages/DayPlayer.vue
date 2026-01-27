<template>
  <q-page class="day-player">
    <!-- Initial Splash Screen Overlay -->
    <SplashScreen
      v-if="showSplash && session"
      :session-info="sessionInfo"
      @complete="onSplashComplete"
    />

    <!-- Block Transition Splash -->
    <SplashScreen
      v-else-if="showBlockTransition"
      :completed-block="transitionCompletedBlock"
      :next-block="transitionNextBlock"
      :duration="1500"
      @complete="onTransitionComplete"
    />

    <!-- Loading State -->
    <div v-else-if="isLoading" class="day-player__loading flex flex-center">
      <q-spinner-dots color="primary" size="60px" />
    </div>

    <!-- No Session State -->
    <div v-else-if="!session" class="day-player__empty flex flex-center column">
      <q-icon name="event_busy" size="80px" color="grey-4" />
      <div class="text-h6 text-grey-6 q-mt-md">No hay sesion para este dia</div>
      <q-btn
        flat
        color="primary"
        label="Volver"
        class="q-mt-lg"
        @click="navigateBack"
      />
    </div>

    <!-- Main Player Content -->
    <template v-else-if="session && player">
      <!-- Deuteros Choice Screen -->
      <DeuterosChoice
        v-if="showDeuterosChoice && deuteros1Block && deuteros2Block"
        :deuteros1="deuteros1Block"
        :deuteros2="deuteros2Block"
        @select="onDeuterosSelect"
      />

      <!-- Normal Block View -->
      <template v-else>
        <!-- Header with info and timer -->
        <div class="day-player__header">
          <div class="day-player__header-left">
            <q-btn
              flat
              round
              dense
              icon="arrow_back"
              color="grey-8"
              @click="handleBackNavigation"
            />
            <div class="day-player__header-info q-ml-sm">
              <div class="text-subtitle1 text-weight-medium">{{ dayName }}</div>
              <div class="text-caption text-grey-7">{{ routeName }}</div>
            </div>
          </div>
          <div class="day-player__header-right">
            <div class="day-player__timer text-h6 text-weight-bold">
              {{ formattedTime }}
            </div>
          </div>
        </div>

        <!-- Progress Bar -->
        <ProgressBar
          v-if="currentBlock"
          :completed-blocks="completedBlocks"
          :current-block="currentBlock.role"
        />

        <!-- Video Area -->
        <VideoPlaceholder
          :video-url="currentExerciseVideoUrl"
        />

        <!-- Block Content -->
        <div class="day-player__content">
          <!-- Block Header -->
          <BlockHeader
            v-if="currentBlock"
            :block-name="currentBlockName"
            :block-role="currentBlock.role"
            :route="currentBlock.route"
          />

          <!-- Exercise List -->
          <ExerciseList
            v-if="currentBlock"
            :exercises="currentBlock.exercises"
            :block-role="currentBlock.role"
            :selected-index="selectedExerciseIndex"
            @update:selected-index="onExerciseSelect"
          />
        </div>

        <!-- Complete Block Button -->
        <div class="day-player__action">
          <q-btn
            color="primary"
            unelevated
            :label="completeButtonLabel"
            class="full-width"
            size="lg"
            @click="completeBlock"
          />
        </div>
      </template>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import { useQuasar } from 'quasar';

// Components
import SplashScreen from '../components/player/SplashScreen.vue';
import DeuterosChoice from '../components/player/DeuterosChoice.vue';
import ProgressBar from '../components/player/ProgressBar.vue';
import VideoPlaceholder from '../components/player/VideoPlaceholder.vue';
import BlockHeader from '../components/player/BlockHeader.vue';
import ExerciseList from '../components/player/ExerciseList.vue';

// Composables and Stores
import { useSessionPlayer } from '../composables/useSessionPlayer';
import { useWakeLock } from '../composables/useWakeLock';
import { useWeekStore } from '../stores/weekStore';

// Utils
import { getRouteName } from '../utils/routeNames';

/**
 * Day Player Page
 *
 * Main guided workout experience featuring:
 * - Sequential 4-block flow (Initium -> Nucleus -> Deuteros choice -> Deuteros -> Athlos)
 * - Visual block identity with accent colors
 * - Exercise list with video display
 * - Progress tracking and persistence
 * - Wake lock during active session
 * - Resume capability after leaving
 */

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const weekStore = useWeekStore();
const wakeLock = useWakeLock();

// Route parameter
const dateParam = computed(() => route.params.date as string);

// Week day and session data from store
const weekDay = computed(() =>
  weekStore.weekDays.find(day => day.date === dateParam.value)
);
const session = computed(() => weekDay.value?.session ?? null);

// Reactive state
const splashDismissed = ref(false);
const isInitialized = ref(false);

// Block transition splash state
const showBlockTransition = ref(false);
const transitionCompletedBlock = ref('');
const transitionNextBlock = ref('');

// Session player composable (created when session is available)
const player = computed(() => {
  if (!session.value) return null;
  return useSessionPlayer(session.value);
});

// Computed display states
const isLoading = computed(() => !session.value && !weekDay.value);

const showSplash = computed(() =>
  !splashDismissed.value && session.value !== null
);

const showDeuterosChoice = computed(() => {
  if (!player.value) return false;
  // Show when splash dismissed, past Nucleus (index 2), and no Deuteros choice yet
  return (
    splashDismissed.value &&
    player.value.needsDeuterosChoice.value
  );
});

// Session info for splash screen
const sessionInfo = computed(() => {
  if (!session.value) {
    return { day: '', levelGroup: '' };
  }
  return {
    day: session.value.day,
    levelGroup: session.value.levelGroup,
  };
});

// Header computed values
const dayName = computed(() => {
  if (!weekDay.value) return '';
  // Capitalize first letter of day name
  const name = weekDay.value.dayName;
  return name.charAt(0).toUpperCase() + name.slice(1);
});

const routeName = computed(() => {
  if (!player.value?.currentBlock.value) return '';
  return getRouteName(player.value.currentBlock.value.route);
});

// Timer display
const formattedTime = computed(() => {
  if (!player.value) return '00:00';
  const seconds = player.value.elapsedSeconds.value;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
});

// Current block info
const currentBlockName = computed(() => {
  if (!player.value?.currentBlock.value) return '';
  const role = player.value.currentBlock.value.role;
  // Map role to display name
  const names: Record<string, string> = {
    INITIUM: 'Initium',
    NUCLEUS: 'Nucleus',
    DEUTEROS_1: 'Deuteros',
    DEUTEROS_2: 'Deuteros',
    ATHLOS_EPIKOS: 'Athlos',
  };
  return names[role] || role;
});

// Current exercise video URL (placeholder for now)
const currentExerciseVideoUrl = computed(() => {
  // Video URLs will be added when exercise videos are available
  return null;
});

// Expose player state for template (with null safety)
const currentBlock = computed(() => player.value?.currentBlock.value ?? null);
const completedBlocks = computed(() => player.value?.completedBlocks.value ?? []);
const selectedExerciseIndex = computed(() => player.value?.selectedExerciseIndex.value ?? 0);
const deuteros1Block = computed(() => player.value?.deuteros1Block.value ?? null);
const deuteros2Block = computed(() => player.value?.deuteros2Block.value ?? null);

// Complete button label
const completeButtonLabel = computed(() => {
  if (!player.value) return 'Completar Bloque';
  if (player.value.isSessionComplete.value) {
    return 'Sesion Completada!';
  }
  return `Completar ${currentBlockName.value}`;
});

// Has unsaved progress (for navigation guard)
const hasUnsavedProgress = computed(() => {
  if (!player.value) return false;
  // Consider progress unsaved if timer is running and not at beginning
  return (
    player.value.isTimerRunning.value &&
    (player.value.completedBlocks.value.length > 0 ||
      player.value.currentBlockIndex.value > 0 ||
      player.value.elapsedSeconds.value > 0)
  );
});

// Event handlers
function onSplashComplete(): void {
  splashDismissed.value = true;
  // Start timer and request wake lock
  if (player.value) {
    player.value.startTimer();
  }
  wakeLock.requestWakeLock();
}

function onDeuterosSelect(choice: 'DEUTEROS_1' | 'DEUTEROS_2'): void {
  if (player.value) {
    player.value.selectDeuteros(choice);

    // Show transition to selected Deuteros block
    transitionCompletedBlock.value = 'Nucleus';
    transitionNextBlock.value = 'Deuteros';
    showBlockTransition.value = true;
  }
}

/** Get display name for a block role */
function getBlockDisplayName(role: string): string {
  const names: Record<string, string> = {
    INITIUM: 'Initium',
    NUCLEUS: 'Nucleus',
    DEUTEROS_1: 'Deuteros',
    DEUTEROS_2: 'Deuteros',
    ATHLOS_EPIKOS: 'Athlos',
  };
  return names[role] || role;
}

/** Get the next block after completing current one */
function getNextBlockName(): string {
  if (!player.value) return '';

  const currentRole = player.value.currentBlock.value?.role;
  if (!currentRole) return '';

  // If completing NUCLEUS, next is Deuteros choice (no specific block yet)
  if (currentRole === 'NUCLEUS' && !player.value.deuterosChoice.value) {
    return 'Deuteros';
  }

  // Otherwise, look at playable blocks to find next
  const blocks = player.value.playableBlocks.value;
  const currentIndex = player.value.currentBlockIndex.value;
  const nextBlock = blocks[currentIndex + 1];

  if (nextBlock) {
    return getBlockDisplayName(nextBlock.role);
  }

  return '';
}

async function completeBlock(): Promise<void> {
  if (!player.value) return;

  // Check if session is complete
  if (player.value.isSessionComplete.value) {
    // Session already complete - navigate back
    await finishSession();
    return;
  }

  // Get current block name before completing
  const completedName = currentBlockName.value;
  const nextName = getNextBlockName();

  // Complete current block
  await player.value.completeBlock();

  // Check if session just completed
  if (player.value.isSessionComplete.value) {
    await finishSession();
    return;
  }

  // If going to Deuteros choice, don't show transition splash
  if (player.value.needsDeuterosChoice.value) {
    return;
  }

  // Show transition splash for next block
  transitionCompletedBlock.value = completedName;
  transitionNextBlock.value = nextName;
  showBlockTransition.value = true;
}

function onTransitionComplete(): void {
  showBlockTransition.value = false;
  transitionCompletedBlock.value = '';
  transitionNextBlock.value = '';
}

async function finishSession(): Promise<void> {
  // Release wake lock
  await wakeLock.releaseWakeLock();

  // Clear progress
  if (player.value) {
    await player.value.clearProgress();
  }

  // Mark day as completed in week store
  if (dateParam.value) {
    weekStore.markDayCompleted(dateParam.value);
  }

  // Show completion toast
  $q.notify({
    type: 'positive',
    message: 'Sesion completada!',
    icon: 'check_circle',
    position: 'top',
    timeout: 2000,
  });

  // Navigate back to weekly view
  router.push({ name: 'training' });
}

function onExerciseSelect(index: number): void {
  if (player.value) {
    player.value.selectExercise(index);
  }
}

function navigateBack(): void {
  router.push({ name: 'training' });
}

async function handleBackNavigation(): Promise<void> {
  if (hasUnsavedProgress.value) {
    // Show confirmation dialog
    $q.dialog({
      title: 'Salir del entrenamiento?',
      message: 'Tu progreso se guardara y podras continuar despues.',
      cancel: {
        label: 'Cancelar',
        flat: true,
      },
      ok: {
        label: 'Salir',
        color: 'negative',
        flat: true,
      },
      persistent: true,
    }).onOk(async () => {
      // Pause timer and release wake lock
      if (player.value) {
        player.value.pauseTimer();
      }
      await wakeLock.releaseWakeLock();
      navigateBack();
    });
  } else {
    navigateBack();
  }
}

// Navigation guard
onBeforeRouteLeave((_to, _from, next) => {
  if (hasUnsavedProgress.value) {
    $q.dialog({
      title: 'Salir del entrenamiento?',
      message: 'Tu progreso se guardara y podras continuar despues.',
      cancel: {
        label: 'Cancelar',
        flat: true,
      },
      ok: {
        label: 'Salir',
        color: 'negative',
        flat: true,
      },
      persistent: true,
    }).onOk(async () => {
      if (player.value) {
        player.value.pauseTimer();
      }
      await wakeLock.releaseWakeLock();
      next();
    }).onCancel(() => {
      next(false);
    });
  } else {
    next();
  }
});

// Initialize player state when session becomes available
watch(session, async (newSession) => {
  if (newSession && !isInitialized.value) {
    // Need to wait for player to be created
    await new Promise(resolve => setTimeout(resolve, 0));
    if (player.value) {
      await player.value.initialize();
      // Restore splash state if we have progress
      if (player.value.elapsedSeconds.value > 0 ||
          player.value.completedBlocks.value.length > 0) {
        splashDismissed.value = true;
        // Resume timer
        player.value.startTimer();
        wakeLock.requestWakeLock();
      }
    }
    isInitialized.value = true;
  }
}, { immediate: true });

// Note: beforeunload handler removed as it's disruptive on page reload
// Navigation guard (onBeforeRouteLeave) handles in-app navigation protection
</script>

<style scoped lang="scss">
.day-player {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fafafa;
}

.day-player__loading,
.day-player__empty {
  flex: 1;
  padding: 24px;
}

.day-player__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: white;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.day-player__header-left {
  display: flex;
  align-items: center;
}

.day-player__header-info {
  line-height: 1.3;
}

.day-player__header-right {
  display: flex;
  align-items: center;
}

.day-player__timer {
  font-family: 'Roboto Mono', monospace;
  color: #424242;
}

.day-player__content {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 80px; // Space for fixed button
}

.day-player__action {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  background: white;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  z-index: 100;
}
</style>
