<template>
  <CqScreen class="cq-corr" data-test="conquer-corrections-page">
    <CqPageHeader
      title="Correcciones"
      :back-to="BACK_TO"
      back-label="Volver al inicio de Conquer"
    />

    <div
      v-if="starting || loading || shownError"
      class="cq-corr__center"
      role="status"
      aria-live="polite"
    >
      <template v-if="shownError">
        <p class="cq-notice" role="alert">{{ shownError }}</p>
        <CqButton label="Reintentar" variant="secondary" small @click="reload" />
      </template>
      <template v-else>
        <span class="cq-corr__spin" aria-hidden="true" />
        <span class="cq-sub">Cargando tus correcciones</span>
      </template>
    </div>

    <template v-else-if="data">
      <CqPortico>
        <p class="cq-kicker">Correcciones</p>
        <p class="cq-corr__lead">
          Mandale a tu coach un video de hasta {{ data.limits.maxSeconds }} segundos de un escalón y
          te devuelve la corrección.
        </p>
        <p class="cq-sub" data-test="conquer-corrections-slots">
          Te quedan {{ slots }} de {{ data.limits.pendingMax }}
        </p>
        <CqButton
          v-if="data.targets.length > 0"
          label="Mandar un video"
          variant="on-night"
          :disabled="slots === 0"
          data-test="conquer-corrections-send"
          @click="sendOpen = true"
        />
        <p v-if="data.targets.length === 0" class="cq-sub" data-test="conquer-corrections-no-plan">
          Cuando tengas tu plan vas a poder mandar videos.
        </p>
        <p v-else-if="slots === 0" class="cq-sub" data-test="conquer-corrections-full">
          Ya tenés {{ data.limits.pendingMax }} videos esperando respuesta.
        </p>
      </CqPortico>

      <p v-if="data.items.length === 0" class="cq-sub" data-test="conquer-corrections-empty">
        Todavía no mandaste ningún video.
      </p>

      <template v-else>
        <h2 class="cq-block-title">Esperando respuesta</h2>
        <div v-if="groups.pending.length > 0" class="cq-corr__list">
          <CqCorrectionCard
            v-for="item in groups.pending"
            :key="item.id"
            :item="item"
            @open="openItem(item.id)"
          />
        </div>
        <p v-else class="cq-sub">No tenés videos esperando respuesta.</p>

        <h2 class="cq-block-title">Respondidas</h2>
        <div v-if="groups.answered.length > 0" class="cq-corr__list">
          <CqCorrectionCard
            v-for="item in groups.answered"
            :key="item.id"
            :item="item"
            @open="openItem(item.id)"
          />
        </div>
        <p v-else class="cq-sub">Todavía no tenés respuestas.</p>
      </template>
    </template>

    <CqCorrectionSheet v-model="sheetOpen" :item="selected" :video-url="corr.videoUrl" />
    <CqCorrectionSendSheet
      v-if="data"
      ref="sendSheet"
      v-model="sendOpen"
      :targets="data.targets"
      :limits="data.limits"
      @sent="onSent"
    />
  </CqScreen>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useConquerStore } from '../stores/conquerStore'
import { useConquerCorrections } from '../composables/useConquerCorrections'
import { groupCorrections, remainingSlots } from '../utils/corrections'
import CqScreen from '../components/brand/CqScreen.vue'
import CqPageHeader from '../components/brand/CqPageHeader.vue'
import CqPortico from '../components/brand/CqPortico.vue'
import CqButton from '../components/brand/CqButton.vue'
import CqCorrectionCard from '../components/corrections/CqCorrectionCard.vue'
import CqCorrectionSheet from '../components/corrections/CqCorrectionSheet.vue'
import CqCorrectionSendSheet from '../components/corrections/CqCorrectionSendSheet.vue'
import type { CorrectionView } from '../types'

// Fase 202 D-26, D-29, DA-46, DA-47: lo que el alumno le mandó a su coach, en "Esperando respuesta" y
// "Respondidas" (con "Nueva" si todavía no vio la respuesta). Se entra desde Inicio › Correcciones.
// Abierta en frío carga el estado y, si el alumno no tiene Conquer activo, vuelve a la tab (201-20).
// Al pintar la lista marca las respuestas como vistas y baja el contador de Inicio sin releer el
// estado; la lista ya cargada conserva sus "Nueva" hasta salir. Los videos los pide el detalle.
const BACK_TO = { path: '/training', query: { tab: 'conquer' } }
const NO_STATE = 'No pudimos cargar Conquer. Probá de nuevo.'

const router = useRouter()
const store = useConquerStore()
const corr = useConquerCorrections()
const { data, loading } = corr

// Cubre el tramo previo a la carga (estado en frío) para que no haya un instante en blanco
const starting = ref(true)
const startError = ref<string | null>(null)
const shownError = computed(() => startError.value ?? corr.error.value)

const sheetOpen = ref(false)
const sendOpen = ref(false)
const sendSheet = ref<InstanceType<typeof CqCorrectionSendSheet> | null>(null)
const selectedId = ref<number | null>(null)

const groups = computed(() => groupCorrections(data.value?.items ?? []))
const slots = computed(() => (data.value ? remainingSlots(data.value.limits) : 0))
// El id queda elegido al cerrar el detalle para que no se vacíe durante la transición
const selected = computed(() => data.value?.items.find((c) => c.id === selectedId.value) ?? null)

function openItem(id: number): void {
  selectedId.value = id
  sheetOpen.value = true
}

// D-26: la corrección nueva entra a la lista y los dos contadores (esta pantalla e Inicio) coinciden
// sin releer. `applyCreated` no toca el store y `applyCorrectionCounts` no toca la lista: van los dos.
function onSent(item: CorrectionView): void {
  corr.applyCreated(item)
  const current = data.value
  if (!current) return
  store.applyCorrectionCounts({
    pending: current.limits.pending,
    unseenReplies: store.state?.member?.corrections?.unseenReplies ?? 0,
  })
}

// DA-46: después de pintar la lista, las respuestas sin ver pasan a vistas y el contador baja
async function markSeenAfterPaint(): Promise<void> {
  await nextTick()
  const result = await corr.markSeen()
  const current = data.value
  if (!result || !current) return
  store.applyCorrectionCounts({
    pending: current.limits.pending,
    unseenReplies: result.unseenReplies,
  })
}

async function start(): Promise<void> {
  starting.value = true
  startError.value = null
  try {
    if (!store.state) await store.loadState()
    if (!store.state) {
      startError.value = store.error ?? NO_STATE
      return
    }
    if (store.view === 'bloqueado' || store.view === 'pedido') {
      await router.replace(BACK_TO)
      return
    }
    await corr.load()
  } finally {
    starting.value = false
  }
  await markSeenAfterPaint()
}

function reload(): void {
  void start()
}

onMounted(() => {
  void start()
})

onBeforeUnmount(() => {
  sendSheet.value?.cleanup()
  corr.cleanup()
})
</script>

<style scoped lang="scss">
.cq-corr {
  // Alto de la pantalla menos el header y la barra de abajo (igual que Hoy)
  min-height: calc(var(--app-vh) - 50px - var(--mobile-tabs-height));
}

.cq-corr__center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 48px 0;
  text-align: center;
}

.cq-corr__spin {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--cq-edge-gold);
  border-right-color: transparent;
}

.cq-corr__lead {
  margin: 0;
  font-size: 15px;
  line-height: 1.4;
}

.cq-corr__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

@media (prefers-reduced-motion: no-preference) {
  .cq-corr__spin {
    animation: cq-corr-spin 0.8s linear infinite;
  }
}

@keyframes cq-corr-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
