<template>
  <q-page class="personalizada-session">
    <!-- Initial Splash Screen -->
    <SplashScreen
      v-if="showSplash && session"
      :day="splashInfo.day"
      :level="splashInfo.level"
      @start="onSplashComplete"
    />

    <!-- Between-block Transition Screen -->
    <TransitionScreen
      v-else-if="showBlockTransition"
      :completed-block-name="transitionCompletedBlock"
      :mobility-exercise-name="transitionMobilityName"
      :quote="transitionQuote"
      :action-label="transitionActionLabel"
      @continue="onTransitionContinue"
    />

    <!-- Celebration Screen -->
    <CelebrationScreen
      v-else-if="showCelebration"
      :quote="celebrationQuote"
      @view-summary="onCelebrationComplete"
    />

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

    <!-- Personalizada Progress Indicator -->
    <PersonalizadaProgressIndicator
      v-else-if="
        showProgress &&
        personalizadaStore.activePersonalizada &&
        personalizadaStore.activePersonalizadaName
      "
      :personalizada-name="personalizadaStore.activePersonalizadaName"
      :progress="personalizadaStore.activePersonalizada"
      :completed-duration="selectedDuration!"
      @continue="onProgressContinue"
    />

    <!-- Loading State -->
    <div v-else-if="isLoading" class="personalizada-session__loading flex flex-center">
      <q-spinner-dots color="primary" size="60px" />
    </div>

    <!-- No Session State -->
    <div v-else-if="!session" class="personalizada-session__empty flex flex-center column">
      <q-icon name="event_busy" size="80px" color="grey-4" />
      <div class="text-h6 text-grey-6 q-mt-md">No hay sesion disponible</div>
      <p class="text-grey-5 text-center q-px-lg">
        Es posible que no se hayan generado sesiones para esta semana. Intenta mas tarde.
      </p>
      <q-btn flat color="primary" label="Volver" class="q-mt-lg" @click="navigateBack" />
    </div>

    <!-- Main Player Content -->
    <template v-else-if="session && player && !showCelebration && !showSummary && !showProgress">
      <!-- Personalizada Header Badge -->
      <div class="personalizada-session__badge">
        <span class="badge-name">{{ personalizadaStore.activePersonalizadaName }}</span>
        <span class="badge-separator">&middot;</span>
        <span class="badge-duration">{{ selectedDuration }} min</span>
      </div>

      <!-- Block Progression View (reused from training) -->
      <BlockProgressionView
        :day-name="dayLabel"
        :playable-blocks="playableBlocks"
        :active-block-index="activeBlockIndex"
        :completed-blocks="completedBlocks"
        :elapsed-seconds="elapsedSeconds"
        :completed-exercises="allCompletedExercises"
        @back="handleBackNavigation"
        @restart="restartSession"
        @complete-block="onBlockComplete"
        @toggle-exercise-complete="onToggleExerciseComplete"
      />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { useQuasar } from 'quasar'

// Reused training components
import SplashScreen from '../../training/components/player/SplashScreen.vue'
import TransitionScreen from '../../training/components/player/TransitionScreen.vue'
import CelebrationScreen from '../../training/components/player/CelebrationScreen.vue'
import SessionSummary from '../../training/components/player/SessionSummary.vue'
import BlockProgressionView from '../../training/components/BlockProgressionView.vue'

// Personalizada components
import PersonalizadaProgressIndicator from '../components/PersonalizadaProgressIndicator.vue'

// Composables and stores
import { usePersonalizadaSession } from '../composables/usePersonalizadaSession'
import { useWakeLock } from '../../training/composables/useWakeLock'
import { usePersonalizadaStore } from '../stores/personalizadaStore'
import { createLogger } from 'src/utils/logger'

import { getQuoteForBlock } from '../../training/data/quotes'
import type { Quote } from '../../training/data/quotes'
import type { PersonalizadaSessionResponse } from '../types'

const log = createLogger('PersonalizadaSession')

const router = useRouter()
const $q = useQuasar()
const personalizadaStore = usePersonalizadaStore()
const wakeLock = useWakeLock()

// --- Guard: Redirect if no active personalizada or no duration selected ---
const selectedDuration = computed(() => personalizadaStore.selectedDuration)
const session = ref<PersonalizadaSessionResponse | null>(null)
const isLoading = ref(true)
const isSubmitting = ref(false)

// Flow state
const splashDismissed = ref(false)
const isInitialized = ref(false)
const sessionStartedAt = ref<string | null>(null)

// Block transition state
const showBlockTransition = ref(false)
const transitionCompletedBlock = ref('')
const transitionMobilityName = ref<string | null>(null)
const transitionQuote = ref<Quote>({ text: '', goldText: '', author: '' })
const transitionActionLabel = ref('Siguiente Bloque')
const pendingCelebration = ref(false)

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

// Player composable (created when session/duration change, via shallowRef + watch
// to avoid the composable-inside-computed anti-pattern which leaks reactive instances)
const player = shallowRef<ReturnType<typeof usePersonalizadaSession> | null>(null)

watch(
  [() => session.value, () => selectedDuration.value] as const,
  ([newSession, newDuration]) => {
    if (newSession && newDuration) {
      player.value = usePersonalizadaSession(newSession, newDuration)
    } else {
      player.value = null
    }
  },
  { immediate: true },
)

// Day offset for quote variety across days
const dayOffset = computed(() => new Date().getDay())

// Celebration quote (use index 4, distinct from block quotes)
const celebrationQuote = computed(() => getQuoteForBlock(4, dayOffset.value))

// Display helpers
const showSplash = computed(() => !splashDismissed.value && session.value !== null)

const dayLabel = computed(() => {
  const dayName = todaySpanishDay.value
  return dayName.charAt(0).toUpperCase() + dayName.slice(1)
})

const splashInfo = computed(() => ({
  day: todaySpanishDay.value,
  level: '', // Personalizada sessions don't use level display in splash
}))

// Bridge player state to sub-components (null-safe accessors)
const currentBlock = computed(() => player.value?.currentBlock.value ?? null)
const playableBlocks = computed(() => player.value?.visibleBlocks.value ?? [])
const activeBlockIndex = computed(() => player.value?.currentBlockIndex.value ?? 0)
const completedBlocks = computed(() => player.value?.completedBlocks.value ?? [])
const elapsedSeconds = computed(() => player.value?.elapsedSeconds.value ?? 0)
const isSessionComplete = computed(() => player.value?.isSessionComplete.value ?? false)
const allCompletedExercises = computed<Record<string, number[]>>(() => {
  if (!player.value) return {}
  return player.value.completedExercises.value
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

function onTransitionContinue(): void {
  showBlockTransition.value = false

  // If transition was for session complete, show celebration
  if (pendingCelebration.value) {
    pendingCelebration.value = false
    showCelebration.value = true
    return
  }

  // Advance to next block
  if (player.value) {
    void player.value.completeBlock()
  }
}

function onCelebrationComplete(): void {
  showCelebration.value = false
  showSummary.value = true
}

async function onToggleExerciseComplete(payload: { prescriptionId: number }): Promise<void> {
  if (player.value) {
    await player.value.toggleExerciseComplete(payload.prescriptionId)
  }
}

async function onBlockComplete(): Promise<void> {
  if (!player.value) return

  const p = player.value
  const completedRole = p.currentBlock.value?.role ?? ''
  const completedName = BLOCK_NAMES[completedRole] ?? ''
  const completedBlockIndex = p.currentBlockIndex.value

  // Get mobility name for the current block
  const mobilityName = p.currentBlock.value?.mobilityExercise?.exerciseName ?? null

  // Determine what happens next
  const isLastBlock = p.currentBlockIndex.value >= p.visibleBlocks.value.length - 1
  let actionLabel = 'Siguiente Bloque'

  if (isLastBlock) {
    actionLabel = 'Finalizar Sesion'
  } else {
    const nb = p.visibleBlocks.value[p.currentBlockIndex.value + 1]
    if (nb) {
      actionLabel = `Siguiente: ${BLOCK_NAMES[nb.role] ?? nb.role}`
    }
  }

  // Complete the block first (for state tracking)
  await p.completeBlock()

  // Check if session is now complete
  if (p.isSessionComplete.value) {
    // Show transition with "Finalizar Sesion", then celebration
    pendingCelebration.value = true
    transitionCompletedBlock.value = completedName
    transitionMobilityName.value = mobilityName
    transitionQuote.value = getQuoteForBlock(completedBlockIndex, dayOffset.value)
    transitionActionLabel.value = 'Finalizar Sesion'
    showBlockTransition.value = true
    await wakeLock.releaseWakeLock()
    return
  }

  // Show between-block transition
  transitionCompletedBlock.value = completedName
  transitionMobilityName.value = mobilityName
  transitionQuote.value = getQuoteForBlock(completedBlockIndex, dayOffset.value)
  transitionActionLabel.value = actionLabel
  showBlockTransition.value = true
}

async function onSummaryFinish(data: { rpe: number | null; notes: string | null }): Promise<void> {
  if (!session.value || !player.value || !selectedDuration.value) return

  isSubmitting.value = true
  try {
    const success = await personalizadaStore.completePersonalizadaSession({
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
  // Navigate to Mi Camino after viewing progress
  router.push('/mi-camino')
}

function navigateBack(): void {
  router.push({ name: 'training' })
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
      showBlockTransition.value = false
      pendingCelebration.value = false
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
  // Guard: must have active personalizada and selected duration
  if (!personalizadaStore.hasActivePersonalizada) {
    await personalizadaStore.fetchActivePersonalizada()
    if (!personalizadaStore.hasActivePersonalizada) {
      log.warn('No active personalizada, redirecting to selection')
      void router.replace({ name: 'training' })
      return
    }
  }

  if (!selectedDuration.value) {
    log.warn('No duration selected, redirecting to duration picker')
    void router.replace({ name: 'training' })
    return
  }

  // Determine current week from the gym-wide SPOM week
  // Use the personalizadaStore.currentWeek if already set, otherwise default to 1
  const week = personalizadaStore.currentWeek

  try {
    isLoading.value = true
    await personalizadaStore.fetchSession(week, todaySpanishDay.value)
    session.value = personalizadaStore.currentSession

    if (session.value) {
      personalizadaStore.setCurrentWeek(session.value.week)
      log.debug('Personalizada session loaded', {
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
    log.error('Failed to load personalizada session', {
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
  wakeLock.initialize()

  // Ensure metadata is loaded for personalizada name display
  if (personalizadaStore.personalizadaMetadata.length === 0) {
    void personalizadaStore.fetchMetadata()
  }
})

onUnmounted(() => {
  if (player.value) player.value.cleanup()
  wakeLock.cleanup()
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.personalizada-session {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: $cream;
}

.personalizada-session__badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(194, 122, 93, 0.1);
  border-bottom: 1px solid rgba(194, 122, 93, 0.2);
}

.badge-name {
  font-family: 'Montserrat', sans-serif;
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

.personalizada-session__loading,
.personalizada-session__empty {
  flex: 1;
  padding: 24px;
}
</style>
