<template>
  <q-page class="free-block-player">
    <!-- Cargando el bloque -->
    <div v-if="stage === 'loading'" class="free-block-player__center flex flex-center">
      <TemploLoader size="lg" />
    </div>

    <!-- El bloque ya no está en la canasta (404) -->
    <div v-else-if="stage === 'missing'" class="free-block-player__center flex flex-center column">
      <q-icon
        name="event_busy"
        size="80px"
        class="free-block-player__missing-icon"
        aria-hidden="true"
      />
      <div class="free-block-player__missing text-h6 q-mt-md">
        Este bloque ya no está disponible.
      </div>
      <q-btn flat color="primary" label="Volver a Libre" class="q-mt-lg" @click="goToLibre" />
    </div>

    <!-- 3-2-1 antes de arrancar (se entra directo, sin pantalla de inicio) -->
    <CountdownOverlay
      v-else-if="stage === 'countdown'"
      :kicker="countdownCopy.kicker"
      @done="onCountdownDone"
    />

    <!-- Pantalla 4: celebración. T-197-39: el "+5" sale de la respuesta del servidor -->
    <FreeBlockCelebration
      v-else-if="stage === 'celebration'"
      :aura-awarded="lastResult?.auraAwarded === true"
      :quote="celebrationQuote"
      @view-summary="onCelebrationViewSummary"
    />

    <!-- Pantalla 5: resumen -->
    <FreeBlockSummary
      v-else-if="stage === 'summary' && item && lastResult"
      :block="item"
      :completed-exercise-ids="savedExerciseIds"
      :duration-seconds="lastResult.durationSeconds"
      :aura-awarded="awardedInRun"
      :can-earn-aura="canEarnAura"
      :day-label="dayLabel"
      @done="onSummaryDone"
      @pick-another="onPickAnother"
      @keep-training="onKeepTraining"
    />

    <!-- Pantalla 2 y 3: en curso / bloque completo (el cierre vive en StoryExerciseCard) -->
    <template v-else-if="(stage === 'playing' || stage === 'saving') && player">
      <BlockProgressionView
        day-name=""
        mode="free"
        :aura-goal-seconds="auraGoalSeconds"
        :playable-blocks="playableBlocks"
        :active-block-index="activeBlockIndex"
        :completed-blocks="completedBlocks"
        :elapsed-seconds="elapsedSeconds"
        :completed-exercises="allCompletedExercises"
        @back="requestExit"
        @restart="restartBlock"
        @complete-block="onBlockComplete"
        @toggle-exercise-complete="onToggleExerciseComplete"
      />
      <div v-if="stage === 'saving'" class="free-block-player__saving flex flex-center">
        <TemploLoader size="lg" />
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useQuasar } from 'quasar'

// Components
import TemploLoader from 'src/components/TemploLoader.vue'
import CountdownOverlay from '../components/player/CountdownOverlay.vue'
import FreeBlockCelebration from '../components/player/FreeBlockCelebration.vue'
import FreeBlockSummary from '../components/player/FreeBlockSummary.vue'
import BlockProgressionView from '../components/BlockProgressionView.vue'

// Composables, stores and helpers
import { useSessionPlayer } from '../composables/useSessionPlayer'
import { useWakeLock } from '../composables/useWakeLock'
import { useFreeBlockCompletion } from '../composables/useFreeBlockCompletion'
import { useFreeBlocksStore } from '../stores/freeBlocksStore'
import { useUserStore } from 'src/stores/useUserStore'
import { createLogger } from 'src/utils/logger'
import { DEFAULT_BRANCH_TZ, todayInTz } from 'src/utils/tz'
import { dayKicker } from '../utils/weekLabels'
import { freeCountdownCopy } from '../utils/blockTransition'
import { getQuoteForBlock } from '../data/quotes'
import { FREE_BLOCK_AURA_MIN_SECONDS } from '../types/free-blocks'
import type { FreeBlockCompleteResponse, FreeBlockItem } from '../types/free-blocks'
import type { Session } from '../types/session'

const log = createLogger('FreeBlockPlayer')

// Fase 197 D-15: modo bloque libre. Orquesta
// 3-2-1 -> en curso -> guardado -> celebración -> resumen (-> "Seguir entrenando").
// D-13: esta página NO toca la semana, la racha, el RPE, las notas ni los ajustes de dificultad.
// D-12: si abandona antes de terminar no se guarda nada.

type Stage =
  | 'loading'
  | 'missing'
  | 'countdown'
  | 'playing'
  | 'saving'
  | 'celebration'
  | 'summary'

const route = useRoute()
const router = useRouter()
const $q = useQuasar()
const userStore = useUserStore()
const freeBlocksStore = useFreeBlocksStore()
const wakeLock = useWakeLock()
const completion = useFreeBlockCompletion()

const stage = ref<Stage>('loading')
const item = ref<FreeBlockItem | null>(null)
const session = shallowRef<Session | null>(null)
const player = shallowRef<ReturnType<typeof useSessionPlayer> | null>(null)

/** Fila ya guardada en el servidor: el segundo cierre ("Seguir entrenando") la actualiza (D-12) */
const completionId = ref<number | null>(null)
/** Última respuesta del servidor: manda la celebración y el resumen (T-197-39) */
const lastResult = ref<FreeBlockCompleteResponse | null>(null)
/** Ejercicios hechos en todas las vueltas guardadas (el servidor une los de cada cierre) */
const savedExerciseIds = ref<number[]>([])
/** true si algún cierre de esta visita acreditó el AURA del día */
const awardedInRun = ref(false)
/** true una vez confirmada la salida: el guard de la ruta no vuelve a preguntar */
const exitConfirmed = ref(false)
let disposed = false
/** Guard del arranque automático: corre UNA sola vez por montaje ("Reiniciar" arranca a mano) */
let autoStarted = false

const blockIdParam = computed(() => {
  const raw = route.params.blockId
  return Array.isArray(raw) ? (raw[0] ?? '') : raw
})

// Hoy en la zona de la sede (D-12): varía la cita y el día del resumen
const today = computed(() => todayInTz(userStore.profile?.branchTimezone ?? DEFAULT_BRANCH_TZ))
const dayOffset = computed(() => new Date(today.value + 'T00:00:00').getDay())
// Índice 4, distinto de las citas de bloque (igual que la celebración de la sesión completa)
const celebrationQuote = computed(() => getQuoteForBlock(4, dayOffset.value))
const dayLabel = computed(() => dayKicker(today.value, ''))

// "Seguir entrenando" solo si terminó en menos de 10' y todavía hay AURA hoy (D-12)
const canEarnAura = computed(() => {
  const res = lastResult.value
  if (!res) return false
  return (
    res.auraAvailableToday &&
    !awardedInRun.value &&
    res.durationSeconds < FREE_BLOCK_AURA_MIN_SECONDS
  )
})

// Barrita dorada de AURA: solo si todavía queda AURA por cobrar hoy (D-12)
const auraGoalSeconds = computed(() =>
  freeBlocksStore.auraAvailableToday ? FREE_BLOCK_AURA_MIN_SECONDS : null,
)

// Texto del 3-2-1: "Bloque libre · {nombre}"
const countdownCopy = computed(() =>
  item.value ? freeCountdownCopy(item.value) : { kicker: 'Bloque libre' },
)

// Puente player -> vista
const playableBlocks = computed(() => player.value?.playableBlocks.value ?? [])
const activeBlockIndex = computed(() => player.value?.currentBlockIndex.value ?? 0)
const completedBlocks = computed(() => player.value?.completedBlocks.value ?? [])
const elapsedSeconds = computed(() => player.value?.elapsedSeconds.value ?? 0)
const allCompletedExercises = computed<Record<string, number[]>>(
  () => player.value?.completedExercises.value ?? {},
)

/** Salir pierde el bloque solo si todavía no se guardó nada (D-12) */
const needsExitConfirm = computed(
  () =>
    !exitConfirmed.value &&
    completionId.value === null &&
    (stage.value === 'countdown' || stage.value === 'playing'),
)

/** Session sintética de 1 bloque con dayId propio (D-15): no pisa el progreso de la sesión real */
function buildSyntheticSession(block: FreeBlockItem): Session {
  return {
    dayId: 'XB-' + block.blockId,
    week: 0,
    day: '',
    levelGroup: block.level,
    blockCount: 1,
    blocks: [{ ...block, sortOrder: 0 }],
    sessionMode: 'regular',
  }
}

function createPlayer(s: Session): void {
  if (player.value) player.value.cleanup()
  player.value = useSessionPlayer(s, { freeBlock: true })
}

function goToLibre(): void {
  void router.push({ name: 'training', query: { tab: 'libre' } })
}

/** Salir sin guardar: frena el reloj, borra el progreso local XB y libera la pantalla */
async function leaveWithoutSaving(): Promise<void> {
  if (player.value) {
    player.value.pauseTimer()
    await player.value.clearProgress()
  }
  await wakeLock.releaseWakeLock()
}

const exitDialogOpts = {
  title: '¿Salir del bloque libre?',
  message: 'Si salís ahora, el bloque no se guarda.',
  cancel: { label: 'Cancelar', flat: true },
  // Gap 197-24 (hallazgo 10): `color: 'negative'` daba 4,43:1 sobre el diálogo. La clase global
  // `player-exit-ok` (css/app.scss) pone el rojo oscuro $pd-neg-b (>= 7:1).
  ok: { label: 'Salir', flat: true, class: 'player-exit-ok' },
  persistent: true,
}

function requestExit(): void {
  if (stage.value === 'saving') return
  if (needsExitConfirm.value) {
    $q.dialog(exitDialogOpts).onOk(async () => {
      exitConfirmed.value = true
      await leaveWithoutSaving()
      goToLibre()
    })
    return
  }
  exitConfirmed.value = true
  void leaveWithoutSaving().then(goToLibre)
}

onBeforeRouteLeave((_to, _from, next) => {
  if (stage.value === 'saving') {
    next(false)
    return
  }
  if (!needsExitConfirm.value) {
    next()
    return
  }
  $q.dialog(exitDialogOpts)
    .onOk(async () => {
      exitConfirmed.value = true
      await leaveWithoutSaving()
      next()
    })
    .onCancel(() => next(false))
})

/** Arranca el bloque (antes lo hacía el botón "Empezar" del inicio): reloj, pantalla y 3-2-1 */
function beginBlock(): void {
  if (!player.value) return
  player.value.startTimer()
  void wakeLock.requestWakeLock()
  stage.value = 'countdown'
}

function onCountdownDone(): void {
  stage.value = 'playing'
}

async function onToggleExerciseComplete(payload: { prescriptionId: number }): Promise<void> {
  if (player.value) {
    await player.value.toggleExerciseComplete(payload.prescriptionId)
  }
}

/** "Reiniciar": sin guardar re-arranca al 3-2-1 con un player nuevo, ya guardado es otra vuelta */
function restartBlock(): void {
  $q.dialog({
    title: 'Reiniciar bloque',
    message: 'Se perderá lo que hiciste hasta ahora. ¿Seguro?',
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Reiniciar', color: 'negative' },
    persistent: true,
  }).onOk(async () => {
    const p = player.value
    const s = session.value
    if (!p || !s) return
    if (completionId.value !== null) {
      await p.startAnotherRound()
      return
    }
    await p.clearProgress()
    // clearProgress no reinicia el acumulado interno del reloj: un player nuevo arranca en cero.
    createPlayer(s)
    await player.value?.initialize()
    // beginBlock vuelve a pedir el wake lock: se suelta antes para no dejar un sentinel huérfano
    await wakeLock.releaseWakeLock()
    beginBlock()
  })
}

/**
 * Cierre del bloque (D-12): pausa el reloj, guarda en el servidor y recién ahí celebra.
 * D-13: va a /sessions/free-blocks/complete, nunca a /sessions/complete.
 */
async function onBlockComplete(): Promise<void> {
  const p = player.value
  const block = item.value
  if (!p || !block || stage.value === 'saving') return

  await p.completeBlock() // pausa el reloj
  stage.value = 'saving'

  const exercisesCompleted = [...(p.completedExercises.value[block.role] ?? [])]
  // El inicio sale del reloj que ve el socio: la duración del servidor coincide con la barrita
  const startedAt = new Date(Date.now() - p.elapsedSeconds.value * 1000).toISOString()

  const res = await completion.complete({
    blockId: block.blockId,
    startedAt,
    exercisesCompleted,
    ...(completionId.value !== null ? { completionId: completionId.value } : {}),
  })
  if (disposed) return

  if (!res) {
    $q.notify({
      type: 'negative',
      message: 'No pudimos guardar el bloque. Probá de nuevo.',
      icon: 'error',
      position: 'top',
      timeout: 3000,
    })
    p.startTimer() // el reloj sigue mientras reintenta
    stage.value = 'playing'
    return
  }

  completionId.value = res.completionId
  lastResult.value = res
  savedExerciseIds.value = [...new Set([...savedExerciseIds.value, ...exercisesCompleted])]
  if (res.auraAwarded) awardedInRun.value = true
  await wakeLock.releaseWakeLock()
  stage.value = 'celebration'
}

function onCelebrationViewSummary(): void {
  stage.value = 'summary'
}

/** "Seguir entrenando": otra vuelta con el reloj corriendo, el cierre actualiza la misma fila */
async function onKeepTraining(): Promise<void> {
  if (!player.value) return
  await player.value.startAnotherRound()
  void wakeLock.requestWakeLock()
  stage.value = 'playing'
}

/** "Listo": ya está guardado, vuelve a Libre */
function onSummaryDone(): void {
  exitConfirmed.value = true
  void leaveWithoutSaving().then(goToLibre)
}

/** "Elegir otro bloque": limpia el filtro de grupo y vuelve a Libre */
function onPickAnother(): void {
  void freeBlocksStore.setGroup(null)
  onSummaryDone()
}

onMounted(async () => {
  void wakeLock.initialize()
  const found = await freeBlocksStore.fetchBlock(blockIdParam.value)
  if (disposed) return
  if (!found) {
    stage.value = 'missing'
    return
  }
  const s = buildSyntheticSession(found)
  item.value = found
  session.value = s
  createPlayer(s)
  // D-12: cada entrada empieza de cero, si abandonó antes no hay nada que retomar
  await player.value?.clearProgress()
  await player.value?.initialize()
  if (disposed) return
  log.info('Bloque libre listo', { blockId: found.blockId })
  if (autoStarted) return
  autoStarted = true
  beginBlock()
})

onUnmounted(() => {
  disposed = true
  if (player.value) player.value.cleanup()
  wakeLock.cleanup()
  completion.cleanup()
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';
@import 'src/css/premium-card';

.free-block-player {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: $cream;
}

.free-block-player__center {
  flex: 1;
  padding: 24px;
}

.free-block-player__saving {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba($cream, 0.7);
}

.free-block-player__missing {
  color: $pd-ink;
  text-align: center;
}

// Gap 197-24 (hallazgo 8): el ícono 404 era grey-4 (1,13:1). Los íconos de UI piden >= 3:1.
.free-block-player__missing-icon {
  color: $pd-ink-2;
}
</style>
