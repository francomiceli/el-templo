<template>
  <q-page class="free-block-player">
    <!-- Cargando el bloque -->
    <div v-if="stage === 'loading'" class="free-block-player__center flex flex-center">
      <TemploLoader size="lg" />
    </div>

    <!-- El bloque ya no está en la canasta (404) -->
    <div v-else-if="stage === 'missing'" class="free-block-player__center flex flex-center column">
      <q-icon name="event_busy" size="80px" color="grey-4" aria-hidden="true" />
      <div class="free-block-player__missing text-h6 q-mt-md">
        Este bloque ya no está disponible.
      </div>
      <q-btn flat color="primary" label="Volver a Libre" class="q-mt-lg" @click="goToLibre" />
    </div>

    <!-- Pantalla 1: inicio -->
    <FreeBlockSplash
      v-else-if="stage === 'splash' && item"
      :block="item"
      :level="userLevel"
      :aura-available="freeBlocksStore.auraAvailableToday"
      :quote="splashQuote"
      @start="onSplashStart"
      @back="requestExit"
    />

    <!-- 3-2-1 antes de arrancar -->
    <CountdownOverlay v-else-if="stage === 'countdown'" @done="onCountdownDone" />

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
import FreeBlockSplash from '../components/player/FreeBlockSplash.vue'
import BlockProgressionView from '../components/BlockProgressionView.vue'

// Composables, stores and helpers
import { useSessionPlayer } from '../composables/useSessionPlayer'
import { useWakeLock } from '../composables/useWakeLock'
import { useFreeBlocksStore } from '../stores/freeBlocksStore'
import { useUserStore } from 'src/stores/useUserStore'
import { createLogger } from 'src/utils/logger'
import { DEFAULT_BRANCH_TZ, todayInTz } from 'src/utils/tz'
import { getQuoteForBlock } from '../data/quotes'
import { FREE_BLOCK_AURA_MIN_SECONDS } from '../types/free-blocks'
import type { FreeBlockItem } from '../types/free-blocks'
import type { Session } from '../types/session'

const log = createLogger('FreeBlockPlayer')

// Fase 197 D-15: modo bloque libre. Orquesta
// inicio -> 3-2-1 -> en curso -> (guardado, celebración y resumen: tarea 2).
// D-13: esta página NO toca la semana, la racha, el RPE, las notas ni los ajustes de dificultad.
// D-12: si abandona antes de terminar no se guarda nada.

type Stage = 'loading' | 'missing' | 'splash' | 'countdown' | 'playing' | 'saving'

const route = useRoute()
const router = useRouter()
const $q = useQuasar()
const userStore = useUserStore()
const freeBlocksStore = useFreeBlocksStore()
const wakeLock = useWakeLock()

const stage = ref<Stage>('loading')
const item = ref<FreeBlockItem | null>(null)
const session = shallowRef<Session | null>(null)
const player = shallowRef<ReturnType<typeof useSessionPlayer> | null>(null)

/** Fila ya guardada en el servidor (se llena en el primer cierre, tarea 2) */
const completionId = ref<number | null>(null)
/** true una vez confirmada la salida: el guard de la ruta no vuelve a preguntar */
const exitConfirmed = ref(false)
let disposed = false

const blockIdParam = computed(() => {
  const raw = route.params.blockId
  return Array.isArray(raw) ? (raw[0] ?? '') : raw
})

// Nivel del header (cae al nivel de la plani de origen)
const userLevel = computed(() => userStore.activeLevel ?? item.value?.level ?? '')

// Hoy en la zona de la sede (D-12): varía la cita y el día del resumen
const today = computed(() => todayInTz(userStore.profile?.branchTimezone ?? DEFAULT_BRANCH_TZ))
const dayOffset = computed(() => new Date(today.value + 'T00:00:00').getDay())
const splashQuote = computed(() => getQuoteForBlock(0, dayOffset.value))

// Barrita dorada de AURA: solo si todavía queda AURA por cobrar hoy (D-12)
const auraGoalSeconds = computed(() =>
  freeBlocksStore.auraAvailableToday ? FREE_BLOCK_AURA_MIN_SECONDS : null,
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
  ok: { label: 'Salir', color: 'negative', flat: true },
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

function onSplashStart(): void {
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

/** "Reiniciar": sin guardar vuelve al inicio con un player nuevo, ya guardado es otra vuelta */
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
    await wakeLock.releaseWakeLock()
    stage.value = 'splash'
  })
}

async function onBlockComplete(): Promise<void> {
  if (!player.value) return
  // Pausa el reloj. El guardado en el servidor, la celebración y el resumen se suman en la tarea 2.
  await player.value.completeBlock()
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
  stage.value = 'splash'
})

onUnmounted(() => {
  disposed = true
  if (player.value) player.value.cleanup()
  wakeLock.cleanup()
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

.free-block-player__missing {
  color: $pd-ink;
  text-align: center;
}
</style>
