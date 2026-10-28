<template>
  <q-dialog
    :model-value="modelValue"
    position="bottom"
    @update:model-value="(value: boolean) => emit('update:modelValue', value)"
  >
    <!-- Fase 202 D-26: el diálogo se monta fuera de .cq-root (teleport): la hoja lleva su propia raíz -->
    <div
      v-if="item"
      class="cq-root cq-csheet"
      role="dialog"
      :aria-label="item.targetLabel"
      data-test="conquer-correction-sheet"
    >
      <div class="cq-csheet__head">
        <h2 class="cq-csheet__title">{{ item.targetLabel }}</h2>
        <button type="button" class="cq-textlink cq-csheet__close" @click="close">Cerrar</button>
      </div>

      <div class="cq-csheet__body">
        <section class="cq-csheet__sec">
          <h3 class="cq-csheet__sub">Tu video</h3>
          <p class="cq-sub">{{ sentText }}</p>
          <!-- D-28: el coach pudo borrar el video del alumno después de corregirlo -->
          <p v-if="item.videoDeleted" class="cq-csheet__text">
            Tu coach borró el video después de corregirlo.
          </p>
          <button v-else type="button" class="cq-textlink" @click="play('alumno')">
            Ver video
          </button>
        </section>

        <section v-if="item.comment" class="cq-csheet__sec">
          <h3 class="cq-csheet__sub">Tu comentario</h3>
          <p class="cq-csheet__text">{{ item.comment }}</p>
        </section>

        <section v-if="item.reply" class="cq-csheet__sec cq-csheet__reply">
          <h3 class="cq-csheet__sub">Respuesta de tu coach</h3>
          <p v-if="replyDate" class="cq-sub">{{ replyDate }}</p>
          <p v-if="item.reply.text" class="cq-csheet__text">{{ item.reply.text }}</p>
          <button
            v-if="item.reply.hasVideo"
            type="button"
            class="cq-textlink"
            @click="play('coach')"
          >
            Ver video del coach
          </button>
        </section>
      </div>
    </div>
  </q-dialog>

  <!-- Los videos se piden recién al tocar y la URL firmada vive solo en este estado local (T-201-156) -->
  <CqVideoSheet
    :model-value="videoOpen"
    :title="videoTitle"
    :url="videoSource"
    :loading="videoLoading"
    :unavailable="videoUnavailable"
    @update:model-value="onVideoToggle"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import '../../styles/conquer.scss'
import { ConquerApiError } from '../../composables/useConquerApi'
import { localDayOf } from '../../utils/corrections'
import { shortDate } from '../../utils/format'
import { formatSeconds } from '../../utils/videoFile'
import type { CorrectionVideoUrl, CorrectionVideoWho, CorrectionView } from '../../types'
import CqVideoSheet from '../media/CqVideoSheet.vue'

// Fase 202 D-26, D-28, DA-44: detalle de una corrección. Muestra el video del alumno, su comentario y,
// si ya la respondieron, el texto y el video del coach. Cada video se pide al tocarlo con `videoUrl`
// (lo pasa la pantalla: es el de `useConquerCorrections`) y se abre en `CqVideoSheet`: `available:
// false` (borrado o vencido) dice "Video no disponible" sin ser un error. Un fallo real (503) va a un
// Notify con el copy en español del API.
const props = defineProps<{
  modelValue: boolean
  item: CorrectionView | null
  videoUrl: (id: number, who: CorrectionVideoWho) => Promise<CorrectionVideoUrl | null>
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const $q = useQuasar()

const videoOpen = ref(false)
const videoLoading = ref(false)
const videoUnavailable = ref(false)
const videoSource = ref<string | null>(null)
const videoTitle = ref('')
/** Cada pedido toma el siguiente número; solo el último aplica su respuesta. */
let playSeq = 0

const FETCH_ERROR = 'No pudimos abrir el video. Probá de nuevo.'

function localDate(iso: string | undefined): string {
  const day = iso ? localDayOf(iso) : ''
  return day ? shortDate(day) : ''
}

const sentText = computed(() => {
  const current = props.item
  if (!current) return ''
  const date = localDate(current.createdAt)
  const duration = formatSeconds(current.durationSec)
  return date ? `Lo mandaste el ${date} · ${duration}` : duration
})

const replyDate = computed(() => {
  const date = localDate(props.item?.reply?.repliedAt)
  return date ? `Te respondió el ${date}` : ''
})

function close(): void {
  emit('update:modelValue', false)
}

function resetVideo(): void {
  playSeq++
  videoOpen.value = false
  videoLoading.value = false
  videoUnavailable.value = false
  videoSource.value = null
}

function onVideoToggle(open: boolean): void {
  if (!open) resetVideo()
}

async function play(who: CorrectionVideoWho): Promise<void> {
  const current = props.item
  if (!current) return
  const seq = ++playSeq
  videoTitle.value = who === 'alumno' ? 'Tu video' : 'Video de tu coach'
  videoSource.value = null
  videoUnavailable.value = false
  videoLoading.value = true
  videoOpen.value = true
  try {
    const result = await props.videoUrl(current.id, who)
    if (seq !== playSeq) return
    if (!result) {
      // Se abortó (la pantalla se está yendo): no queda nada que mostrar
      resetVideo()
      return
    }
    if (result.available && result.url) videoSource.value = result.url
    else videoUnavailable.value = true
    videoLoading.value = false
  } catch (err: unknown) {
    if (seq !== playSeq) return
    resetVideo()
    $q.notify({
      type: 'negative',
      message: err instanceof ConquerApiError ? err.message : FETCH_ERROR,
    })
  }
}

// Cerrar el detalle (o cambiar de corrección) descarta el video y su URL firmada
watch(
  () => [props.modelValue, props.item?.id] as const,
  ([open]) => {
    if (!open) resetVideo()
  },
)
</script>

<style scoped lang="scss">
.cq-csheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 460px;
  max-height: 90vh;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
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
    overflow-wrap: anywhere;
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
    padding: 4px 16px 8px;
  }

  &__sec {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    min-width: 0;
  }

  &__sub {
    margin: 0;
    font-family: var(--cq-font-head);
    font-size: 13px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: normal;
    text-transform: uppercase;
    color: var(--cq-night);
  }

  &__text {
    margin: 0;
    font-size: 15px;
    line-height: 1.45;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--cq-text);
  }

  // La respuesta del coach va en una card blanca con filete dorado
  &__reply {
    padding: 14px 16px;
    border: 1.5px solid var(--cq-edge-gold);
    border-radius: 16px;
    background: var(--cq-surface);
  }
}
</style>
