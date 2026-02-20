<template>
  <q-page class="journey-session">
    <!-- Initial Splash Screen -->
    <SplashScreen
      v-if="showSplash && session"
      :session-info="splashInfo"
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

    <!-- Celebration Screen -->
    <CelebrationScreen v-else-if="showCelebration" @complete="onCelebrationComplete" />

    <!-- Session Summary -->
    <SessionSummary
      v-else-if="showSummary && session"
      :date="todayDate"
      :blocks-data="blocksDataForSummary"
      :days-completed-this-week="0"
      :total-days-trained="0"
      :is-submitting="isSubmitting"
      @finish="onSummaryFinish"
    />

    <!-- Journey Progress Indicator -->
    <JourneyProgressIndicator
      v-else-if="showProgress && journeyStore.activeJourney && journeyStore.activeJourneyName"
      :journey-name="journeyStore.activeJourneyName"
      :progress="journeyStore.activeJourney"
      :completed-duration="selectedDuration!"
      @continue="onProgressContinue"
    />

    <!-- Loading State -->
    <div v-else-if="isLoading" class="journey-session__loading flex flex-center">
      <q-spinner-dots color="primary" size="60px" />
    </div>

    <!-- No Session State -->
    <div v-else-if="!session" class="journey-session__empty flex flex-center column">
      <q-icon name="event_busy" size="80px" color="grey-4" />
      <div class="text-h6 text-grey-6 q-mt-md">No hay sesion disponible</div>
      <p class="text-grey-5 text-center q-px-lg">
        Es posible que no se hayan generado sesiones para esta semana. Intenta mas tarde.
      </p>
      <q-btn flat color="primary" label="Volver" class="q-mt-lg" @click="navigateBack" />
    </div>

    <!-- Main Player Content -->
    <template v-else-if="session && player && !showCelebration && !showSummary && !showProgress">
      <!-- Journey Header Badge -->
      <div class="journey-session__badge">
        <span class="badge-name">{{ journeyStore.activeJourneyName }}</span>
        <span class="badge-separator">·</span>
        <span class="badge-duration">{{ selectedDuration }} min</span>
      </div>

      <!-- Block Progression View (reused from training) -->
      <BlockProgressionView
        :day-name="dayLabel"
        :current-block="currentBlock"
        :completed-blocks="completedBlocks"
        :selected-exercise-index="selectedExerciseIndex"
        :elapsed-seconds="elapsedSeconds"
        :current-block-completed-exercises="currentBlockCompletedExercises"
        :is-session-complete="isSessionComplete"
        @back="handleBackNavigation"
        @restart="restartSession"
        @complete-block="onBlockComplete"
        @select-exercise="onExerciseSelect"
        @toggle-exercise-complete="onToggleExerciseComplete"
      />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { useQuasar } from 'quasar'

// Reused training components
import SplashScreen from '../../training/components/player/SplashScreen.vue'
import CelebrationScreen from '../../training/components/player/CelebrationScreen.vue'
import SessionSummary from '../../training/components/player/SessionSummary.vue'
import BlockProgressionView from '../../training/components/BlockProgressionView.vue'

// Journey components
import JourneyProgressIndicator from '../components/JourneyProgressIndicator.vue'

// Composables and stores
import { useJourneySession } from '../composables/useJourneySession'
import { useWakeLock } from '../../training/composables/useWakeLock'
import { useJourneyStore } from '../stores/journeyStore'
import { createLogger } from 'src/utils/logger'

import type { JourneySessionResponse } from '../types'

const log = createLogger('JourneySession')

const router = useRouter()
const $q = useQuasar()
const journeyStore = useJourneyStore()
const wakeLock = useWakeLock()

// --- Guard: Redirect if no active journey or no duration selected ---
const selectedDuration = computed(() => journeyStore.selectedDuration)
const session = ref<JourneySessionResponse | null>(null)
const isLoading = ref(true)
const isSubmitting = ref(false)

// Flow state
const splashDismissed = ref(false)
const isInitialized = ref(false)
const sessionStartedAt = ref<string | null>(null)

// Block transition splash
const showBlockTransition = ref(false)
const transitionCompletedBlock = ref('')
const transitionNextBlock = ref('')

// Completion flow
const showCelebration = ref(false)
const showSummary = ref(false)
const showProgress = ref(false)

// Today's date in YYYY-MM-DD format
const todayDate = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

// Spanish day name from current weekday
const SPANISH_DAYS: Record<number, string> = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sabado',
}

const todaySpanishDay = computed(() => {
  return SPANISH_DAYS[new Date().getDay()] ?? 'lunes'
})

// Player composable (created once session is loaded)
const player = computed(() => {
  if (!session.value || !selectedDuration.value) return null
  return useJourneySession(session.value, selectedDuration.value)
})

// Display helpers
const showSplash = computed(() => !splashDismissed.value && session.value !== null)

const dayLabel = computed(() => {
  const dayName = todaySpanishDay.value
  return dayName.charAt(0).toUpperCase() + dayName.slice(1)
})

const splashInfo = computed(() => ({
  day: todaySpanishDay.value,
  level: '', // Journey sessions don't use level display in splash
}))

// Bridge player state to sub-components (null-safe accessors)
const currentBlock = computed(() => player.value?.currentBlock.value ?? null)
const completedBlocks = computed(() => player.value?.completedBlocks.value ?? [])
const selectedExerciseIndex = computed(() => player.value?.selectedExerciseIndex.value ?? 0)
const elapsedSeconds = computed(() => player.value?.elapsedSeconds.value ?? 0)
const isSessionComplete = computed(() => player.value?.isSessionComplete.value ?? false)
const currentBlockCompletedExercises = computed<number[]>(() => {
  if (!player.value || !currentBlock.value) return []
  return player.value.completedExercises.value[currentBlock.value.role] ?? []
})

// Summary data
const blocksDataForSummary = computed(() => {
  if (!player.value) return []
  const roles = player.value.completedBlocks.value
  return player.value.visibleBlocks.value
    .filter((b) => roles.includes(b.role))
    .map((b) => ({
      role: b.role,
      exercises: (b.exercises ?? []).map((ex) => ({ name: ex.exerciseName })),
    }))
})

// Navigation guard
const hasUnsavedProgress = computed(() => {
  if (!player.value) return false
  const p = player.value
  return (
    p.isTimerRunning.value &&
    (p.completedBlocks.value.length > 0 ||
      p.currentBlockIndex.value > 0 ||
      p.elapsedSeconds.value > 0)
  )
})

const BLOCK_NAMES: Record<string, string> = {
  INITIUM: 'Initium',
  NUCLEUS: 'Nucleus',
  DEUTEROS_1: 'Deuteros',
  DEUTEROS_2: 'Deuteros',
  ATHLOS: 'Athlos',
  EPIKOS: 'Epikos',
}

// --- Event Handlers ---

function onSplashComplete(): void {
  splashDismissed.value = true
  sessionStartedAt.value = new Date().toISOString()
  if (player.value) {
    player.value.startTimer()
  }
  wakeLock.requestWakeLock()
}

function onTransitionComplete(): void {
  showBlockTransition.value = false
  transitionCompletedBlock.value = ''
  transitionNextBlock.value = ''
}

function onCelebrationComplete(): void {
  showCelebration.value = false
  showSummary.value = true
}

function onExerciseSelect(index: number): void {
  if (player.value) {
    player.value.selectExercise(index)
  }
}

async function onToggleExerciseComplete(payload: { prescriptionId: number }): Promise<void> {
  if (player.value) {
    await player.value.toggleExerciseComplete(payload.prescriptionId)
  }
}

async function onBlockComplete(): Promise<void> {
  if (!player.value) return

  if (player.value.isSessionComplete.value) {
    await finishSession()
    return
  }

  const p = player.value
  const completedName = BLOCK_NAMES[p.currentBlock.value?.role ?? ''] ?? ''

  // Get next block name
  const nb = p.visibleBlocks.value[p.currentBlockIndex.value + 1]
  const nextName = nb ? (BLOCK_NAMES[nb.role] ?? nb.role) : ''

  await p.completeBlock()

  if (p.isSessionComplete.value) {
    await finishSession()
    return
  }

  transitionCompletedBlock.value = completedName
  transitionNextBlock.value = nextName
  showBlockTransition.value = true
}

async function finishSession(): Promise<void> {
  if (!session.value || !player.value) return
  await wakeLock.releaseWakeLock()
  showCelebration.value = true
}

async function onSummaryFinish(data: { rpe: number | null; notes: string | null }): Promise<void> {
  if (!session.value || !player.value || !selectedDuration.value) return

  isSubmitting.value = true
  try {
    const success = await journeyStore.completeJourneySession({
      dayId: session.value.dayId,
      duration: selectedDuration.value,
      date: todayDate.value,
      startedAt: sessionStartedAt.value ?? new Date().toISOString(),
      blocksCompleted: player.value.completedBlocks.value,
      rpe: data.rpe,
      notes: data.notes,
      exercisesCompleted: player.value.completedExercises.value,
    })

    if (success) {
      await player.value.clearProgress()
      showSummary.value = false
      showProgress.value = true
    } else {
      $q.notify({
        type: 'negative',
        message: 'Error al guardar. Intenta de nuevo.',
        icon: 'error',
        position: 'top',
        timeout: 3000,
      })
    }
  } finally {
    isSubmitting.value = false
  }
}

function onProgressContinue(): void {
  // Navigate back to duration picker for next session
  router.push({ name: 'journey-duration' })
}

function navigateBack(): void {
  router.push({ name: 'journey-duration' })
}

const exitDialogOpts = {
  title: 'Salir de la sesion?',
  message: 'Tu progreso se guardara y podras continuar despues.',
  cancel: { label: 'Cancelar', flat: true },
  ok: { label: 'Salir', color: 'negative', flat: true },
  persistent: true,
}

async function pauseAndRelease(): Promise<void> {
  if (player.value) player.value.pauseTimer()
  await wakeLock.releaseWakeLock()
}

async function handleBackNavigation(): Promise<void> {
  if (hasUnsavedProgress.value) {
    $q.dialog(exitDialogOpts).onOk(async () => {
      await pauseAndRelease()
      navigateBack()
    })
  } else {
    navigateBack()
  }
}

async function restartSession(): Promise<void> {
  $q.dialog({
    title: 'Reiniciar Sesion',
    message: 'Se perdera todo el progreso actual. Estas seguro?',
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Reiniciar', color: 'negative' },
    persistent: true,
  }).onOk(async () => {
    if (player.value && session.value) {
      await player.value.clearProgress()
      splashDismissed.value = false
      sessionStartedAt.value = null
      showCelebration.value = false
      showSummary.value = false
      showProgress.value = false
      isInitialized.value = false
      await player.value.initialize()
    }
  })
}

onBeforeRouteLeave((_to, _from, next) => {
  if (hasUnsavedProgress.value) {
    $q.dialog(exitDialogOpts)
      .onOk(async () => {
        await pauseAndRelease()
        next()
      })
      .onCancel(() => next(false))
  } else {
    next()
  }
})

// --- Session Loading ---

async function loadSession(): Promise<void> {
  // Guard: must have active journey and selected duration
  if (!journeyStore.hasActiveJourney) {
    await journeyStore.fetchActiveJourney()
    if (!journeyStore.hasActiveJourney) {
      log.warn('No active journey, redirecting to selection')
      void router.replace({ name: 'journey-selection' })
      return
    }
  }

  if (!selectedDuration.value) {
    log.warn('No duration selected, redirecting to duration picker')
    void router.replace({ name: 'journey-duration' })
    return
  }

  // Determine current week from the gym-wide SPOM week
  // Use the journeyStore.currentWeek if already set, otherwise default to 1
  const week = journeyStore.currentWeek

  try {
    isLoading.value = true
    await journeyStore.fetchSession(week, todaySpanishDay.value)
    session.value = journeyStore.currentSession

    if (session.value) {
      journeyStore.setCurrentWeek(session.value.week)
      log.debug('Journey session loaded', {
        dayId: session.value.dayId,
        blockCount: session.value.blocks.length,
        duration: selectedDuration.value,
      })
    } else {
      log.warn('No session found for current week/day', {
        week,
        day: todaySpanishDay.value,
      })
    }
  } catch (err: unknown) {
    log.error('Failed to load journey session', {
      error: err instanceof Error ? err.message : String(err),
    })
  } finally {
    isLoading.value = false
  }
}

// Initialize player when session is available
watch(
  session,
  async (s) => {
    if (s && !isInitialized.value) {
      await new Promise((r) => setTimeout(r, 0))
      if (player.value) {
        await player.value.initialize()
        // Check if there's existing progress to resume
        if (
          player.value.elapsedSeconds.value > 0 ||
          player.value.completedBlocks.value.length > 0
        ) {
          splashDismissed.value = true
          player.value.startTimer()
          wakeLock.requestWakeLock()
        }
      }
      isInitialized.value = true
    }
  },
  { immediate: true },
)

onMounted(() => {
  void loadSession()

  // Ensure metadata is loaded for journey name display
  if (journeyStore.journeyMetadata.length === 0) {
    void journeyStore.fetchMetadata()
  }
})

onUnmounted(() => {
  if (player.value) player.value.cleanup()
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.journey-session {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: $cream;
}

.journey-session__badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(194, 122, 93, 0.1);
  border-bottom: 1px solid rgba(194, 122, 93, 0.2);
}

.badge-name {
  font-family: 'Cinzel', serif;
  font-size: 0.85rem;
  font-weight: 400;
  color: #4a4a4a;
}

.badge-separator {
  color: #c27a5d;
  font-weight: 600;
}

.badge-duration {
  font-size: 0.85rem;
  font-weight: 600;
  color: #c27a5d;
}

.journey-session__loading,
.journey-session__empty {
  flex: 1;
  padding: 24px;
}
</style>
