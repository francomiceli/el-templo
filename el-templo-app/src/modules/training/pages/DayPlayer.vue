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
        @back="handleBackNavigation"
        @restart="restartSession"
        @complete-block="onBlockComplete"
        @toggle-exercise-complete="onToggleExerciseComplete"
      />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useQuasar } from 'quasar'

// Components
import SplashScreen from '../components/player/SplashScreen.vue'
import TransitionScreen from '../components/player/TransitionScreen.vue'
import CelebrationScreen from '../components/player/CelebrationScreen.vue'
import SessionSummary from '../components/player/SessionSummary.vue'
import DeuterosSelector from '../components/DeuterosSelector.vue'
import BlockProgressionView from '../components/BlockProgressionView.vue'

// Composables and Stores
import { useSessionPlayer } from '../composables/useSessionPlayer'
import { useWakeLock } from '../composables/useWakeLock'
import { useSessionCompletion } from '../composables/useSessionCompletion'
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
const { sessions: weekSessions, loading: weekLoading, fetchWeekSessions } = useWeekData()

// Session completion composable
const { isSubmitting, totalDaysTrained, completeSession } = useSessionCompletion()

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
const sessionStartedAt = ref<string | null>(null)

// Session player composable (created when session is available)
const player = computed(() => {
  if (!session.value) return null
  return useSessionPlayer(session.value)
})

// User level for splash screen
const userLevel = computed(() => {
  return userStore.profile?.level ?? session.value?.levelGroup ?? ''
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
const blocksDataForSummary = computed(() => {
  if (!player.value) return []
  const roles = player.value.completedBlocks.value
  return player.value.playableBlocks.value
    .filter((b) => roles.includes(b.role))
    .map((b) => ({
      role: b.role,
      exercises: (b.exercises ?? []).map((ex) => ({ name: ex.exerciseName })),
    }))
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

const BLOCK_NAMES: Record<string, string> = {
  INITIUM: 'Initium',
  NUCLEUS: 'Nucleus',
  DEUTEROS_1: 'Deuteros',
  DEUTEROS_2: 'Deuteros',
  ATHLOS: 'Athlos',
  EPIKOS: 'Epikos',
}

function onSplashStart(): void {
  splashDismissed.value = true
  sessionStartedAt.value = new Date().toISOString()
  if (player.value) {
    player.value.startTimer()
  }
  wakeLock.requestWakeLock()
}

function onDeuterosSelect(choiceId: 'DEUTEROS_1' | 'DEUTEROS_2'): void {
  if (player.value) {
    player.value.selectDeuteros(choiceId)
  }
}

function onTransitionContinue(): void {
  showBlockTransition.value = false

  // If transition was for session complete, show celebration
  if (pendingCelebration.value) {
    pendingCelebration.value = false
    showCelebration.value = true
  }
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
  const isLastBlock = p.currentBlockIndex.value >= p.playableBlocks.value.length - 1
  let actionLabel = 'Siguiente Bloque'

  if (isLastBlock) {
    actionLabel = 'Finalizar Sesion'
  } else {
    const role = p.currentBlock.value?.role
    if (role === 'NUCLEUS' && !p.deuterosChoice.value) {
      actionLabel = 'Elige Deuteros'
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
    startedAt: sessionStartedAt.value ?? new Date().toISOString(),
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
      message: 'Sesion guardada!',
      icon: 'check_circle',
      position: 'top',
      timeout: 2000,
    })
    router.push({ name: 'training' })
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
        state: getDateState(date, []),
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
        await player.value.initialize()
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

onMounted(() => loadWeekDataIfEmpty())
onUnmounted(() => {
  if (player.value) player.value.cleanup()
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
