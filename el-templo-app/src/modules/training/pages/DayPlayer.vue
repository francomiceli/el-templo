<template>
  <q-page class="day-player">
    <!-- Between-block Transition Screen: overlay sobre el player, que queda montado debajo para que
         "Volver al último ejercicio" encuentre la historia donde estaba -->
    <TransitionScreen
      v-if="transitionData"
      :data="transitionData"
      @start="onTransitionStart"
      @back="onTransitionBack"
    />

    <!-- 3-2-1 Countdown before a block starts (session start, Deuteros choice, between blocks) -->
    <CountdownOverlay
      v-if="showCountdown"
      :kicker="countdownCopy.kicker"
      :subtitle="countdownCopy.subtitle"
      @done="onCountdownDone"
    />

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
      <q-icon name="event_busy" size="80px" class="day-player__empty-icon" aria-hidden="true" />
      <div class="day-player__empty-text text-h6 q-mt-md">No hay sesión para este día</div>
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
        ref="progressionView"
        :day-name="dayName"
        :playable-blocks="playableBlocks"
        :active-block-index="activeBlockIndex"
        :completed-blocks="completedBlocks"
        :elapsed-seconds="elapsedSeconds"
        :completed-exercises="allCompletedExercises"
        :is-adjusting="isAdjusting"
        :is-final-block="activeIsFinal"
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
import { resolvePlayerStart, type PlayerStartMode } from '../utils/playerStart'
import { useUserStore } from 'src/stores/useUserStore'
import { createLogger } from 'src/utils/logger'
import { sessionTitle } from '../utils/blockMeta'
import {
  blockCountdownCopy,
  buildBlockTransition,
  isBlockExercisesDone,
  isFinalBlock,
  sessionJourney,
  type BlockTransitionData,
  type CountdownCopy,
} from '../utils/blockTransition'

// Data
import { getQuoteForBlock } from '../data/quotes'

const log = createLogger('DayPlayer')

// Day Player Page - Orchestrator for session flow:
// 3-2-1 (o retoma) -> deuteros choice -> block progression (stories) -> transition (recorrido +
// descanso activo) -> 3-2-1 -> ... -> celebration -> summary

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
/** true una vez que el player arrancó (o retomó): habilita el selector de Deuteros */
const sessionBegun = ref(false)
const isInitialized = ref(false)
/**
 * Guard del arranque automático: corre UNA sola vez por entrada. El watch de `session` puede
 * dispararse de nuevo (recarga de la semana, cambio de nivel) mientras espera el `await`, y un
 * segundo arranque duplicaría el timer y el 3-2-1. "Reiniciar" arranca a mano, no pasa por acá.
 */
let startClaimed = false
/** initialize() del wake lock: en nativo carga el plugin con un import dinámico */
let wakeLockReady: Promise<void> = Promise.resolve()

// Block transition state (fase 197, sketch 018 D): entre bloques hay UNA pantalla, con el recorrido
// y el descanso activo. Se muestra mientras el bloque activo tenga todos los ejercicios tildados y
// todavía no esté dado por terminado: el bloque se completa recién con "Empezar", así "Volver al
// último ejercicio" es un simple destildar y la reanudación cae en la misma pantalla.
const transitionData = shallowRef<BlockTransitionData | null>(null)
/** true mientras "Empezar" completa el bloque (el guardado es async): congela la pantalla */
const isAdvancing = ref(false)
const countdownCopy = ref<CountdownCopy>({ kicker: '', subtitle: '' })
const progressionView = ref<InstanceType<typeof BlockProgressionView> | null>(null)

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

// Day offset for quote variety across days
const dayOffset = computed(() => {
  if (!dateParam.value) return 0
  const d = new Date(dateParam.value + 'T00:00:00')
  return d.getDay() // 0=Sunday, 1=Monday, ..., 6=Saturday
})

// Celebration quote (use index 4, distinct from block quotes)
const celebrationQuote = computed(() => getQuoteForBlock(4, dayOffset.value))

// Computed display states
// Con sesión pero sin arrancar todavía: loader (así no se asoma la vista del bloque antes del 3-2-1)
const isLoading = computed(
  () =>
    weekLoading.value ||
    (!session.value && !weekDay.value) ||
    (session.value !== null && !isInitialized.value),
)

const showDeuterosChoice = computed(() => {
  if (!player.value) return false
  return sessionBegun.value && player.value.needsDeuterosChoice.value
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

// Sesión con Deuteros y todavía sin elegir: el recorrido muestra un solo lugar "Deuteros"
const awaitingDeuteros = computed(() => {
  const p = player.value
  return !!p && p.hasDeuterosBlocks.value && !p.deuterosChoice.value
})

/** Todos los pasos de la sesión en orden (4 con Deuteros aunque todavía no se haya elegido) */
const journey = computed(() => {
  const s = session.value
  const p = player.value
  if (!s || !p) return []
  return sessionJourney({
    allBlocks: s.blocks,
    playable: p.playableBlocks.value,
    awaitingDeuteros: awaitingDeuteros.value,
  })
})

/** El bloque activo es el último de la sesión: no hay transición, queda "Sesión completa" */
const activeIsFinal = computed(() =>
  isFinalBlock({
    index: activeBlockIndex.value,
    playableCount: playableBlocks.value.length,
    awaitingDeuteros: awaitingDeuteros.value,
  }),
)

/** El bloque activo tiene todos los ejercicios tildados y todavía no se dio por terminado */
const blockReadyForTransition = computed(() => {
  const p = player.value
  if (!p || !sessionBegun.value || !isInitialized.value || activeIsFinal.value) return false
  const block = p.currentBlock.value
  if (!block || p.completedBlocks.value.includes(block.role)) return false
  return isBlockExercisesDone(block, p.completedExercises.value)
})

// La pantalla se arma una sola vez al quedar lista (foto fija de los datos) y se apaga al destildar
// un ejercicio ("Volver al último ejercicio"). Mientras "Empezar" guarda, no se toca.
watch(
  blockReadyForTransition,
  (ready) => {
    if (isAdvancing.value) return
    const s = session.value
    transitionData.value =
      ready && s
        ? buildBlockTransition({
            title: sessionTitle(s),
            entries: journey.value,
            completedIndex: activeBlockIndex.value,
          })
        : null
  },
  { immediate: true },
)

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

/**
 * Arranca el player (antes lo hacía el botón COMENZAR de la pantalla intermedia): timer, wake lock
 * y, si es un arranque nuevo, el 3-2-1. Con Deuteros por elegir el 3-2-1 llega en `onDeuterosSelect`.
 */
function applyStartMode(mode: PlayerStartMode): void {
  const p = player.value
  sessionBegun.value = true
  // Al retomar, startedAt se reconstruye del tiempo persistido: sin esto la sesión retomada
  // registraría duración cero (onSummaryFinish caería a startedAt = ahora).
  sessionStartedAt.value =
    mode === 'resume' && p
      ? new Date(Date.now() - p.elapsedSeconds.value * 1000).toISOString()
      : new Date().toISOString()
  if (p) p.startTimer()
  void wakeLockReady.then(() => wakeLock.requestWakeLock())
  if (mode === 'countdown') openCountdown()
}

/**
 * Abre el 3-2-1 del bloque activo ("Bloque 2 de 4 · Combos I" + su primer ejercicio). Se usa donde
 * el índice ya apunta al bloque que arranca (inicio de sesión, elección de Deuteros); entre bloques
 * los textos se arman antes de avanzar (`onTransitionStart`).
 */
function openCountdown(): void {
  const p = player.value
  const block = p?.currentBlock.value
  countdownCopy.value =
    p && block
      ? blockCountdownCopy(block, p.currentBlockIndex.value, journey.value.length)
      : { kicker: '', subtitle: '' }
  showCountdown.value = true
}

function onDeuterosSelect(choiceId: 'DEUTEROS_1' | 'DEUTEROS_2'): void {
  if (player.value) {
    // selectDeuteros fija la elección antes de su primer await: el índice 2 ya apunta al elegido
    void player.value.selectDeuteros(choiceId)
    openCountdown()
  }
}

function onChangeDeuteros(): void {
  if (player.value) {
    player.value.deuterosChoice.value = null
    player.value.currentBlockIndex.value = 2
  }
}

/**
 * "Empezar {bloque}": completa el bloque que se terminó y arranca el 3-2-1 del que sigue. Con el
 * Deuteros por elegir va directo al selector (que tiene su propio 3-2-1).
 */
async function onTransitionStart(): Promise<void> {
  const p = player.value
  const data = transitionData.value
  if (!p || !data || isAdvancing.value) return
  isAdvancing.value = true
  try {
    if (data.next === 'block') {
      // El 3-2-1 se arma ANTES de avanzar: el índice cambia recién cuando termina el guardado
      const nextIndex = activeBlockIndex.value + 1
      const nextBlock = p.playableBlocks.value[nextIndex]
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

function onCountdownDone(): void {
  showCountdown.value = false
}

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
  blockId: string
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

  // WR-01: target the EXACT block the member tapped (by blockId), not the first
  // block that happens to contain the exerciseId. A movement can recur across
  // blocks; matching by exerciseId alone would mutate the wrong occurrence.
  const block = s.blocks.find((b) => b.blockId === payload.blockId)
  if (!block) return
  const idx = block.exercises.findIndex((ex) => ex.exerciseId === payload.exerciseId)
  if (idx === -1) return

  const current = block.exercises[idx]

  // WR-02: the swapped-in exercise is a DIFFERENT movement, so clear any prior
  // completion for the old exerciseId in this block. Otherwise the now-absent
  // id would ship in `exercisesCompleted` at session end and drift into the
  // tree-% "completed" set. The member must complete the swapped exercise
  // afresh. (No-op if it was never marked complete.)
  if (player.value) {
    await player.value.clearExerciseCompletion(block.role, payload.exerciseId)
  }

  // Swap ONLY the exercise identity into the source session block, preserving
  // the block's prescription (reps/seconds/format/dose/sortOrder/rest). The
  // playableBlocks computed re-derives from session.blocks, so mutating the
  // source exercise reflects through to the player.
  block.exercises[idx] = {
    ...current,
    exerciseId: neighbor.id,
    exerciseName: neighbor.name,
    contraction: neighbor.contraction,
    // WR-03: the endpoint returns the neighbor's clip URL so the swapped
    // exercise renders in-session immediately — no blank clip, no re-fetch.
    videoUrl: neighbor.videoUrl,
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
  // Clase global (css/app.scss): rojo oscuro sólido, igual que el bloque libre
  ok: { label: 'Salir', flat: true, class: 'player-exit-ok' },
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
      sessionBegun.value = false
      sessionStartedAt.value = null
      showCelebration.value = false
      showSummary.value = false
      transitionData.value = null
      isAdvancing.value = false
      showCountdown.value = false
      isInitialized.value = false
      await player.value.initialize()
      // Reinicio explícito: arranca de nuevo directo al 3-2-1 (el progreso ya se borró)
      applyStartMode(
        resolvePlayerStart({
          hasPriorProgress: false,
          needsDeuterosChoice: player.value.needsDeuterosChoice.value,
        }),
      )
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

async function loadWeekDataIfEmpty() {
  if (weekDay.value || weekLoading.value) return
  try {
    // Fase 197 D-03: la semana del día pedido ("Hacerla igual" de otra semana), no la actual
    const dates = getWeekDates(new Date(dateParam.value + 'T00:00:00'))
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
    if (s && !isInitialized.value && !startClaimed) {
      startClaimed = true // sincrónico, antes del primer await
      await new Promise((r) => setTimeout(r, 0))
      if (player.value) {
        // If the day is already completed (re-entry via "Repetir Sesión"),
        // clear any stale local progress so the session starts fresh
        const isCompleted = weekDay.value?.state === 'completed'
        if (isCompleted) {
          await player.value.clearProgress()
        }

        await player.value.initialize()
        const hasPriorProgress =
          !isCompleted &&
          (player.value.elapsedSeconds.value > 0 || player.value.completedBlocks.value.length > 0)
        // Sin progreso previo arranca solo (3-2-1); con progreso retoma sin countdown
        applyStartMode(
          resolvePlayerStart({
            hasPriorProgress,
            needsDeuterosChoice: player.value.needsDeuterosChoice.value,
          }),
        )
      }
      isInitialized.value = true
    }
  },
  { immediate: true },
)

onMounted(() => {
  loadWeekDataIfEmpty()
  wakeLockReady = wakeLock.initialize()

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
    await fetchWeekSessions(getWeekDates(new Date(dateParam.value + 'T00:00:00')))
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
@import 'src/css/premium-card';

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

// Estado vacío en tinta sólida (mismo criterio que el bloque libre): el grey-4 daba 1,13:1 en el
// ícono y el grey-6 no llega a 4,5:1 en el texto.
.day-player__empty-text {
  color: $pd-ink;
  text-align: center;
}

.day-player__empty-icon {
  color: $pd-ink-2;
}
</style>
