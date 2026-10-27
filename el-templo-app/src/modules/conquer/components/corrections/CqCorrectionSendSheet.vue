<template>
  <q-dialog
    :model-value="modelValue"
    position="bottom"
    :persistent="busy"
    @update:model-value="onDialogToggle"
  >
    <!-- Fase 202 D-26: el diálogo se monta fuera de .cq-root (teleport): la hoja lleva su propia raíz -->
    <div
      class="cq-root cq-send"
      role="dialog"
      aria-label="Mandar un video a tu coach"
      data-test="conquer-correction-send"
    >
      <div class="cq-send__head">
        <h2 class="cq-send__title">Mandar un video</h2>
        <button
          v-if="phase !== 'saving'"
          type="button"
          class="cq-textlink cq-send__close"
          @click="requestClose"
        >
          Cerrar
        </button>
      </div>

      <div class="cq-send__body">
        <p v-if="confirmingClose" class="cq-notice cq-send__confirm" role="alert">
          <span>Se está subiendo tu video. ¿Querés cancelar el envío?</span>
          <span class="cq-send__confirm-actions">
            <CqButton label="Sí, cancelar" variant="secondary" small @click="abortSend" />
            <CqButton label="Seguir subiendo" small @click="confirmingClose = false" />
          </span>
        </p>

        <section class="cq-send__sec">
          <label class="cq-send__label" for="cq-send-target">¿Qué escalón?</label>
          <select
            id="cq-send-target"
            v-model="targetKey"
            class="cq-select"
            :disabled="busy"
            data-test="conquer-send-target"
          >
            <option value="" disabled>Elegí un escalón</option>
            <optgroup v-for="group in groups" :key="group.group" :label="group.group">
              <option v-for="option in group.options" :key="option.key" :value="option.key">
                {{ option.label }}
              </option>
            </optgroup>
          </select>
        </section>

        <section class="cq-send__sec">
          <p class="cq-send__label">Tu video</p>
          <p class="cq-sub">MP4 o MOV, hasta {{ limits.maxSeconds }} segundos.</p>
          <div class="cq-send__pick">
            <CqButton
              class="cq-send__pick-btn"
              label="Grabar video"
              variant="secondary"
              :disabled="busy || reading"
              data-test="conquer-send-record"
              @click="openRecord"
            />
            <CqButton
              class="cq-send__pick-btn"
              label="Elegir de la galería"
              variant="secondary"
              :disabled="busy || reading"
              data-test="conquer-send-gallery"
              @click="openGallery"
            />
          </div>
          <input
            ref="recordInput"
            class="cq-send__file"
            type="file"
            accept="video/*"
            capture="environment"
            tabindex="-1"
            aria-hidden="true"
            @change="onPick"
          />
          <input
            ref="galleryInput"
            class="cq-send__file"
            type="file"
            accept="video/*"
            tabindex="-1"
            aria-hidden="true"
            @change="onPick"
          />

          <p v-if="reading" class="cq-sub" role="status">Revisando el video…</p>
          <p v-else-if="file" class="cq-send__chosen" data-test="conquer-send-chosen">
            <span class="cq-send__name">{{ file.name }}</span>
            <span class="cq-sub">{{ formatSeconds(seconds) }}</span>
          </p>
          <p v-if="fileError" class="cq-send__error" role="alert" data-test="conquer-send-error">
            {{ fileError }}
          </p>
        </section>

        <section class="cq-send__sec">
          <label class="cq-send__label" for="cq-send-comment">Comentario (opcional)</label>
          <textarea
            id="cq-send-comment"
            v-model="comment"
            class="cq-field cq-send__comment"
            rows="3"
            :maxlength="limits.commentMax"
            :disabled="busy"
            placeholder="Contale a tu coach qué te cuesta"
            data-test="conquer-send-comment"
          />
          <p class="cq-sub cq-send__count">{{ comment.length }} / {{ limits.commentMax }}</p>
        </section>
      </div>

      <div class="cq-send__foot">
        <p v-if="statusText" class="cq-sub cq-send__status" role="status" aria-live="polite">
          {{ statusText }}
        </p>
        <CqButton
          label="Mandar a mi coach"
          :loading="busy"
          :disabled="!canSend"
          data-test="conquer-send-submit"
          @click="submit"
        />
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import '../../styles/conquer.scss'
import { readVideoDuration, useCorrectionUpload } from '../../composables/useCorrectionUpload'
import { targetGroups } from '../../utils/corrections'
import { checkVideo, formatSeconds, videoMimeOf } from '../../utils/videoFile'
import type { CorrectionLimits, CorrectionTarget, CorrectionView } from '../../types'
import CqButton from '../brand/CqButton.vue'

// Fase 202 D-26, D-27, DA-41, DA-42, DA-50: la hoja para mandar un video de corrección. El alumno
// elige el escalón (o el combo), graba o elige un video, escribe un comentario opcional y lo manda.
// El video se revisa ANTES de subirlo (tipo, 100 MB, 30 s): el API vuelve a validar todo. La hoja es
// `persistent` mientras sube y cerrarla pide confirmación. Los textos de error salen del composable
// (los del API ya vienen en español) y van a un Notify; el de la validación se ve bajo los botones.
const props = defineProps<{
  modelValue: boolean
  targets: CorrectionTarget[]
  limits: CorrectionLimits
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  sent: [item: CorrectionView]
}>()

const $q = useQuasar()
const upload = useCorrectionUpload()
const { phase } = upload

const recordInput = ref<HTMLInputElement | null>(null)
const galleryInput = ref<HTMLInputElement | null>(null)

const targetKey = ref('')
const comment = ref('')
const file = ref<File | null>(null)
/** Duración leída del archivo elegido (sin redondear). */
const duration = ref<number | null>(null)
/** Segundos enteros que se muestran (los mismos que se mandan). */
const seconds = ref(0)
const fileError = ref('')
const reading = ref(false)
const confirmingClose = ref(false)
/** Cada lectura toma el siguiente número; solo la última aplica su resultado. */
let pickSeq = 0

const groups = computed(() => targetGroups(props.targets))
const busy = computed(() => phase.value !== 'idle')
const canSend = computed(
  () =>
    !busy.value &&
    !reading.value &&
    file.value !== null &&
    props.targets.some((t) => t.key === targetKey.value),
)
const statusText = computed(() => {
  if (phase.value === 'uploading') return 'Subiendo video…'
  if (phase.value === 'saving') return 'Guardando…'
  return ''
})

function resetForm(): void {
  pickSeq++
  targetKey.value = ''
  comment.value = ''
  file.value = null
  duration.value = null
  seconds.value = 0
  fileError.value = ''
  reading.value = false
  confirmingClose.value = false
}

// Cada vez que se abre, arranca limpia
watch(
  () => props.modelValue,
  (open) => {
    if (open) resetForm()
  },
)

function openRecord(): void {
  recordInput.value?.click()
}

function openGallery(): void {
  galleryInput.value?.click()
}

async function onPick(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const picked = input.files?.[0] ?? null
  // Se limpia para poder elegir el mismo archivo de nuevo
  input.value = ''
  if (!picked) return
  const seq = ++pickSeq
  reading.value = true
  fileError.value = ''
  file.value = null
  const read = await readVideoDuration(picked)
  if (seq !== pickSeq) return
  reading.value = false
  const check = checkVideo({ mime: videoMimeOf(picked), size: picked.size, durationSec: read })
  if (!check.ok) {
    fileError.value = check.message
    return
  }
  file.value = picked
  duration.value = read
  seconds.value = check.seconds
}

async function submit(): Promise<void> {
  const picked = file.value
  const target = props.targets.find((t) => t.key === targetKey.value)
  if (!canSend.value || !picked || !target) return
  const result = await upload.send({
    target,
    comment: comment.value,
    file: picked,
    durationSec: duration.value,
  })
  if (result.ok) {
    $q.notify({ type: 'positive', message: 'Listo, se lo mandamos a tu coach.' })
    emit('sent', result.correction)
    emit('update:modelValue', false)
    return
  }
  // Cancelar a propósito no es un error que haya que contar
  if (result.kind === 'cancelled') return
  if (result.kind === 'invalid') fileError.value = result.message
  $q.notify({ type: 'negative', message: result.message })
}

function requestClose(): void {
  if (phase.value === 'uploading' || phase.value === 'checking') {
    confirmingClose.value = true
    return
  }
  emit('update:modelValue', false)
}

function abortSend(): void {
  confirmingClose.value = false
  upload.cleanup()
  emit('update:modelValue', false)
}

function onDialogToggle(open: boolean): void {
  if (open) emit('update:modelValue', true)
  else requestClose()
}

/** La pantalla lo llama al desmontarse: corta la subida en vuelo. */
function cleanup(): void {
  upload.cleanup()
}

defineExpose({ cleanup })
</script>

<style scoped lang="scss">
.cq-send {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 460px;
  max-height: 90vh;
  overflow: hidden;
  border-radius: 20px 20px 0 0;
  background: var(--cq-surface-2);

  &__head {
    flex: none;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px 8px;
  }

  // Quasar da estilos globales a h1-h6: se fijan todos los que importan
  &__title {
    margin: 0;
    min-width: 0;
    padding-top: 10px;
    font-family: var(--cq-font-head);
    font-size: 17px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: normal;
    color: var(--cq-night);
  }

  &__close {
    flex: none;
    min-width: 44px;
    justify-content: center;
  }

  &__body {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px 16px 8px;
  }

  &__sec {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  &__label {
    margin: 0;
    font-family: var(--cq-font-head);
    font-size: 13px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: normal;
    text-transform: uppercase;
    color: var(--cq-night);
  }

  &__pick {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__pick-btn {
    flex: 1 1 140px;
    min-width: 0;
  }

  // Ocultos: los abren los botones. `display: none` también los saca del orden de tabulación
  &__file {
    display: none;
  }

  &__chosen {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin: 0;
    min-width: 0;
    font-size: 14px;
    color: var(--cq-text);
  }

  &__name {
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: 600;
  }

  // Texto sólido, sin rojo
  &__error {
    margin: 0;
    font-size: 14px;
    line-height: 1.4;
    font-weight: 600;
    color: var(--cq-night);
  }

  &__comment {
    min-height: 88px;
    padding: 10px 12px;
    line-height: 1.4;
    resize: none;
  }

  &__count {
    text-align: right;
  }

  &__confirm {
    margin: 0;
    font-size: 14px;
  }

  &__confirm-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__foot {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px max(24px, env(safe-area-inset-bottom));
  }

  &__status {
    text-align: center;
  }
}
</style>
