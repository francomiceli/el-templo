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

    <!-- Celebration Screen (after completing all blocks) -->
    <CelebrationScreen
      v-else-if="showCelebration"
      @complete="onCelebrationComplete"
    />

    <!-- Session Summary (after celebration) -->
    <SessionSummary
      v-else-if="showSummary && session"
      :date="dateParam"
      :blocks-data="blocksDataForSummary"
      :days-completed-this-week="daysCompletedThisWeek"
      :total-days-trained="displayTotalDaysTrained"
      :is-submitting="isSubmitting"
      @finish="onSummaryFinish"
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
    <template v-else-if="session && player && !showCelebration && !showSummary">
      <!-- Deuteros Choice Screen -->
      <BlockChoice
        v-if="showDeuterosChoice && deuteros1Block && deuteros2Block"
        title="Elige tu bloque Deuteros"
        :options="deuterosOptions"
        confirm-button-prefix="Comenzar"
        @select="onDeuterosSelect"
      />

      <!-- Normal Block View -->
      <template v-else>
        <!-- Header with info -->
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
            <div class="day-player__timer text-h6 text-weight-bold q-mr-sm">
              {{ formattedTime }}
            </div>
            <q-btn
              flat
              round
              dense
              icon="more_vert"
              color="grey-8"
            >
              <q-menu>
                <q-list style="min-width: 150px">
                  <q-item clickable v-close-popup @click="restartSession">
                    <q-item-section avatar>
                      <q-icon name="refresh" />
                    </q-item-section>
                    <q-item-section>Reiniciar</q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </q-btn>
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
            :intensity="currentBlock.intensity"
            :format="currentBlock.format"
          />

          <!-- Exercise completion progress -->
          <div v-if="currentBlock" class="day-player__exercise-progress q-px-md q-pb-xs">
            <div class="text-caption text-grey-7">
              Ejercicios: {{ exerciseCompletedCount }} / {{ exerciseTotalCount }}
            </div>
            <q-linear-progress
              :value="exerciseTotalCount > 0 ? exerciseCompletedCount / exerciseTotalCount : 0"
              color="positive"
              track-color="grey-3"
              rounded
              size="4px"
              class="q-mt-xs"
            />
          </div>

          <!-- Exercise List -->
          <ExerciseList
            v-if="currentBlock"
            :exercises="currentBlock.exercises"
            :block-role="currentBlock.role"
            :selected-index="selectedExerciseIndex"
            :completed-exercises="currentBlockCompletedExercises"
            @update:selected-index="onExerciseSelect"
            @toggle-exercise-complete="onToggleExerciseComplete"
          />
        </div>

        <!-- Action Area: Complete Block button -->
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import { useQuasar } from 'quasar';

// Components
import SplashScreen from '../components/player/SplashScreen.vue';
import BlockChoice from '../components/player/BlockChoice.vue';
import ProgressBar from '../components/player/ProgressBar.vue';
import VideoPlaceholder from '../components/player/VideoPlaceholder.vue';
import BlockHeader from '../components/player/BlockHeader.vue';
import ExerciseList from '../components/player/ExerciseList.vue';
import CelebrationScreen from '../components/player/CelebrationScreen.vue';
import SessionSummary from '../components/player/SessionSummary.vue';

// Composables and Stores
import { useSessionPlayer } from '../composables/useSessionPlayer';
import { useWakeLock } from '../composables/useWakeLock';
import { useSessionCompletion } from '../composables/useSessionCompletion';
import { useWeekStore } from '../stores/weekStore';
import { useWeekData } from '../composables/useWeekData';
import { getWeekDates, formatDayName, getDateState } from '../composables/useDateNavigation';
import { useUserStore } from 'src/stores/useUserStore';

// Utils
import { getRouteName } from '../utils/routeNames';
import type { WeekDay } from '../types/session';

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
const userStore = useUserStore();
const wakeLock = useWakeLock();
const { sessions: weekSessions, loading: weekLoading, fetchWeekSessions } = useWeekData();

// Session completion composable
const {
  isSubmitting,
  totalDaysTrained,
  completeSession,
} = useSessionCompletion();

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

// Completion flow state
const showCelebration = ref(false);
const showSummary = ref(false);
const sessionStartedAt = ref<string | null>(null);

/**
 * Count days completed this week from weekStore
 * Includes +1 for today's session being completed now
 */
const daysCompletedThisWeek = computed(() => {
  const alreadyCompleted = weekStore.weekDays.filter(day => day.state === 'completed').length;
  // Add 1 for today if not already counted as completed
  const todayAlreadyCounted = weekStore.weekDays.some(
    day => day.date === dateParam.value && day.state === 'completed'
  );
  return todayAlreadyCounted ? alreadyCompleted : alreadyCompleted + 1;
});

/**
 * Display total days trained (at least 1 for current session)
 */
const displayTotalDaysTrained = computed(() => {
  return totalDaysTrained.value || 1;
});

/**
 * Block data for summary screen (role + exercises)
 */
const blocksDataForSummary = computed(() => {
  if (!player.value) return [];
  const completedRoles = player.value.completedBlocks.value;
  return player.value.playableBlocks.value
    .filter(block => completedRoles.includes(block.role))
    .map(block => ({
      role: block.role,
      exercises: (block.exercises ?? []).map(ex => ({ name: ex.exerciseName })),
    }));
});

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
    return { day: '', level: '' };
  }
  return {
    day: session.value.day,
    level: userStore.profile?.level ?? session.value.levelGroup ?? '',
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
    ATHLOS: 'Athlos',
    EPIKOS: 'Epikos',
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

// Exercise completion state
const exerciseCompletedCount = computed(() => player.value?.completedExerciseCount.value ?? 0);
const exerciseTotalCount = computed(() => player.value?.totalExerciseCount.value ?? 0);
const currentBlockCompletedExercises = computed<number[]>(() => {
  if (!player.value || !currentBlock.value) return [];
  return player.value.completedExercises.value[currentBlock.value.role] ?? [];
});

// Deuteros options for BlockChoice component
const deuterosOptions = computed(() => {
  const options = [];
  if (deuteros1Block.value) {
    options.push({
      id: 'DEUTEROS_1',
      label: 'Deuteros 1',
      block: deuteros1Block.value,
    });
  }
  if (deuteros2Block.value) {
    options.push({
      id: 'DEUTEROS_2',
      label: 'Deuteros 2',
      block: deuteros2Block.value,
    });
  }
  return options;
});

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
  sessionStartedAt.value = new Date().toISOString(); // Track when session started
  // Start timer and request wake lock
  if (player.value) {
    player.value.startTimer();
  }
  wakeLock.requestWakeLock();
}

function onDeuterosSelect(choiceId: string): void {
  if (player.value && (choiceId === 'DEUTEROS_1' || choiceId === 'DEUTEROS_2')) {
    player.value.selectDeuteros(choiceId);
  }
}

/** Get display name for a block role */
function getBlockDisplayName(role: string): string {
  const names: Record<string, string> = {
    INITIUM: 'Initium',
    NUCLEUS: 'Nucleus',
    DEUTEROS_1: 'Deuteros',
    DEUTEROS_2: 'Deuteros',
    ATHLOS: 'Athlos',
    EPIKOS: 'Epikos',
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

async function doCompleteBlock(): Promise<void> {
  if (!player.value) return;

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

async function completeBlock(): Promise<void> {
  if (!player.value) return;

  // Check if session is complete
  if (player.value.isSessionComplete.value) {
    // Session already complete - navigate back
    await finishSession();
    return;
  }

  // Check for incomplete exercises
  const completed = exerciseCompletedCount.value;
  const total = exerciseTotalCount.value;
  const incomplete = total - completed;

  if (incomplete > 0) {
    $q.dialog({
      title: 'Ejercicios sin completar',
      message: `Hay ${incomplete} ejercicio${incomplete > 1 ? 's' : ''} sin completar. Completar bloque de todas formas?`,
      cancel: {
        label: 'Cancelar',
        flat: true,
      },
      ok: {
        label: 'Completar',
        color: 'primary',
      },
    }).onOk(async () => {
      await doCompleteBlock();
    });
  } else {
    await doCompleteBlock();
  }
}

function onTransitionComplete(): void {
  showBlockTransition.value = false;
  transitionCompletedBlock.value = '';
  transitionNextBlock.value = '';
}

async function finishSession(): Promise<void> {
  if (!session.value || !player.value) return;

  // Release wake lock
  await wakeLock.releaseWakeLock();

  // Show celebration screen (auto-advances to summary)
  showCelebration.value = true;
}

function onCelebrationComplete(): void {
  showCelebration.value = false;
  showSummary.value = true;
}

async function onSummaryFinish(data: { rpe: number | null; notes: string | null }): Promise<void> {
  if (!session.value || !player.value) return;

  const result = await completeSession({
    dayId: session.value.dayId,
    date: dateParam.value,
    startedAt: sessionStartedAt.value ?? new Date().toISOString(),
    rpe: data.rpe,
    notes: data.notes,
    blocksCompleted: player.value.completedBlocks.value,
    exercisesCompleted: player.value.completedExercises.value,
  });

  if (result) {
    // Clear local progress
    await player.value.clearProgress();

    // Mark day as completed in week store
    if (dateParam.value) {
      weekStore.markDayCompleted(dateParam.value);
    }

    // Show success toast
    $q.notify({
      type: 'positive',
      message: 'Sesion guardada!',
      icon: 'check_circle',
      position: 'top',
      timeout: 2000,
    });

    // Navigate back to weekly view
    router.push({ name: 'training' });
  } else {
    // Show error toast
    $q.notify({
      type: 'negative',
      message: 'Error al guardar. Intenta de nuevo.',
      icon: 'error',
      position: 'top',
      timeout: 3000,
    });
  }
}

function onExerciseSelect(index: number): void {
  if (player.value) {
    player.value.selectExercise(index);
  }
}

async function onToggleExerciseComplete(payload: { prescriptionId: number }): Promise<void> {
  if (player.value) {
    await player.value.toggleExerciseComplete(payload.prescriptionId);
  }
}

function navigateBack(): void {
  router.push({ name: 'training' });
}

async function restartSession(): Promise<void> {
  $q.dialog({
    title: 'Reiniciar Sesion',
    message: 'Se perdera todo el progreso actual. Estas seguro?',
    cancel: {
      label: 'Cancelar',
      flat: true,
    },
    ok: {
      label: 'Reiniciar',
      color: 'negative',
    },
    persistent: true,
  }).onOk(async () => {
    if (player.value && session.value) {
      // Clear stored progress
      await player.value.clearProgress();

      // Reset state
      splashDismissed.value = false;
      sessionStartedAt.value = null;
      showCelebration.value = false;
      showSummary.value = false;

      // Re-initialize player (force recreation via session change)
      isInitialized.value = false;
      await player.value.initialize();
    }
  });
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
      }
    }
    isInitialized.value = true;
  }
}, { immediate: true });

// Load week data on mount if store is empty (handles F5 refresh)
onMounted(async () => {
  loadWeekDataIfEmpty();
});

// Cleanup player on unmount
onUnmounted(() => {
  if (player.value) {
    player.value.cleanup();
  }
});
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.day-player {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: $cream;
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
  background: $cream;
  border-bottom: 1px solid rgba($secondary, 0.2);
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

.day-player__exercise-progress {
  padding-top: 4px;
}

.day-player__content {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 100px; // Space for fixed button
}

.day-player__action {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  background: $cream;
  border-top: 1px solid rgba($secondary, 0.2);
  z-index: 100;
  max-width: 500px;
  margin-left: auto;
  margin-right: auto;
}
</style>
