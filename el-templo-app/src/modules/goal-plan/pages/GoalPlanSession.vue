<template>
  <q-page class="goal-plan-session">
    <!-- Between-block Transition Screen: overlay sobre el player, que queda montado debajo para que
         "Volver al último ejercicio" encuentre la historia donde estaba -->
    <TransitionScreen
      v-if="transitionData"
      :data="transitionData"
      @start="onTransitionStart"
      @back="onTransitionBack"
    />

    <!-- 3-2-1 al arrancar la sesión y entre bloques -->
    <CountdownOverlay
      v-if="showCountdown"
      :kicker="countdownCopy.kicker"
      :subtitle="countdownCopy.subtitle"
      @done="onCountdownDone"
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
      :blocks="completedBlocksForSummary"
      :days-completed-this-week="0"
      :total-days-trained="0"
      :is-submitting="isSubmitting"
      @finish="onSummaryFinish"
    />

    <!-- Goal Plan Progress Indicator -->
    <GoalPlanProgressIndicator
      v-else-if="
        showProgress &&
        goalPlanStore.activeGoalPlan &&
        goalPlanStore.activeGoalPlanName
      "
      :goal-plan-name="goalPlanStore.activeGoalPlanName"
      :progress="goalPlanStore.activeGoalPlan"
      @continue="onProgressContinue"
    />

    <!-- Loading State -->
    <div v-else-if="showLoader" class="goal-plan-session__loading flex flex-center">
      <TemploLoader size="lg" />
    </div>

    <!-- No Session State -->
    <div v-else-if="!session" class="goal-plan-session__empty flex flex-center column">
      <q-icon name="event_busy" size="80px" color="grey-4" />
      <div class="text-h6 text-grey-6 q-mt-md">No hay sesion disponible</div>
      <p class="text-grey-5 text-center q-px-lg">
        Es posible que no se hayan generado sesiones para esta semana. Intenta mas tarde.
      </p>
      <q-btn flat color="primary" label="Volver" class="q-mt-lg" @click="navigateBack" />
    </div>

    <!-- Main Player Content -->
    <template v-else-if="session && player && !showCelebration && !showSummary && !showProgress">
      <!-- Goal Plan Header Badge -->
      <div class="goal-plan-session__badge">
        <span class="badge-name">{{ goalPlanStore.activeGoalPlanName }}</span>
      </div>

      <!-- Block Progression View (reused from training) -->
      <BlockProgressionView
        ref="progressionView"
        :day-name="dayLabel"
        :playable-blocks="playableBlocks"
        :active-block-index="activeBlockIndex"
        :completed-blocks="completedBlocks"
        :elapsed-seconds="elapsedSeconds"
        :completed-exercises="allCompletedExercises"
        :is-final-block="activeIsFinal"
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
import TransitionScreen from '../../training/components/player/TransitionScreen.vue'
import CountdownOverlay from '../../training/components/player/CountdownOverlay.vue'
import CelebrationScreen from '../../training/components/player/CelebrationScreen.vue'
import SessionSummary from '../../training/components/player/SessionSummary.vue'
import BlockProgressionView from '../../training/components/BlockProgressionView.vue'

// Goal plan components
import GoalPlanProgressIndicator from '../components/GoalPlanProgressIndicator.vue'

// Composables and stores
import { useGoalPlanSession } from '../composables/useGoalPlanSession'
import { useWakeLock } from '../../training/composables/useWakeLock'
import { resolvePlayerStart, type PlayerStartMode } from '../../training/utils/playerStart'
import { useGoalPlanStore } from '../stores/goalPlanStore'
import { createLogger } from 'src/utils/logger'
import {
  blockCountdownCopy,
  buildBlockTransition,
  isBlockExercisesDone,
  isFinalBlock,
  sessionJourney,
  type BlockTransitionData,
  type CountdownCopy,
} from '../../training/utils/blockTransition'
import TemploLoader from 'src/components/TemploLoader.vue'

import { getQuoteForBlock } from '../../training/data/quotes'
import type { GoalPlanSessionResponse } from '../types'

const log = createLogger('GoalPlanSession')

const router = useRouter()
const $q = useQuasar()
const goalPlanStore = useGoalPlanStore()
const wakeLock = useWakeLock()

// --- Guard: Redirect if no active goal plan ---
const session = ref<GoalPlanSessionResponse | null>(null)
const isLoading = ref(true)
const isSubmitting = ref(false)

// Flow state
const isInitialized = ref(false)
/**
 * Guard del arranque automático: corre UNA sola vez por entrada. El watch de `session` puede
 * dispararse de nuevo mientras espera el `await` y un segundo arranque duplicaría el timer.
 * "Reiniciar" arranca a mano, no pasa por acá.
 */
let startClaimed = false
const sessionStartedAt = ref<string | null>(null)

// Block transition state (fase 197, sketch 018 D): igual que DayPlayer, la pantalla entre bloques se
// muestra mientras el bloque activo tenga todos los ejercicios tildados y no esté dado por terminado;
// el bloque se completa recién con "Empezar".
const transitionData = shallowRef<BlockTransitionData | null>(null)
/** true mientras "Empezar" completa el bloque (el guardado es async): congela la pantalla */
const isAdvancing = ref(false)
const countdownCopy = ref<CountdownCopy>({ kicker: '', subtitle: '' })
const progressionView = ref<InstanceType<typeof BlockProgressionView> | null>(null)

// Completion flow
const showCelebration = ref(false)
const showSummary = ref(false)
const showProgress = ref(false)
const showCountdown = ref(false)

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

// Player composable (created when session changes, via shallowRef + watch
// to avoid the composable-inside-computed anti-pattern which leaks reactive instances)
const player = shallowRef<ReturnType<typeof useGoalPlanSession> | null>(null)

watch(
  () => session.value,
  (newSession) => {
    if (newSession) {
      player.value = useGoalPlanSession(newSession)
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
// Con sesión pero sin arrancar todavía: loader (así no se asoma la vista del bloque antes del 3-2-1)
const showLoader = computed(
  () => isLoading.value || (session.value !== null && !isInitialized.value),
)

const dayLabel = computed(() => {
  const dayName = todaySpanishDay.value
  return dayName.charAt(0).toUpperCase() + dayName.slice(1)
})

// Bridge player state to sub-components (null-safe accessors)
const playableBlocks = computed(() => player.value?.visibleBlocks.value ?? [])
const activeBlockIndex = computed(() => player.value?.currentBlockIndex.value ?? 0)
const completedBlocks = computed(() => player.value?.completedBlocks.value ?? [])
const elapsedSeconds = computed(() => player.value?.elapsedSeconds.value ?? 0)
const allCompletedExercises = computed<Record<string, number[]>>(() => {
  if (!player.value) return {}
  return player.value.completedExercises.value
})

// Pasos de la sesión en orden (el plan por objetivo no tiene elección de Deuteros)
const journey = computed(() => {
  const s = session.value
  const p = player.value
  if (!s || !p) return []
  return sessionJourney({
    allBlocks: s.blocks,
    playable: p.visibleBlocks.value,
    awaitingDeuteros: false,
  })
})

/** El bloque activo es el último de la sesión: no hay transición, queda "Sesión completa" */
const activeIsFinal = computed(() =>
  isFinalBlock({
    index: activeBlockIndex.value,
    playableCount: playableBlocks.value.length,
    awaitingDeuteros: false,
  }),
)

/** El bloque activo tiene todos los ejercicios tildados y todavía no se dio por terminado */
const blockReadyForTransition = computed(() => {
  const p = player.value
  if (!p || !isInitialized.value || activeIsFinal.value) return false
  const block = p.currentBlock.value
  if (!block || p.completedBlocks.value.includes(block.role)) return false
  return isBlockExercisesDone(block, p.completedExercises.value)
})

// La pantalla se arma una sola vez al quedar lista y se apaga al destildar un ejercicio
// ("Volver al último ejercicio"). Mientras "Empezar" guarda, no se toca.
watch(
  blockReadyForTransition,
  (ready) => {
    if (isAdvancing.value) return
    transitionData.value = ready
      ? buildBlockTransition({
          title: goalPlanStore.activeGoalPlanName ?? '',
          entries: journey.value,
          completedIndex: activeBlockIndex.value,
        })
      : null
  },
  { immediate: true },
)

// Summary data
const completedBlocksForSummary = computed(() => {
  if (!player.value) return []
  const roles = player.value.completedBlocks.value
  return player.value.visibleBlocks.value.filter((b) => roles.includes(b.role))
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

// --- Event Handlers ---

/**
 * Arranca el player (antes lo hacía el botón COMENZAR de la pantalla intermedia): startedAt, timer,
 * wake lock y el 3-2-1. Al retomar (`resume`) no hay countdown y el startedAt no se pisa.
 */
function beginSession(mode: PlayerStartMode): void {
  const isFreshStart = mode !== 'resume'
  if (isFreshStart) sessionStartedAt.value = new Date().toISOString()
  if (player.value) {
    player.value.startTimer()
  }
  void wakeLock.requestWakeLock()
  if (isFreshStart) openCountdown()
}

/** Abre el 3-2-1 del bloque activo ("Bloque 1 de 4 · Initium" + su primer ejercicio) */
function openCountdown(): void {
  const p = player.value
  const block = p?.currentBlock.value
  countdownCopy.value =
    p && block
      ? blockCountdownCopy(block, p.currentBlockIndex.value, journey.value.length)
      : { kicker: '', subtitle: '' }
  showCountdown.value = true
}

function onCountdownDone(): void {
  showCountdown.value = false
}

/**
 * "Empezar {bloque}": completa el bloque que se terminó y arranca el 3-2-1 del que sigue (los
 * textos del 3-2-1 se arman antes de avanzar: el índice cambia recién cuando termina el guardado).
 */
async function onTransitionStart(): Promise<void> {
  const p = player.value
  const data = transitionData.value
  if (!p || !data || isAdvancing.value) return
  isAdvancing.value = true
  try {
    if (data.next === 'block') {
      const nextIndex = activeBlockIndex.value + 1
      const nextBlock = p.visibleBlocks.value[nextIndex]
      if (nextBlock) {
        countdownCopy.value = blockCountdownCopy(nextBlock, nextIndex, journey.value.length)
        showCountdown.value = true
        transitionData.value = null
      }
    }
    await p.completeBlock()
    // Camino defensivo: una transición hacia el final cierra la sesión sin 3-2-1
    if (data.next === 'end' || p.isSessionComplete.value) {
      showCountdown.value = false
      showCelebration.value = true
      await wakeLock.releaseWakeLock()
    }
  } finally {
    transitionData.value = null
    isAdvancing.value = false
  }
}

/** "Volver al último ejercicio": destilda el último (la historia vuelve a él) y la pantalla se apaga sola */
function onTransitionBack(): void {
  progressionView.value?.undoLast()
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

/**
 * Cierre de la sesión: BlockProgressionView lo emite desde el "Sesión completa" del último bloque
 * (entre bloques lo resuelve la pantalla de transición, no esto).
 */
async function onBlockComplete(): Promise<void> {
  const p = player.value
  if (!p) return
  const wasFinal = activeIsFinal.value

  await p.completeBlock()

  // Sesión completa: directo a la celebración
  if (wasFinal || p.isSessionComplete.value) {
    showCelebration.value = true
    await wakeLock.releaseWakeLock()
  }
}

async function onSummaryFinish(data: { rpe: number | null; notes: string | null }): Promise<void> {
  if (!session.value || !player.value) return

  isSubmitting.value = true
  try {
    const success = await goalPlanStore.completeGoalPlanSession({
      dayId: session.value.dayId,
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
  // Navigate to Mi Templo after viewing progress
  router.push('/mi-templo')
}

function navigateBack(): void {
  router.push('/training')
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
      sessionStartedAt.value = null
      showCelebration.value = false
      showSummary.value = false
      showProgress.value = false
      transitionData.value = null
      isAdvancing.value = false
      showCountdown.value = false
      isInitialized.value = false
      await player.value.initialize()
      // Reinicio explícito: arranca de nuevo directo al 3-2-1 (el progreso ya se borró)
      beginSession('countdown')
      isInitialized.value = true
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
  // Guard: must have active goal plan
  if (!goalPlanStore.hasActiveGoalPlan) {
    await goalPlanStore.fetchActiveGoalPlan()
    if (!goalPlanStore.hasActiveGoalPlan) {
      log.warn('No active goal plan, redirecting to training')
      void router.replace({ name: 'training' })
      return
    }
  }

  // Determine current week from the gym-wide SPOM week
  const week = goalPlanStore.currentWeek

  try {
    isLoading.value = true
    await goalPlanStore.fetchSession(week, todaySpanishDay.value)
    session.value = goalPlanStore.currentSession

    if (session.value) {
      goalPlanStore.setCurrentWeek(session.value.week)
      log.debug('Goal plan session loaded', {
        dayId: session.value.dayId,
        blockCount: session.value.blocks.length,
      })
    } else {
      log.warn('No session found for current week/day', {
        week,
        day: todaySpanishDay.value,
      })
    }
  } catch (err: unknown) {
    log.error('Failed to load goal plan session', {
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
    if (s && !isInitialized.value && !startClaimed) {
      startClaimed = true // sincrónico, antes del primer await
      await new Promise((r) => setTimeout(r, 0))
      if (player.value) {
        await player.value.initialize()
        // Con progreso previo retoma sin countdown; sin progreso arranca solo (3-2-1)
        const mode = resolvePlayerStart({
          hasPriorProgress:
            player.value.elapsedSeconds.value > 0 || player.value.completedBlocks.value.length > 0,
          needsDeuterosChoice: false, // las sesiones de plan por objetivo no tienen Deuteros
        })
        beginSession(mode)
      }
      isInitialized.value = true
    }
  },
  { immediate: true },
)

onMounted(() => {
  void loadSession()
  wakeLock.initialize()

  // Ensure metadata is loaded for goal plan name display
  if (goalPlanStore.goalPlanMetadata.length === 0) {
    void goalPlanStore.fetchMetadata()
  }
})

onUnmounted(() => {
  if (player.value) player.value.cleanup()
  wakeLock.cleanup()
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.goal-plan-session {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: $cream;
}

.goal-plan-session__badge {
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

.goal-plan-session__loading,
.goal-plan-session__empty {
  flex: 1;
  padding: 24px;
}
</style>
