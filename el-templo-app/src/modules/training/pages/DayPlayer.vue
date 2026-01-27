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
            :show-timer="hasTimer && timerStarted"
            :timer-display="protocolTimer?.displayText.value"
            :timer-color-class="protocolTimer?.timerColorClass.value"
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

        <!-- Action Area: Complete Block or Timer Controls -->
        <div class="day-player__action">
          <!-- Straight Sets: existing Complete Block button -->
          <q-btn
            v-if="!hasTimer"
            color="primary"
            unelevated
            :label="completeButtonLabel"
            class="full-width"
            size="lg"
            @click="completeBlock"
          />

          <!-- Timed blocks: Timer controls (start/stop/play) -->
          <TimerControls
            v-else
            :is-running="protocolTimer?.isRunning.value ?? false"
            :is-complete="protocolTimer?.isComplete.value ?? false"
            :was-started="timerStarted"
            :block-role="currentBlock?.role ?? 'NUCLEUS'"
            @start="onTimerStart"
            @stop="onTimerStop"
            @play="onTimerResume"
          />

          <!-- For Time: show "Listo!" button while timer is running -->
          <q-btn
            v-if="hasTimer && protocolType === 'FOR_TIME' && timerStarted && protocolTimer?.isRunning.value"
            color="positive"
            unelevated
            label="Listo!"
            class="full-width q-mt-sm"
            size="lg"
            icon="check"
            @click="onForTimeDone"
          />
        </div>
      </template>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import { useQuasar } from 'quasar';

// Components
import SplashScreen from '../components/player/SplashScreen.vue';
import DeuterosChoice from '../components/player/DeuterosChoice.vue';
import ProgressBar from '../components/player/ProgressBar.vue';
import VideoPlaceholder from '../components/player/VideoPlaceholder.vue';
import BlockHeader from '../components/player/BlockHeader.vue';
import ExerciseList from '../components/player/ExerciseList.vue';
import TimerControls from '../components/player/TimerControls.vue';

// Composables and Stores
import { useSessionPlayer } from '../composables/useSessionPlayer';
import { useProtocolTimer, type ProtocolTimerReturn } from '../composables/useProtocolTimer';
import { useTimerAudio } from '../composables/useTimerAudio';
import { useWakeLock } from '../composables/useWakeLock';
import { useWeekStore } from '../stores/weekStore';
import { useSessionPlayerStore } from '../stores/sessionPlayerStore';
import { useWeekData } from '../composables/useWeekData';
import { getWeekDates, formatDayName, getDateState } from '../composables/useDateNavigation';

// Utils
import { getRouteName } from '../utils/routeNames';
import { parseProtocolType, getProtocolParams } from '../utils/timerFormats';
import type { WeekDay } from '../types/session';

// Capacitor
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';

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
const sessionPlayerStore = useSessionPlayerStore();
const wakeLock = useWakeLock();
const { sessions: weekSessions, loading: weekLoading, fetchWeekSessions } = useWeekData();

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

// Protocol timer state
const timerAudio = useTimerAudio();
const protocolTimer = shallowRef<ProtocolTimerReturn | null>(null);
const timerStarted = ref(false);
let appStateListener: PluginListenerHandle | null = null;

/**
 * Protocol type of the current block (EMOM, AMRAP, FOR_TIME, STRAIGHT_SETS)
 */
const protocolType = computed(() => {
  if (!currentBlock.value) return 'STRAIGHT_SETS';
  return parseProtocolType(currentBlock.value.format);
});

/**
 * Whether the current block uses a protocol timer (not STRAIGHT_SETS)
 */
const hasTimer = computed(() => protocolType.value !== 'STRAIGHT_SETS');

// Session player composable (created when session is available)
const player = computed(() => {
  if (!session.value) return null;
  return useSessionPlayer(session.value);
});

// Computed display states
const isLoading = computed(() => weekLoading.value || (!session.value && !weekDay.value));

/**
 * Load week data from API if store is empty (e.g., after page refresh)
 */
async function loadWeekDataIfEmpty() {
  // Skip if store already has data for the requested date
  if (weekDay.value) return;

  // Skip if already loading
  if (weekLoading.value) return;

  try {
    // Get dates for current week (Monday-Sunday)
    const dates = getWeekDates();

    // Fetch sessions for all days
    await fetchWeekSessions(dates);

    // Build WeekDay objects combining calendar info + session data
    const weekDays: WeekDay[] = dates.map((date) => {
      const dateObj = new Date(date + 'T00:00:00');
      const dayOfWeek = dateObj.getDay();
      const sessionData = weekSessions.value.get(date) || null;

      // TODO: Get completed dates from user activity store
      const completedDates: string[] = [];

      return {
        date,
        dayName: formatDayName(date),
        dayOfWeek,
        state: getDateState(date, completedDates),
        session: sessionData,
      };
    });

    // Update store with week data
    weekStore.setWeekDays(weekDays);
  } catch (err) {
    console.error('Failed to load week data:', err);
  }
}

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

  // Show transition splash for next block (including before Deuteros choice)
  transitionCompletedBlock.value = completedName;
  transitionNextBlock.value = player.value.needsDeuterosChoice.value
    ? 'Elige Deuteros'
    : nextName;
  showBlockTransition.value = true;
}

function onTransitionComplete(): void {
  showBlockTransition.value = false;
  transitionCompletedBlock.value = '';
  transitionNextBlock.value = '';
}

// Protocol timer event handlers

/**
 * Start protocol timer on user tap ("Iniciar Timer")
 */
function onTimerStart(): void {
  timerAudio.unlockAudio(); // Unlock audio on first user interaction
  protocolTimer.value?.start();
  timerStarted.value = true;

  // Persist protocol timer state for reload recovery
  const dayId = session.value?.dayId;
  if (dayId) {
    void sessionPlayerStore.saveProgress(dayId, {
      protocolTimerStartedAt: Date.now(),
      protocolTimerAccumulatedMs: 0,
    });
  }
}

/**
 * Stop/pause protocol timer
 */
function onTimerStop(): void {
  // Calculate accumulated ms before stopping
  const dayId = session.value?.dayId;
  if (dayId) {
    void sessionPlayerStore.loadProgress(dayId).then((progress) => {
      const startedAt = progress.protocolTimerStartedAt;
      const prevAccumulated = progress.protocolTimerAccumulatedMs;
      const newAccumulated = startedAt
        ? prevAccumulated + (Date.now() - startedAt)
        : prevAccumulated;
      void sessionPlayerStore.saveProgress(dayId, {
        protocolTimerStartedAt: null,
        protocolTimerAccumulatedMs: newAccumulated,
      });
    });
  }
  protocolTimer.value?.stop();
}

/**
 * Resume protocol timer after stop
 */
function onTimerResume(): void {
  protocolTimer.value?.resume();

  // Persist new start timestamp
  const dayId = session.value?.dayId;
  if (dayId) {
    void sessionPlayerStore.saveProgress(dayId, {
      protocolTimerStartedAt: Date.now(),
    });
  }
}

/**
 * Handle "Listo!" button for FOR_TIME protocol
 * Stops timer and auto-completes the block
 */
function onForTimeDone(): void {
  protocolTimer.value?.stop();
  handleTimerComplete();
}

/**
 * Handle timer auto-completion (EMOM/AMRAP finish, or FOR_TIME "Listo!")
 * Same flow as completeBlock but triggered by timer events
 */
async function handleTimerComplete(): Promise<void> {
  if (!player.value) return;

  const completedName = currentBlockName.value;
  const nextName = getNextBlockName();

  // Cleanup current timer
  protocolTimer.value?.cleanup();
  protocolTimer.value = null;
  timerStarted.value = false;

  // Clear protocol timer persistence
  const dayId = session.value?.dayId;
  if (dayId) {
    void sessionPlayerStore.saveProgress(dayId, {
      protocolTimerStartedAt: null,
      protocolTimerAccumulatedMs: 0,
    });
  }

  await player.value.completeBlock();

  if (player.value.isSessionComplete.value) {
    await finishSession();
    return;
  }

  // Show transition splash
  transitionCompletedBlock.value = completedName;
  transitionNextBlock.value = player.value.needsDeuterosChoice.value
    ? 'Elige Deuteros'
    : nextName;
  showBlockTransition.value = true;
}

/**
 * Restore protocol timer state after page reload
 * Calculates total elapsed ms from persisted timestamps and resumes the timer
 */
async function restoreProtocolTimer(dayId: string): Promise<void> {
  const progress = await sessionPlayerStore.loadProgress(dayId);
  const { protocolTimerStartedAt, protocolTimerAccumulatedMs } = progress;

  // No timer was active
  if (!protocolTimerStartedAt && protocolTimerAccumulatedMs === 0) return;

  // Create the timer for current block
  const block = player.value?.currentBlock.value;
  if (!block) return;

  const params = getProtocolParams(block);
  if (params.type === 'STRAIGHT_SETS') return;

  protocolTimer.value = useProtocolTimer(params, timerAudio);
  protocolTimer.value.onComplete(() => handleTimerComplete());

  if (protocolTimerStartedAt) {
    // Timer was running — calculate total offset and resume
    const totalMs = protocolTimerAccumulatedMs + (Date.now() - protocolTimerStartedAt);
    protocolTimer.value.startWithOffset(totalMs);
    timerStarted.value = true;
  } else if (protocolTimerAccumulatedMs > 0) {
    // Timer was stopped — restore in stopped state with correct display
    protocolTimer.value.startWithOffset(protocolTimerAccumulatedMs);
    // Immediately stop so user sees Play button with correct time
    protocolTimer.value.stop();
    timerStarted.value = true;
  }
}

/**
 * Create a protocol timer for the given block (if it's timed)
 */
function createProtocolTimerForBlock(): void {
  // Cleanup old timer
  protocolTimer.value?.cleanup();
  protocolTimer.value = null;
  timerStarted.value = false;

  // Create new timer for new block (if timed)
  const block = player.value?.currentBlock.value;
  if (block) {
    const params = getProtocolParams(block);
    if (params.type !== 'STRAIGHT_SETS') {
      protocolTimer.value = useProtocolTimer(params, timerAudio);
      protocolTimer.value.onComplete(() => handleTimerComplete());
    }
  }
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
        // Resume session timer
        player.value.startTimer();
        wakeLock.requestWakeLock();

        // Restore protocol timer if it was active
        await restoreProtocolTimer(newSession.dayId);
      }
    }
    isInitialized.value = true;
  }
}, { immediate: true });


// Watch block index to recreate protocol timer when advancing blocks
watch(() => player.value?.currentBlockIndex.value, (newIndex, oldIndex) => {
  if (newIndex !== undefined && newIndex !== oldIndex) {
    createProtocolTimerForBlock();
  }
});

// Load week data on mount if store is empty (handles F5 refresh)
// Also register background detection for protocol timer auto-stop
onMounted(async () => {
  loadWeekDataIfEmpty();

  // Background detection - auto-stop protocol timer when app goes to background
  try {
    appStateListener = await App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive && protocolTimer.value?.isRunning.value) {
        protocolTimer.value.stop();
      }
      // Session timer keeps running (per phase 8 context decision)
    });
  } catch {
    // App plugin not available on web - that's fine
  }
});

// Cleanup player and protocol timer on unmount
onUnmounted(() => {
  if (player.value) {
    player.value.cleanup();
  }
  protocolTimer.value?.cleanup();
  appStateListener?.remove();

});
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
  padding-bottom: 160px; // Space for fixed button (increased for stacked timer controls)
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
  max-width: 500px;
  margin-left: auto;
  margin-right: auto;
}
</style>
