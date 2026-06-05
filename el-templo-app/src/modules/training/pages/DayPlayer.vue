<template>
  <q-page class="day-player">
    <!-- Initial Splash Screen Overlay -->
    <SplashScreen
      v-if="showSplash && session"
      :day="session.day"
      :level="userLevel"
      @start="onSplashStart"
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

    <!-- 3-2-1 Countdown before next block starts -->
    <CountdownOverlay v-else-if="showCountdown" @done="onCountdownDone" />

    <!-- Celebration Screen (after completing all blocks) -->
    <CelebrationScreen
      v-else-if="showCelebration"
      :quote="celebrationQuote"
      @view-summary="onCelebrationViewSummary"
    />

    <!-- Session Summary (after celebration) -->
    <SessionSummary
      v-else-if="showSummary && session"
      :date="dateParam"
      :blocks="completedBlocksForSummary"
      :days-completed-this-week="daysCompletedThisWeek"
      :total-days-trained="displayTotalDaysTrained"
      :is-submitting="isSubmitting"
      @finish="onSummaryFinish"
      @restart="restartSession"
    />

    <!-- Loading State -->
    <div v-else-if="isLoading" class="day-player__loading flex flex-center">
      <TemploLoader size="lg" />
    </div>

    <!-- No Session State -->
    <div v-else-if="!session" class="day-player__empty flex flex-center column">
      <q-icon name="event_busy" size="80px" color="grey-4" />
      <div class="text-h6 text-grey-6 q-mt-md">No hay sesión para este día</div>
      <q-btn flat color="primary" label="Volver" class="q-mt-lg" @click="navigateBack" />
    </div>

    <!-- Main Player Content -->
    <template v-else-if="session && player && !showCelebration && !showSummary">
      <!-- Deuteros Choice Screen -->
      <DeuterosSelector
        v-if="showDeuterosChoice && deuteros1Block && deuteros2Block"
        :deuteros1-block="deuteros1Block"
        :deuteros2-block="deuteros2Block"
        @select="onDeuterosSelect"
      />

      <!-- Block Progression View (Stories-style) -->
      <BlockProgressionView
        v-else
        :day-name="dayName"
        :playable-blocks="playableBlocks"
        :active-block-index="activeBlockIndex"
        :completed-blocks="completedBlocks"
        :elapsed-seconds="elapsedSeconds"
        :completed-exercises="allCompletedExercises"
        :is-adjusting="isAdjusting"
        @back="handleBackNavigation"
        @restart="restartSession"
        @complete-block="onBlockComplete"
        @toggle-exercise-complete="onToggleExerciseComplete"
        @change-deuteros="onChangeDeuteros"
        @adjust="onAdjustExercise"
      />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useQuasar } from 'quasar'

// Components
import TemploLoader from 'src/components/TemploLoader.vue'
import SplashScreen from '../components/player/SplashScreen.vue'
import TransitionScreen from '../components/player/TransitionScreen.vue'
import CountdownOverlay from '../components/player/CountdownOverlay.vue'
import CelebrationScreen from '../components/player/CelebrationScreen.vue'
import SessionSummary from '../components/player/SessionSummary.vue'
import DeuterosSelector from '../components/DeuterosSelector.vue'
import BlockProgressionView from '../components/BlockProgressionView.vue'

// Composables and Stores
import { useSessionPlayer } from '../composables/useSessionPlayer'
import { useWakeLock } from '../composables/useWakeLock'
import { useSessionCompletion } from '../composables/useSessionCompletion'
import { useExerciseAdjustment } from '../composables/useExerciseAdjustment'
import { useWeekStore } from '../stores/weekStore'
import { useWeekData } from '../composables/useWeekData'
import { getWeekDates, formatDayName, getDateState } from '../composables/useDateNavigation'
import { useUserStore } from 'src/stores/useUserStore'
import { createLogger } from 'src/utils/logger'

// Data
import { getQuoteForBlock } from '../data/quotes'
import type { Quote } from '../data/quotes'

const log = createLogger('DayPlayer')

// Day Player Page - Orchestrator for session flow:
// splash -> deuteros choice -> block progression (stories) -> transition -> ... -> celebration -> summary

const route = useRoute()
const router = useRouter()
const $q = useQuasar()
const weekStore = useWeekStore()
const userStore = useUserStore()
const wakeLock = useWakeLock()
const {
  sessions: weekSessions,
  completedDates: weekCompletedDates,
  loading: weekLoading,
  fetchWeekSessions,
} = useWeekData()

// Session completion composable
const { isSubmitting, totalDaysTrained, completeSession } = useSessionCompletion()

// In-session difficulty adjustment composable
const {
  isSubmitting: isAdjusting,
  adjustExercise,
  cleanup: cleanupAdjustment,
} = useExerciseAdjustment()

// Route parameter
const dateParam = computed(() => route.params.date as string)

// Week day and session data from store
const weekDay = computed(() => weekStore.weekDays.find((day) => day.date === dateParam.value))
const session = computed(() => weekDay.value?.session ?? null)

// Reactive state
const splashDismissed = ref(false)
const isInitialized = ref(false)

// Block transition state
const showBlockTransition = ref(false)
const transitionCompletedBlock = ref('')
const transitionMobilityName = ref<string | null>(null)
const transitionQuote = ref<Quote>({ text: '', goldText: '', author: '' })
const transitionActionLabel = ref('Siguiente Bloque')

// Completion flow state
const showCelebration = ref(false)
const showSummary = ref(false)
const showCountdown = ref(false)
const sessionStartedAt = ref<string | null>(null)

// Session player composable (created when session changes, via shallowRef + watch
// to avoid the composable-inside-computed anti-pattern which leaks reactive instances)
const player = shallowRef<ReturnType<typeof useSessionPlayer> | null>(null)

watch(
  session,
  (newSession) => {
    if (newSession) {
      player.value = useSessionPlayer(newSession)
    } else {
      player.value = null
    }
  },
  { immediate: true },
)

// Selected level for splash screen (falls back to profile.level when no override is set)
const userLevel = computed(() => {
  return userStore.activeLevel ?? session.value?.levelGroup ?? ''
})

// Day offset for quote variety across days
const dayOffset = computed(() => {
  if (!dateParam.value) return 0
  const d = new Date(dateParam.value + 'T00:00:00')
  return d.getDay() // 0=Sunday, 1=Monday, ..., 6=Saturday
})

// Celebration quote (use index 4, distinct from block quotes)
const celebrationQuote = computed(() => getQuoteForBlock(4, dayOffset.value))

// Computed display states
const isLoading = computed(() => weekLoading.value || (!session.value && !weekDay.value))

const showSplash = computed(() => !splashDismissed.value && session.value !== null)

const showDeuterosChoice = computed(() => {
  if (!player.value) return false
  return splashDismissed.value && player.value.needsDeuterosChoice.value
})

// Day name for header
const dayName = computed(() => {
  if (!weekDay.value) return ''
  const name = weekDay.value.dayName
  return name.charAt(0).toUpperCase() + name.slice(1)
})

// Bridge player state to sub-components (null-safe accessors)
const playableBlocks = computed(() => player.value?.playableBlocks.value ?? [])
const activeBlockIndex = computed(() => player.value?.currentBlockIndex.value ?? 0)
const completedBlocks = computed(() => player.value?.completedBlocks.value ?? [])
const elapsedSeconds = computed(() => player.value?.elapsedSeconds.value ?? 0)
const deuteros1Block = computed(() => player.value?.deuteros1Block.value ?? null)
const deuteros2Block = computed(() => player.value?.deuteros2Block.value ?? null)
const allCompletedExercises = computed<Record<string, number[]>>(() => {
  return player.value?.completedExercises.value ?? {}
})

// Summary computed data
const daysCompletedThisWeek = computed(() => {
  const done = weekStore.weekDays.filter((d) => d.state === 'completed').length
  const todayCounted = weekStore.weekDays.some(
    (d) => d.date === dateParam.value && d.state === 'completed',
  )
  return todayCounted ? done : done + 1
})
const displayTotalDaysTrained = computed(() => totalDaysTrained.value || 1)
const completedBlocksForSummary = computed(() => {
  if (!player.value) return []
  const roles = player.value.completedBlocks.value
  return player.value.playableBlocks.value.filter((b) => roles.includes(b.role))
})

// Navigation guard state
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

// Phase 99: "any exercise started" — used by the mid-session level-change guard.
// Broader than hasUnsavedProgress (no isTimerRunning gate) because progress-loss
// applies even if the user paused before opening the dropdown.
const anyExerciseStarted = computed(() => {
  const p = player.value
  if (!p) return false
  if (p.completedBlocks.value.length > 0) return true
  if (Object.values(p.completedExercises.value).some((arr) => arr.length > 0)) return true
  if (p.isTimerRunning.value || p.elapsedSeconds.value > 0) return true
  return false
})

const BLOCK_NAMES: Record<string, string> = {
  INITIUM: 'Initium',
  NUCLEUS: 'Nucleus',
  DEUTEROS_1: 'Deuteros',
  DEUTEROS_2: 'Deuteros',
  ATHLOS: 'Athlos',
  EPIKOS: 'Epikos',
  ROM_LOWER: 'Tren Inferior',
  ROM_CORE: 'Zona Media',
  ROM_UPPER: 'Tren Superior',
}

function onSplashStart(): void {
  splashDismissed.value = true
  sessionStartedAt.value = new Date().toISOString()
  if (player.value) {
    player.value.startTimer()
  }
  wakeLock.requestWakeLock()
  if (!player.value?.needsDeuterosChoice.value) {
    showCountdown.value = true
  }
}

function onDeuterosSelect(choiceId: 'DEUTEROS_1' | 'DEUTEROS_2'): void {
  if (player.value) {
    player.value.selectDeuteros(choiceId)
    showCountdown.value = true
  }
}

function onChangeDeuteros(): void {
  if (player.value) {
    player.value.deuterosChoice.value = null
    player.value.currentBlockIndex.value = 2
  }
}

function onTransitionContinue(): void {
  showBlockTransition.value = false

  // If transition was for session complete, show celebration (no countdown)
  if (pendingCelebration.value) {
    pendingCelebration.value = false
    showCelebration.value = true
    return
  }

  // Show 3-2-1 countdown before next block
  showCountdown.value = true
}

function onCountdownDone(): void {
  showCountdown.value = false
}

const pendingCelebration = ref(false)

function onCelebrationViewSummary(): void {
  showCelebration.value = false
  showSummary.value = true
}

async function onToggleExerciseComplete(payload: { prescriptionId: number }): Promise<void> {
  if (player.value) {
    await player.value.toggleExerciseComplete(payload.prescriptionId)
  }
}

/**
 * Handle a per-exercise difficulty adjustment from the player (D-02/D-03).
 * Calls the Plan 01 endpoint (which persists the dominado/bajado record and
 * resolves the one-step tree neighbor), then swaps ONLY the exercise identity
 * into the SOURCE session block — preserving the block's route/contraction
 * dose/format. One tap = one step. At the chain end (neighbor null) the
 * returned message is shown and nothing changes.
 */
async function onAdjustExercise(payload: {
  exerciseId: number
  direction: 'up' | 'down'
}): Promise<void> {
  const s = session.value
  if (!s) return

  const result = await adjustExercise(
    payload.exerciseId,
    payload.direction,
    s.dayId,
    dateParam.value,
  )
  if (!result) return // transport/server error — already logged, change nothing

  // Chain end / off-graph — surface the message, change nothing.
  if (!result.neighbor) {
    $q.notify({
      type: 'info',
      message: result.message ?? 'Ya estás en el extremo de la cadena.',
      position: 'top',
      timeout: 2500,
    })
    return
  }

  const neighbor = result.neighbor

  // Swap ONLY the exercise identity into the source session block, preserving
  // the block's prescription (reps/seconds/format/dose/sortOrder/rest). The
  // playableBlocks computed re-derives from session.blocks, so mutating the
  // source exercise reflects through to the player.
  for (const block of s.blocks) {
    const idx = block.exercises.findIndex((ex) => ex.exerciseId === payload.exerciseId)
    if (idx === -1) continue
    const current = block.exercises[idx]
    block.exercises[idx] = {
      ...current,
      exerciseId: neighbor.id,
      exerciseName: neighbor.name,
      contraction: neighbor.contraction,
      // No video URL is served by the adjustment endpoint; clear it so the
      // stale clip isn't shown (it is refetched on the next session load).
      videoUrl: null,
    }
    break // one tap = one swap
  }
}

/** Called when BlockProgressionView confirms block completion (after exercise check dialog) */
async function onBlockComplete(): Promise<void> {
  if (!player.value) return

  const p = player.value
  const completedRole = p.currentBlock.value?.role ?? ''
  const completedName = BLOCK_NAMES[completedRole] ?? ''
  const completedBlockIndex = p.currentBlockIndex.value

  // Get mobility name for the current block
  const mobilityName = p.currentBlock.value?.mobilityExercise?.exerciseName ?? null

  // Determine what happens next
  const role = p.currentBlock.value?.role
  let actionLabel = 'Siguiente Bloque'

  if (role === 'NUCLEUS' && !p.deuterosChoice.value) {
    // Deuteros not chosen yet — playableBlocks only has INITIUM+NUCLEUS
    actionLabel = 'Siguiente bloque'
  } else {
    const isLastBlock = p.currentBlockIndex.value >= p.playableBlocks.value.length - 1
    if (isLastBlock) {
      actionLabel = 'Finalizar Sesión'
    } else {
      const nb = p.playableBlocks.value[p.currentBlockIndex.value + 1]
      if (nb) {
        actionLabel = `Siguiente: ${BLOCK_NAMES[nb.role] ?? nb.role}`
      }
    }
  }

  // Complete the block first (for state tracking)
  await p.completeBlock()

  // Session complete — go straight to celebration
  if (p.isSessionComplete.value) {
    showCelebration.value = true
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
  if (!session.value || !player.value) return
  const result = await completeSession({
    dayId: session.value.dayId,
    date: dateParam.value,
    startedAt:
      sessionStartedAt.value ??
      new Date(Date.now() - player.value.elapsedSeconds.value * 1000).toISOString(),
    rpe: data.rpe,
    notes: data.notes,
    blocksCompleted: player.value.completedBlocks.value,
    exercisesCompleted: player.value.completedExercises.value,
  })
  if (result) {
    await player.value.clearProgress()
    if (dateParam.value) weekStore.markDayCompleted(dateParam.value)
    $q.notify({
      type: 'positive',
      message: 'Sesión guardada!',
      icon: 'check_circle',
      position: 'top',
      timeout: 2000,
    })
    router.push('/mi-templo')
  } else {
    $q.notify({
      type: 'negative',
      message: 'Error al guardar. Intenta de nuevo.',
      icon: 'error',
      position: 'top',
      timeout: 3000,
    })
  }
}

function navigateBack(): void {
  router.push({ name: 'training' })
}

const exitDialogOpts = {
  title: 'Salir del entrenamiento?',
  message: 'Tu progreso se guardará y podrás continuar después.',
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
    title: 'Reiniciar Sesión',
    message: 'Se perderá todo el progreso actual. Estás seguro?',
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
      showBlockTransition.value = false
      showCountdown.value = false
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

async function loadWeekDataIfEmpty() {
  if (weekDay.value || weekLoading.value) return
  try {
    const dates = getWeekDates()
    await fetchWeekSessions(dates)
    weekStore.setWeekDays(
      dates.map((date) => ({
        date,
        dayName: formatDayName(date),
        dayOfWeek: new Date(date + 'T00:00:00').getDay(),
        state: getDateState(date, weekCompletedDates.value),
        session: weekSessions.value.get(date) || null,
      })),
    )
  } catch (err) {
    log.error('Failed to load week data', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

watch(
  session,
  async (s) => {
    if (s && !isInitialized.value) {
      await new Promise((r) => setTimeout(r, 0))
      if (player.value) {
        // If the day is already completed (re-entry via "Repetir Sesión"),
        // clear any stale local progress so the session starts fresh
        const isCompleted = weekDay.value?.state === 'completed'
        if (isCompleted) {
          await player.value.clearProgress()
        }

        await player.value.initialize()
        if (
          !isCompleted &&
          (player.value.elapsedSeconds.value > 0 || player.value.completedBlocks.value.length > 0)
        ) {
          splashDismissed.value = true
          // Reconstruct startedAt from persisted elapsedSeconds so a resumed
          // session doesn't record a zero-duration completion. Without this
          // the onSummaryFinish fallback stamps startedAt = now at completion.
          sessionStartedAt.value = new Date(
            Date.now() - player.value.elapsedSeconds.value * 1000,
          ).toISOString()
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
  loadWeekDataIfEmpty()
  wakeLock.initialize()

  // Phase 99 R7 — register the mid-session confirmation guard. Returns true
  // to proceed with the level change, false to cancel. If no exercise has
  // been started yet, resolve true immediately (no dialog shown).
  userStore.registerMidSessionGuard(async () => {
    if (!anyExerciseStarted.value) return true
    return await new Promise<boolean>((resolve) => {
      $q.dialog({
        title: 'Cambiar nivel',
        message: 'Si cambias de nivel vas a perder el progreso de esta sesion. ¿Seguro?',
        cancel: { label: 'Cancelar', flat: true },
        ok: { label: 'Cambiar nivel', color: 'negative' },
        persistent: true,
      })
        .onOk(() => resolve(true))
        .onCancel(() => resolve(false))
        .onDismiss(() => resolve(false))
    })
  })
})

// Phase 99 R7 — watcher that discards local progress + refetches on activeLevel
// change. The guard above has already gated the mutation; by the time this
// fires the user has confirmed (or it was a self-pick clearing the override).
// Hydration-as-change guard: on boot, activeLevel flips null -> concrete once
// profile + stored selection are loaded; that is NOT a user-initiated change.
watch(
  () => userStore.activeLevel,
  async (newLevel, oldLevel) => {
    if (newLevel === oldLevel) return
    if (oldLevel === null) return // boot hydration — no prior progress to discard
    if (player.value && anyExerciseStarted.value) {
      await player.value.clearProgress()
    }
    await fetchWeekSessions(getWeekDates())
  },
)

onUnmounted(() => {
  if (player.value) player.value.cleanup()
  wakeLock.cleanup()
  cleanupAdjustment()
  userStore.registerMidSessionGuard(null)
})
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
</style>
