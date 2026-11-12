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

    <!-- Pantalla final (D-07): el "+5" y los minutos salen de la respuesta del servidor (T-213-31) -->
    <StretchDone
      v-else-if="stage === 'celebration' && lastResult"
      :minutes-label="stretchDoneMinutesLabel(lastResult)"
      :aura-awarded="lastResult.auraAwarded"
      :local-date="localDate"
      @done="onDone"
    />

    <!-- En curso: video, minutero chico, lista, Anterior / Siguiente y Terminar (sin lados, sin
         cuenta regresiva y sin tildes: el alumno pasa de ejercicio a mano) -->
    <div v-else-if="stage === 'playing' || stage === 'saving'" class="stretch-player__run">
      <div class="stretch-player__story">
        <VideoPlaceholder
          :key="player.current.value?.exerciseId ?? 'none'"
          :video-url="player.current.value?.videoUrl ?? null"
          class="stretch-player__video"
        />
        <div class="stretch-player__story-top">
          <q-btn
            flat
            round
            dense
            icon="arrow_back"
            color="white"
            aria-label="Salir del estiramiento"
            :disable="stage === 'saving'"
            @click="requestExit"
          />
          <div class="stretch-player__titles">
            <div class="stretch-player__kicker">Estiramiento</div>
            <div class="stretch-player__title">Post-clase</div>
          </div>
        </div>
        <div v-if="player.current.value" class="stretch-player__story-foot">
          <div class="stretch-player__story-name">
            <b>{{ player.current.value.name }}</b>
            <span>Ejercicio {{ player.index.value + 1 }} de {{ player.exercises.value.length }}</span>
          </div>
          <span class="stretch-player__dose">{{ stretchDoseLabel(player.current.value.dose) }}</span>
        </div>
      </div>

      <div class="stretch-player__format">
        <div class="stretch-player__format-info">
          <b>Estiramiento</b>
          <span>{{ player.exercises.value.length }} ejercicios · a tu ritmo</span>
        </div>
        <div class="stretch-player__timer-box">
          <div class="stretch-player__timer" role="timer" aria-label="Tiempo transcurrido">
            {{ clockLabel }}
          </div>
          <div class="stretch-player__timer-label">Tiempo</div>
        </div>
      </div>

      <div class="stretch-player__list">
        <h4 class="stretch-player__list-title">Ejercicios · tocá para ir a uno</h4>
        <button
          v-for="(e, i) in player.exercises.value"
          :key="i"
          type="button"
          class="stretch-player__ex"
          :class="{ 'stretch-player__ex--on': i === player.index.value }"
          :aria-current="i === player.index.value ? 'true' : undefined"
          @click="player.goTo(i)"
        >
          <span class="stretch-player__ex-num">{{ i + 1 }}</span>
          <span class="stretch-player__ex-name">{{ e.name }}</span>
          <span class="stretch-player__ex-dose">{{ stretchDoseLabel(e.dose) }}</span>
        </button>
      </div>

      <div class="stretch-player__nav">
        <button
          type="button"
          class="stretch-player__nav-btn"
          :disabled="player.isFirst.value"
          @click="player.prev()"
        >
          &#8249; Anterior
        </button>
        <button
          type="button"
          class="stretch-player__nav-btn"
          :disabled="player.isLast.value"
          @click="player.next()"
        >
          Siguiente &#8250;
        </button>
      </div>

      <div class="stretch-player__cta">
        <button
          type="button"
          class="stretch-player__finish"
          :disabled="stage === 'saving'"
          @click="onFinish"
        >
          Terminar
        </button>
        <div
          class="stretch-player__hint"
          :class="{ 'stretch-player__hint--ok': auraReady }"
          aria-live="polite"
        >
          {{ auraReady ? 'Ya sumás +5 AURA al terminar' : 'Con 3 minutos sumás +5 AURA' }}
        </div>
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
import StretchDone from '../components/player/StretchDone.vue'
import VideoPlaceholder from '../components/player/VideoPlaceholder.vue'

// Composables, stores and helpers
import { useStretchPlayer } from '../composables/useStretchPlayer'
import { useWakeLock } from '../composables/useWakeLock'
import { useStretchCompletion } from '../composables/useStretchCompletion'
import { useStretchStore } from 'src/stores/useStretchStore'
import { createLogger } from 'src/utils/logger'
import { confirmDialog, type ConfirmDialogOptions } from 'src/utils/confirm-dialog'
import { formatElapsedTime } from '../utils/formatTime'
import {
  isStretchExpiredMessage,
  stretchAuraReady,
  stretchDoneMinutesLabel,
  stretchDoseLabel,
} from '../utils/stretchSession'
import type { StretchCompleteResponse, StretchEventFrom } from '../types/stretch'

const log = createLogger('StretchPlayer')

// Fase 213 D-07 / plan 15: player propio del estiramiento post-clase. Video arriba, minutero chico
// que solo avanza, lista de ejercicios, Anterior / Siguiente y "Terminar" siempre disponible. Nada
// avanza solo y no se marca nada. La rutina y la dosis las arma el servidor (T-213-27); la duración
// y el AURA los decide el servidor (T-213-31, T-213-43): el minutero es solo visual.
// D-12: sin oferta, ya hecha o vencida (push tocado al día siguiente) la página avisa y vuelve.

type Stage = 'loading' | 'missing' | 'playing' | 'saving' | 'celebration'

const route = useRoute()
const router = useRouter()
const $q = useQuasar()
const wakeLock = useWakeLock()
const completion = useStretchCompletion()
const stretchStore = useStretchStore()
const player = useStretchPlayer()

const MSG_YA_HECHO = 'Ya estiraste hoy.'
const MSG_NO_DISPONIBLE =
  'Este estiramiento ya no está disponible. Aparece después de tu próxima clase.'
const MSG_NO_CARGO = 'No pudimos cargar el estiramiento. Probá de nuevo en un rato.'

const stage = ref<Stage>('loading')
const offerId = ref<number | null>(null)
const localDate = ref('')
const missingText = ref(MSG_NO_DISPONIBLE)
/** Respuesta del servidor al cierre: manda la pantalla final */
const lastResult = ref<StretchCompleteResponse | null>(null)
/** El alumno ya confirmó que sale: el guard de la ruta lo deja pasar */
let exitConfirmed = false
let disposed = false

const clockLabel = computed(() => formatElapsedTime(player.elapsedSeconds.value))

/**
 * "Ya sumás +5 AURA": cuenta desde que el servidor confirmó el `started`, no desde el minutero.
 * Depende de `elapsedSeconds` solo para recalcularse cada segundo.
 */
const auraReady = computed(() => {
  void player.elapsedSeconds.value
  return stretchAuraReady(completion.startedConfirmedAt.value, Date.now())
})

function goToMiTemplo(): void {
  void router.push('/mi-templo')
}

const exitDialogOpts: ConfirmDialogOptions = {
  title: '¿Salir del estiramiento?',
  message: 'Si salís ahora, no se guarda.',
  okLabel: 'Salir',
  destructive: true,
}

const earlyFinishDialogOpts: ConfirmDialogOptions = {
  title: 'Todavía no llegaste a los 3 minutos',
  message: 'Si terminás ahora no sumás AURA.',
  okLabel: 'Terminar igual',
  cancelLabel: 'Seguir estirando',
}

/** Solo en curso: ya guardado, vencido o cargando no hay nada que perder al salir */
const needsExitConfirm = computed(() => stage.value === 'playing' && !exitConfirmed)

function requestExit(): void {
  if (stage.value === 'saving') return
  if (!needsExitConfirm.value) {
    goToMiTemplo()
    return
  }
  confirmDialog($q, exitDialogOpts).onOk(() => {
    exitConfirmed = true
    goToMiTemplo()
  })
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
    .onOk(() => {
      exitConfirmed = true
      next()
    })
    .onCancel(() => next(false))
})

/** Cierre: el servidor mide la duración (desde `started_at`) y decide el AURA */
async function closeStretch(): Promise<void> {
  const id = offerId.value
  if (id === null || stage.value !== 'playing') return

  stage.value = 'saving'
  const res = await completion.complete({ offerId: id })
  if (disposed) return

  if (res) {
    player.stop()
    lastResult.value = res
    stage.value = 'celebration'
    void wakeLock.releaseWakeLock()
    return
  }

  if (isStretchExpiredMessage(completion.error.value)) {
    // D-12: la oferta venció, ya no se puede guardar
    player.stop()
    missingText.value = MSG_NO_DISPONIBLE
    stage.value = 'missing'
    void wakeLock.releaseWakeLock()
    return
  }

  stage.value = 'playing'
  $q.notify({
    type: 'negative',
    message: 'No pudimos guardar el estiramiento. Probá de nuevo.',
    icon: 'error',
    position: 'top',
    timeout: 3000,
  })
}

/** "Terminar": directo con el AURA asegurado; antes de los 3 minutos pide confirmar (T-213-44) */
function onFinish(): void {
  if (stage.value !== 'playing') return
  if (stretchAuraReady(completion.startedConfirmedAt.value, Date.now())) {
    void closeStretch()
    return
  }
  confirmDialog($q, earlyFinishDialogOpts).onOk(() => {
    void closeStretch()
  })
}

/** "Volver a Mi Templo": ya está guardado, la card de Mi Templo ya lo sabe (§5.3.5) */
function onDone(): void {
  goToMiTemplo()
}

onMounted(async () => {
  void wakeLock.initialize()
  const from: StretchEventFrom = route.query.from === 'push' ? 'push' : 'card'
  // T-213-30: solo mide la apertura del push; no da AURA ni cambia la rutina
  if (from === 'push') void completion.sendEvent('push_opened')

  await stretchStore.load()
  if (disposed) return

  const today = stretchStore.today
  if (!today) {
    missingText.value = stretchStore.loadFailed ? MSG_NO_CARGO : MSG_NO_DISPONIBLE
    stage.value = 'missing'
    return
  }
  if (today.status === 'done') {
    missingText.value = MSG_YA_HECHO
    stage.value = 'missing'
    return
  }
  if (today.status !== 'available' || today.offerId === null || today.exercises.length === 0) {
    missingText.value = MSG_NO_DISPONIBLE
    stage.value = 'missing'
    return
  }

  offerId.value = today.offerId
  localDate.value = today.localDate
  // Cada entrada empieza de cero: si abandonó antes no hay nada que retomar
  player.setExercises(today.exercises)
  stage.value = 'playing'
  player.start()
  void wakeLock.requestWakeLock()
  // ME-03: reintenta en segundo plano; sin `started_at` no hay duración ni AURA
  completion.sendStarted(from)
  log.info('Estiramiento listo', { from, exercises: today.exercises.length })
})

onUnmounted(() => {
  disposed = true
  player.cleanup()
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

// Todo en una columna: video, fila del minutero, lista (la única que scrollea), botones
.stretch-player__run {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.stretch-player__story {
  position: relative;
  flex: none;
  height: clamp(180px, 28vh, 260px);
  background: linear-gradient(135deg, #1e1b18 0%, #2e2a26 50%, #3d3732 100%);
  color: #fff;
}

.stretch-player__video {
  position: absolute;
  inset: 0;
}

.stretch-player__story-top {
  position: absolute;
  top: 10px;
  left: 6px;
  right: 12px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.stretch-player__titles {
  text-align: right;
}

.stretch-player__kicker {
  font-family: 'Montserrat', sans-serif;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: $pd-cream-2;
}

.stretch-player__title {
  font-family: 'Montserrat', sans-serif;
  font-size: 15px;
  font-weight: 700;
}

// Pie sobre un fade a negro, como el de las historias del player de entrenamiento
.stretch-player__story-foot {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  padding: 28px 14px 12px;
  background: linear-gradient(to top, rgba(20, 16, 12, 0.85), rgba(20, 16, 12, 0));
}

.stretch-player__story-name {
  min-width: 0;

  b {
    display: block;
    font-family: 'Montserrat', sans-serif;
    font-size: 17px;
    font-weight: 700;
    line-height: 1.2;
  }

  span {
    font-size: 12px;
    color: $pd-cream-3;
  }
}

.stretch-player__dose {
  flex: none;
  white-space: nowrap;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid rgba(240, 230, 214, 0.5);
  font-family: 'Montserrat', sans-serif;
  font-size: 13px;
  font-weight: 700;
  color: $pd-cream;
}

.stretch-player__format {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: #fff;
  border-bottom: 1px solid $pd-light-line;
}

.stretch-player__format-info {
  b {
    display: block;
    font-family: 'Cormorant Garamond', serif;
    font-size: 16px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: $pd-ink;
  }

  span {
    font-size: 12px;
    color: $pd-ink-2;
  }
}

.stretch-player__timer-box {
  text-align: right;
}

.stretch-player__timer {
  font-family: 'Cormorant Garamond', serif;
  font-size: 30px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: $pd-ink;
}

.stretch-player__timer-label {
  margin-top: 3px;
  font-family: 'Montserrat', sans-serif;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: $pd-ink-2;
}

.stretch-player__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 14px;
}

.stretch-player__list-title {
  margin: 4px 0;
  font-family: 'Montserrat', sans-serif;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: $pd-ink-2;
}

.stretch-player__ex {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: none;
  font-size: 13px;
  color: $pd-ink;
  text-align: left;
  cursor: pointer;
}

.stretch-player__ex--on {
  background: #fff;
  border-color: $pd-light-line;
  font-weight: 700;
}

.stretch-player__ex-num {
  flex: none;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid $pd-light-edge;
  font-size: 11px;
  font-weight: 700;
  color: $pd-ink-2;
}

.stretch-player__ex--on .stretch-player__ex-num {
  background: $pd-ink;
  border-color: $pd-ink;
  color: #fff;
}

.stretch-player__ex-name {
  min-width: 0;
}

.stretch-player__ex-dose {
  margin-left: auto;
  white-space: nowrap;
  font-size: 11.5px;
  color: $pd-ink-2;
}

.stretch-player__nav {
  flex: none;
  display: flex;
  gap: 8px;
  padding: 6px 16px 0;
}

.stretch-player__nav-btn {
  flex: 1;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid $pd-light-edge;
  background: #fff;
  font-family: 'Montserrat', sans-serif;
  font-size: 13px;
  font-weight: 700;
  color: $pd-ink;
  cursor: pointer;

  &:disabled {
    color: $pd-ink-2;
    background: rgba(255, 255, 255, 0.4);
    border-color: $pd-light-line;
    opacity: 0.6;
    cursor: default;
  }
}

.stretch-player__cta {
  flex: none;
  padding: 8px 16px calc(12px + env(safe-area-inset-bottom, 0px));
}

.stretch-player__finish {
  width: 100%;
  padding: 13px;
  border: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, $pd-btn-a, $pd-btn-b);
  font-family: 'Montserrat', sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}

.stretch-player__hint {
  margin-top: 6px;
  text-align: center;
  font-size: 11.5px;
  color: $pd-ink-2;
}

.stretch-player__hint--ok {
  color: $pd-terra-ink;
  font-weight: 700;
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
