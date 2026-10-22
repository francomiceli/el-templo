<template>
  <CqSky class="cq-bc">
    <CqPageHeader
      title="CONTROL FÍSICO"
      :subtitle="subtitle"
      :back-to="backTo"
      back-label="Volver a Conquer"
    />

    <div v-if="loading || loadError" class="cq-bc__center" role="status" aria-live="polite">
      <template v-if="loadError">
        <p class="cq-sub" role="alert">{{ loadError }}</p>
        <button type="button" class="cq-small cq-small--fill" @click="reload">Reintentar</button>
      </template>
      <template v-else>
        <span class="cq-bc__spin" aria-hidden="true" />
        <span class="cq-sub">Cargando tu control</span>
      </template>
    </div>

    <template v-else>
      <p class="cq-sub cq-bc__intro">
        Tres fotos y cuatro medidas. Te lleva menos de 3 minutos y podés hacerlo en otro momento.
      </p>

      <CqPoseCapture
        v-for="pose in CONQUER_POSES"
        :key="pose"
        :pose="pose"
        :status="poses[pose].status"
        :message="poses[pose].message"
        :can-retry="poses[pose].canRetry"
        :disabled="saving || skipping"
        @capture="onCapture(pose)"
        @retry="onRetry(pose)"
      />

      <div class="cq-card">
        <div class="cq-caps">Medidas</div>
        <div v-for="field in MEASURE_FIELDS" :key="field.key" class="cq-bc__field">
          <label :for="`cq-bc-${field.key}`" class="cq-bc__label">{{ field.label }}</label>
          <div class="cq-bc__box" :class="{ 'cq-bc__box--err': errors[field.key] }">
            <input
              :id="`cq-bc-${field.key}`"
              v-model="drafts[field.key]"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              :disabled="saving || skipping"
              :aria-invalid="errors[field.key] ? 'true' : undefined"
              :aria-describedby="errors[field.key] ? `cq-bc-${field.key}-err` : undefined"
              @input="clearError(field.key)"
            />
            <span class="cq-bc__unit">{{ field.unit }}</span>
          </div>
          <p
            v-if="errors[field.key]"
            :id="`cq-bc-${field.key}-err`"
            class="cq-bc__error"
            role="alert"
          >
            {{ errors[field.key] }}
          </p>
        </div>
      </div>

      <div class="cq-grow" />

      <CqCloudButton
        label="Guardar control"
        :loading="saving"
        :disabled="uploading || skipping"
        @click="onSave"
      >
        <div v-if="uploading" class="cq-sub" role="status">Esperá a que termine la foto</div>
        <button
          v-if="showSkip"
          type="button"
          class="cq-bc__later"
          :disabled="saving || skipping || uploading"
          :aria-busy="skipping ? 'true' : undefined"
          @click="onSkip"
        >
          Lo hago después
        </button>
      </CqCloudButton>
    </template>
  </CqSky>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { createLogger } from 'src/utils/logger'
import { useConquerStore } from '../stores/conquerStore'
import { ConquerApiError, isConquerCanceled, useConquerApi } from '../composables/useConquerApi'
import { useBodyCheckCamera } from '../composables/useBodyCheckCamera'
import type { CapturedPhoto } from '../composables/useBodyCheckCamera'
import {
  CONQUER_POSES,
  MEASURE_FIELDS,
  buildMeasuresBody,
  draftsFromCheck,
  emptyDrafts,
  findTodayCheck,
  isRetryable,
  localIsoDate,
} from '../utils/bodyCheck'
import type { MeasureKey } from '../utils/bodyCheck'
import type { BodyCheckView, Pose } from '../types'
import CqSky from '../components/brand/CqSky.vue'
import CqPageHeader from '../components/brand/CqPageHeader.vue'
import CqCloudButton from '../components/brand/CqCloudButton.vue'
import CqPoseCapture from '../components/evolution/CqPoseCapture.vue'
import type { PoseStatus } from '../components/evolution/CqPoseCapture.vue'

// Fase 201 §6, D-15, S12-8: control físico (día 0 y periódico). 3 fotos con la cámara y 4 perímetros
// + peso opcional. La fila del control se crea PERO RECIÉN al primer "Sacar foto" (con `{}`, para
// tener el `checkId`) o al "Guardar control": al montar solo se lee `GET /body-checks` para
// continuar el de hoy. Las medidas se validan con `parseMeasure`/`parseWeight` (vía
// `buildMeasuresBody`). Las fotos viajan directo al bucket privado (T-201-64..66): ni la foto ni su
// URL se guardan ni se loguean. Con el día 0 pendiente hay un "Lo hago después" chico. Sin bucket
// privado el API responde 503 (CONQUER_FOTOS_NO_DISPONIBLES): la foto muestra "Las fotos no están
// disponibles por ahora..." (`uploadFailureText('unavailable')`) y las medidas se guardan igual.
const log = createLogger('ConquerBodyCheckPage')

const TAB_ROUTE = { path: '/training', query: { tab: 'conquer' } }

interface PoseState {
  status: PoseStatus
  message: string
  canRetry: boolean
}

const $q = useQuasar()
const route = useRoute()
const router = useRouter()
const store = useConquerStore()
const api = useConquerApi()
const camera = useBodyCheckCamera()

const loading = ref(true)
const loadError = ref<string | null>(null)
const saving = ref(false)
const skipping = ref(false)
const check = ref<BodyCheckView | null>(null)
const drafts = reactive(emptyDrafts())
const errors = ref<Partial<Record<MeasureKey, string>>>({})
const poses = reactive<Record<Pose, PoseState>>({
  frente: { status: 'idle', message: '', canRetry: false },
  perfil: { status: 'idle', message: '', canRetry: false },
  espalda: { status: 'idle', message: '', canRetry: false },
})
// Las fotos que no salieron se guardan acá (memoria, no reactiva) para reintentar sin volver a sacarlas
const pending: Partial<Record<Pose, CapturedPhoto>> = {}

const bodyCheck = computed(() => store.state?.member?.bodyCheck ?? null)
const isDay0 = computed(() => route.query.dia0 === '1' || bodyCheck.value?.hasDay0 === false)
const showSkip = computed(() => isDay0.value && bodyCheck.value?.hasDay0 !== true)
const subtitle = computed(() =>
  isDay0.value ? 'Día 0' : `Control de la semana ${store.state?.member?.blockWeek ?? 1}`,
)
// En el día 0 el atrás no vuelve a la tab (volvería a pedir el control): va a Entrenar
const backTo = computed(() => (isDay0.value ? { path: '/training' } : TAB_ROUTE))
const uploading = computed(() => CONQUER_POSES.some((pose) => poses[pose].status === 'uploading'))

function setPose(pose: Pose, status: PoseStatus, message = '', canRetry = false): void {
  poses[pose] = { status, message, canRetry }
}

/** Marca como subidas las poses que el API ya tiene en el control de hoy. */
function syncPoses(view: BodyCheckView): void {
  for (const pose of CONQUER_POSES) {
    if (view.photos[pose] && poses[pose].status === 'idle') setPose(pose, 'done')
  }
}

function notifyError(err: unknown, fallback: string): void {
  if (isConquerCanceled(err)) return
  if (err instanceof ConquerApiError) {
    // Un 4xx con respuesta no es un fallo del sistema: no va a Sentry.
    if (!err.isExpected) log.error('Conquer body check failed', { status: err.status })
    $q.notify({ type: 'negative', message: err.message })
    return
  }
  log.error('Conquer body check failed', { error: err instanceof Error ? err.name : 'unknown' })
  $q.notify({ type: 'negative', message: fallback })
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    if (!store.state) await store.loadState()
    if (store.view === 'bloqueado' || store.view === 'pedido') {
      await router.replace(TAB_ROUTE)
      return
    }
    const list = await api.listBodyChecks()
    const today = findTodayCheck(list.checks, localIsoDate(new Date()))
    if (today) {
      check.value = today
      Object.assign(drafts, draftsFromCheck(today))
      syncPoses(today)
    }
  } catch (err: unknown) {
    if (isConquerCanceled(err)) return
    loadError.value =
      err instanceof ConquerApiError ? err.message : 'No pudimos cargar tu control. Probá de nuevo.'
  } finally {
    loading.value = false
  }
}

function reload(): void {
  void load()
}

/** El control de hoy: el que ya hay o, si no, lo crea recién ahora (no al montar). */
async function ensureCheck(): Promise<BodyCheckView | null> {
  if (check.value) return check.value
  try {
    const view = await api.upsertBodyCheck({})
    check.value = view
    syncPoses(view)
    return view
  } catch (err: unknown) {
    notifyError(err, 'No pudimos preparar tu control. Probá de nuevo.')
    return null
  }
}

async function sendPhoto(pose: Pose): Promise<void> {
  const photo = pending[pose]
  if (!photo) return
  setPose(pose, 'uploading')
  const current = await ensureCheck()
  if (!current) {
    setPose(pose, 'error', 'No pudimos preparar tu control. Probá de nuevo.', true)
    return
  }
  const result = await camera.upload(current.id, pose, photo)
  if (result.ok) {
    delete pending[pose]
    setPose(pose, 'done')
    check.value = { ...current, photos: { ...current.photos, [pose]: true } }
    return
  }
  if (result.kind === 'cancelled') {
    setPose(pose, 'idle')
    return
  }
  const retry = isRetryable(result.kind)
  if (!retry) delete pending[pose]
  setPose(pose, 'error', result.message, retry)
}

async function onCapture(pose: Pose): Promise<void> {
  if (uploading.value) return
  const outcome = await camera.capture(pose)
  if (!outcome.ok) {
    if (outcome.reason !== 'cancelled') setPose(pose, 'error', outcome.message, false)
    return
  }
  pending[pose] = outcome.photo
  await sendPhoto(pose)
}

function onRetry(pose: Pose): void {
  if (uploading.value) return
  void sendPhoto(pose)
}

function clearError(key: MeasureKey): void {
  if (errors.value[key]) errors.value = { ...errors.value, [key]: undefined }
}

const hasPhoto = (): boolean => CONQUER_POSES.some((pose) => poses[pose].status === 'done')

/** Refresca el estado de Conquer; si falla, baja la bandera a mano para no volver al día 0 (D-15). */
async function refreshState(): Promise<void> {
  await store.loadState()
  const flags = store.state?.member?.bodyCheck
  if (flags?.mustPromptDay0) store.applyBodyCheck({ ...flags, mustPromptDay0: false })
}

async function onSave(): Promise<void> {
  if (saving.value || uploading.value) return
  const built = buildMeasuresBody(drafts)
  if (!built.ok) {
    errors.value = built.errors
    return
  }
  errors.value = {}
  if (built.filled === 0 && !hasPhoto()) {
    $q.notify({ type: 'warning', message: 'Cargá al menos una foto o una medida para guardar.' })
    return
  }
  saving.value = true
  try {
    // Solo fotos: el control ya existe (la primera foto lo creó) y no hay nada más que escribir
    if (built.filled > 0 || !check.value) check.value = await api.upsertBodyCheck(built.body)
    await refreshState()
    $q.notify({ type: 'positive', message: 'Control guardado' })
    await router.replace(TAB_ROUTE)
  } catch (err: unknown) {
    notifyError(err, 'No pudimos guardar tu control. Probá de nuevo.')
  } finally {
    saving.value = false
  }
}

async function onSkip(): Promise<void> {
  if (skipping.value) return
  skipping.value = true
  try {
    store.applyBodyCheck(await api.skipDay0())
    await router.replace(TAB_ROUTE)
  } catch (err: unknown) {
    notifyError(err, 'No pudimos guardar tu respuesta. Probá de nuevo.')
    // El día 0 ya estaba hecho (409): el estado viejo pedía algo que ya no hace falta
    if (err instanceof ConquerApiError && err.code === 'CONQUER_DIA0_HECHO') {
      await refreshState()
      await router.replace(TAB_ROUTE)
    }
  } finally {
    skipping.value = false
  }
}

onMounted(() => {
  void load()
})

onBeforeUnmount(() => {
  camera.cleanup()
  api.cleanup()
})
</script>

<style scoped lang="scss">
.cq-bc.cq-sky {
  // Alto de la pantalla menos el header y la barra de abajo (igual que Hoy)
  min-height: calc(var(--app-vh) - 50px - var(--mobile-tabs-height));
}

.cq-bc__center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 48px 0;
  text-align: center;
}

.cq-bc__spin {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--cq-gold);
  border-right-color: transparent;
}

.cq-bc__intro {
  margin: 0;
}

.cq-bc__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cq-bc__label {
  font-size: 14px;
  color: var(--cq-cream);
}

.cq-bc__box {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--cq-hair2);
  background: #1a2656;

  &:focus-within {
    border-color: var(--cq-gold-hi);
  }

  &--err {
    border-color: var(--cq-gold-hi);
    box-shadow: 0 0 0 1px var(--cq-gold-hi);
  }

  input {
    flex: 1;
    min-width: 0;
    height: 46px;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--cq-cream);
    font: inherit;
    font-size: 16px;
    font-variant-numeric: tabular-nums lining-nums;
  }
}

.cq-bc__unit {
  font-size: 13px;
  color: var(--cq-muted);
}

.cq-bc__error {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--cq-gold-hi);
}

// "Lo hago después": chico y en el pie de nubes (texto sólido, hitbox de 44 px)
.cq-bc__later {
  align-self: center;
  min-height: 44px;
  padding: 0 14px;
  border: 0;
  background: transparent;
  color: var(--cq-ink2);
  font-size: 13px;
  text-decoration: underline;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .cq-bc__spin {
    animation: cq-bc-spin 0.8s linear infinite;
  }
}

@keyframes cq-bc-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
