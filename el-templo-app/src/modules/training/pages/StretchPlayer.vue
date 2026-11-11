<template>
  <q-page class="stretch-player">
    <!-- Cargando la oferta de hoy -->
    <div v-if="stage === 'loading'" class="stretch-player__center flex flex-center">
      <TemploLoader size="lg" />
    </div>

    <!-- Sin oferta, ya hecha o vencida -->
    <div v-else-if="stage === 'missing'" class="stretch-player__center flex flex-center column">
      <q-icon
        name="event_busy"
        size="80px"
        class="stretch-player__missing-icon"
        aria-hidden="true"
      />
      <div class="stretch-player__missing text-h6 q-mt-md">{{ missingText }}</div>
      <q-btn
        flat
        color="primary"
        label="Volver a Mi Templo"
        class="q-mt-lg"
        @click="goToMiTemplo"
      />
    </div>

    <!-- 3-2-1 antes de arrancar (se entra directo, sin pantalla de inicio) -->
    <CountdownOverlay
      v-else-if="stage === 'countdown'"
      :kicker="countdownKicker"
      @done="onCountdownFinished"
    />

    <!-- Pantalla final (D-07): el "+5" y los minutos salen de la respuesta del servidor (T-213-31) -->
    <StretchDone
      v-else-if="stage === 'celebration' && lastResult"
      :minutes="lastResult.minutes"
      :aura-awarded="lastResult.auraAwarded"
      :local-date="localDate"
      @done="onDone"
    />

    <!-- En curso: el reloj por ejercicio es HERMANO de BlockProgressionView (el bloque lleva
         timerSpec null y `copy` apaga el reloj de bloque y los textos de entrenamiento) -->
    <div v-else-if="(stage === 'playing' || stage === 'saving') && player" class="stretch-player__run">
      <StretchClock :exercises="routine" :elapsed-ms="clockElapsedMs" />
      <div class="stretch-player__view">
        <BlockProgressionView
          day-name=""
          mode="free"
          :copy="playerCopy"
          :playable-blocks="playableBlocks"
          :active-block-index="activeBlockIndex"
          :completed-blocks="completedBlocks"
          :elapsed-seconds="elapsedSeconds"
          :completed-exercises="allCompletedExercises"
          @back="requestExit"
          @restart="restartRoutine"
          @complete-block="onBlockComplete"
          @toggle-exercise-complete="onToggleExerciseComplete"
        />
      </div>
      <div v-if="stage === 'saving'" class="stretch-player__saving flex flex-center">
        <TemploLoader size="lg" />
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useQuasar } from 'quasar'

// Components
import TemploLoader from 'src/components/TemploLoader.vue'
import CountdownOverlay from '../components/player/CountdownOverlay.vue'
import StretchClock from '../components/player/StretchClock.vue'
import StretchDone from '../components/player/StretchDone.vue'
import BlockProgressionView from '../components/BlockProgressionView.vue'

// Composables, stores and helpers
import {
  useSingleBlockPlayer,
  type SingleBlockSaveInput,
} from '../composables/useSingleBlockPlayer'
import { useWakeLock } from '../composables/useWakeLock'
import { useStretchCompletion } from '../composables/useStretchCompletion'
import { useStretchStore } from 'src/stores/useStretchStore'
import { createLogger } from 'src/utils/logger'
import { confirmDialog, type ConfirmDialogOptions } from 'src/utils/confirm-dialog'
import type { PlayerCopyOverride } from '../utils/playerHeader'
import {
  buildStretchSession,
  isStretchExpiredMessage,
  stretchClockElapsedMs,
} from '../utils/stretchSession'
import type {
  StretchCompleteResponse,
  StretchEventFrom,
  StretchExercise,
} from '../types/stretch'

const log = createLogger('StretchPlayer')

// Fase 213 D-07: player del estiramiento post-clase sobre useSingleBlockPlayer (el mismo que usa
// FreeBlockPlayer). Orquesta 3-2-1 -> en curso -> guardado -> pantalla final corta.
// La rutina la arma el servidor (T-213-27): acá solo se la reproduce. La duración y el AURA los
// decide el servidor (T-213-31). Sin RPE, sin notas y sin "Seguir entrenando".
// D-12: sin oferta, ya hecha o vencida (push tocado al día siguiente) la página avisa y vuelve.

const route = useRoute()
const router = useRouter()
const $q = useQuasar()
const wakeLock = useWakeLock()
const completion = useStretchCompletion()
const stretchStore = useStretchStore()

const MSG_YA_HECHO = 'Ya estiraste hoy.'
const MSG_NO_DISPONIBLE =
  'Este estiramiento ya no está disponible. Aparece después de tu próxima clase.'
const MSG_NO_CARGO = 'No pudimos cargar el estiramiento. Probá de nuevo en un rato.'

/** Textos del player: el encabezado y el cierre de un estiramiento, no los de un bloque libre */
const playerCopy: PlayerCopyOverride = {
  kicker: 'Estiramiento',
  name: 'Post-clase',
  done: {
    title: 'Rutina completa',
    subtitle: 'Marcaste todos los ejercicios.',
    buttonLabel: 'Terminar',
  },
}

const routine = ref<StretchExercise[]>([])
const offerId = ref<number | null>(null)
const localDate = ref('')
const minutes = ref(0)
const missingText = ref(MSG_NO_DISPONIBLE)
/** Respuesta del servidor al cierre: manda la pantalla final */
const lastResult = ref<StretchCompleteResponse | null>(null)
/** El último cierre falló porque la oferta venció (410): ya no tiene sentido reintentar */
let expiredOnSave = false

/**
 * Segundos del reloj del player en el momento del paso a `playing` (fin del 3-2-1). El reloj del
 * player arranca junto con el 3-2-1, así que sin este ancla la rutina perdería la primera
 * transición. `null` = todavía en el 3-2-1.
 */
const clockStartElapsed = ref<number | null>(null)

/** Cierre: el servidor calcula la duración (de `started_at`) y decide el AURA */
async function saveStretch(input: SingleBlockSaveInput): Promise<StretchCompleteResponse | null> {
  const id = offerId.value
  if (id === null) return null

  expiredOnSave = false
  const res = await completion.complete({ offerId: id, exercisesCompleted: input.exercisesCompleted })
  if (single.isDisposed()) return null

  if (!res) {
    if (isStretchExpiredMessage(completion.error.value)) {
      expiredOnSave = true
      return null
    }
    $q.notify({
      type: 'negative',
      message: 'No pudimos guardar el estiramiento. Probá de nuevo.',
      icon: 'error',
      position: 'top',
      timeout: 3000,
    })
    return null
  }

  lastResult.value = res
  return res
}

const single = useSingleBlockPlayer<StretchCompleteResponse>({
  wakeLock,
  save: saveStretch,
})

const {
  stage,
  player,
  playableBlocks,
  activeBlockIndex,
  completedBlocks,
  elapsedSeconds,
  allCompletedExercises,
  needsExitConfirm,
} = single

const clockElapsedMs = computed(() =>
  stretchClockElapsedMs(elapsedSeconds.value, clockStartElapsed.value),
)

const countdownKicker = computed(() => `Estiramiento · ${minutes.value} min`)

function goToMiTemplo(): void {
  void router.push('/mi-templo')
}

/** Fin del 3-2-1: ancla el reloj de la rutina y pasa a `playing` */
function onCountdownFinished(): void {
  clockStartElapsed.value = elapsedSeconds.value
  single.onCountdownDone()
}

const exitDialogOpts: ConfirmDialogOptions = {
  title: '¿Salir del estiramiento?',
  message: 'Si salís ahora, no se guarda.',
  okLabel: 'Salir',
  destructive: true,
}

function requestExit(): void {
  if (stage.value === 'saving') return
  if (needsExitConfirm.value) {
    confirmDialog($q, exitDialogOpts).onOk(async () => {
      single.confirmExit()
      await single.leaveWithoutSaving()
      goToMiTemplo()
    })
    return
  }
  single.confirmExit()
  void single.leaveWithoutSaving().then(goToMiTemplo)
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
  confirmDialog($q, exitDialogOpts)
    .onOk(async () => {
      single.confirmExit()
      await single.leaveWithoutSaving()
      next()
    })
    .onCancel(() => next(false))
})

async function onToggleExerciseComplete(payload: { prescriptionId: number }): Promise<void> {
  await single.toggleExercise(payload.prescriptionId)
}

/** "Reiniciar": vuelve al 3-2-1 con un player nuevo; el reloj se vuelve a anclar al terminar */
function restartRoutine(): void {
  confirmDialog($q, {
    title: '¿Empezar de nuevo?',
    message: 'Se pierde lo que hiciste hasta ahora.',
    okLabel: 'Empezar',
    destructive: true,
  }).onOk(async () => {
    clockStartElapsed.value = null
    await single.restart()
  })
}

/** Cierre: guarda y recién ahí muestra la pantalla final; una oferta vencida corta acá (D-12) */
async function onBlockComplete(): Promise<void> {
  const result = await single.completeBlock()
  if (result === null && expiredOnSave && !single.isDisposed()) {
    await single.leaveWithoutSaving()
    missingText.value = MSG_NO_DISPONIBLE
    single.markMissing()
  }
}

/** "Volver a Mi Templo": ya está guardado, la card de Mi Templo ya lo sabe (§5.3.5) */
function onDone(): void {
  single.confirmExit()
  void single.leaveWithoutSaving().then(goToMiTemplo)
}

onMounted(async () => {
  void wakeLock.initialize()
  const from: StretchEventFrom = route.query.from === 'push' ? 'push' : 'card'
  // T-213-30: solo mide la apertura del push; no da AURA ni cambia la rutina
  if (from === 'push') void completion.sendEvent('push_opened')

  await stretchStore.load()
  if (single.isDisposed()) return

  const today = stretchStore.today
  if (!today) {
    missingText.value = stretchStore.loadFailed ? MSG_NO_CARGO : MSG_NO_DISPONIBLE
    single.markMissing()
    return
  }
  if (today.status === 'done') {
    missingText.value = MSG_YA_HECHO
    single.markMissing()
    return
  }
  if (today.status !== 'available' || today.offerId === null || today.exercises.length === 0) {
    missingText.value = MSG_NO_DISPONIBLE
    single.markMissing()
    return
  }

  offerId.value = today.offerId
  localDate.value = today.localDate
  minutes.value = today.minutes ?? Math.max(1, Math.round((today.plannedSeconds ?? 0) / 60))
  routine.value = today.exercises
  // Cada entrada empieza de cero: si abandonó antes no hay nada que retomar
  await single.load(buildStretchSession(today))
  if (single.isDisposed()) return
  void completion.sendEvent('started', from)
  log.info('Estiramiento listo', { from, minutes: minutes.value })
})

onUnmounted(() => {
  single.cleanup()
  wakeLock.cleanup()
  completion.cleanup()
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';
@import 'src/css/premium-card';

.stretch-player {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: $cream;
}

.stretch-player__center {
  flex: 1;
  padding: 24px;
}

// Reloj arriba y el player debajo; el player ocupa el resto (BlockProgressionView trae height 100%)
.stretch-player__run {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.stretch-player__view {
  flex: 1;
  min-height: 0;
}

.stretch-player__saving {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba($cream, 0.7);
}

.stretch-player__missing {
  color: $pd-ink;
  text-align: center;
}

.stretch-player__missing-icon {
  color: $pd-ink-2;
}
</style>
