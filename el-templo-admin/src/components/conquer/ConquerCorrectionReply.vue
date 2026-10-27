<!--
  Respuesta del coach a una corrección con video de Conquer (fase 202, D-26, DA-40, DA-43, DA-52):
  texto, un video propio de hasta 30 s o los dos. La duración se valida al ELEGIR el archivo (feedback
  inmediato, sin Notify) y otra vez dentro de `prepareMp4` al enviar; un .mov se convierte a MP4 en el
  navegador y la subida pasa por `useConquerVideoUpload` (URL firmada, PUT sin auth). La respuesta es
  final: el API devuelve la corrección ya `respondida` y el padre deja de ofrecer este formulario. Si
  otro coach respondió antes (409), se muestra el mensaje del API y se relee la corrección para que
  la bandeja se actualice.
-->
<template>
  <div class="reply" data-test="conquer-correction-reply">
    <q-separator class="q-mb-md" />
    <div class="text-subtitle2 q-mb-sm">Tu respuesta</div>

    <q-input
      v-model="text"
      type="textarea"
      outlined
      autogrow
      counter
      maxlength="1000"
      label="Tu respuesta"
      :disable="sending"
      data-test="conquer-reply-text"
    />

    <div class="q-mt-md" data-test="conquer-reply-video">
      <div class="text-body2 text-grey-8 q-mb-xs">Grabá o elegí un video de hasta 30 s</div>

      <div v-if="video" class="row items-center q-gutter-sm q-mb-xs">
        <q-icon name="movie" color="secondary" />
        <span class="text-body2 ellipsis" style="max-width: 260px">{{ video.name }}</span>
        <span class="text-body2 text-grey-8">{{ durationText(videoSeconds) }}</span>
        <q-btn
          flat
          dense
          no-caps
          color="accent"
          label="Quitar"
          :disable="sending"
          data-test="conquer-reply-video-remove"
          @click="removeVideo"
        />
      </div>
      <q-btn
        v-else
        outline
        no-caps
        color="secondary"
        icon="upload"
        label="Elegir video"
        :disable="sending || checking"
        :loading="checking"
        style="min-height: 44px"
        data-test="conquer-reply-video-pick"
        @click="pickFile"
      />

      <div v-if="videoError" class="text-body2 text-negative q-mt-xs" role="alert">
        {{ videoError }}
      </div>

      <input
        ref="fileInput"
        type="file"
        accept="video/mp4,video/quicktime,.mp4,.mov"
        class="hidden"
        data-test="conquer-reply-file"
        @change="onFileChange"
      />
    </div>

    <div v-if="sending" class="q-mt-md" data-test="conquer-reply-progress">
      <div class="text-body2 text-accent">{{ progressLabel }}</div>
      <q-linear-progress
        :indeterminate="!showPercent"
        :value="percent / 100"
        color="secondary"
        track-color="grey-3"
        rounded
        size="8px"
      />
    </div>

    <div class="row justify-end q-mt-md">
      <q-btn
        unelevated
        no-caps
        color="secondary"
        icon="send"
        label="Responder"
        :loading="sending"
        :disable="!canSend"
        style="min-height: 44px"
        data-test="conquer-reply-send"
        @click="send"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { ConquerApiError, useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import { useConquerVideoUpload } from 'src/composables/useConquerVideoUpload';
import type { AdminCorrection, ReplyCorrectionBody } from 'src/types/conquer';
import { durationText } from 'src/utils/conquer-format';

const props = defineProps<{
  correction: AdminCorrection;
}>();

const emit = defineEmits<{
  replied: [correction: AdminCorrection];
  /** Mientras envía, el diálogo no se puede cerrar (si no, la lista no se enteraría del 200). */
  busy: [value: boolean];
}>();

/** Topes del API para la respuesta del coach (DA-40): 100 MB y 30 s. */
const REPLY_MAX_BYTES = 100 * 1024 * 1024;
const REPLY_MAX_SECONDS = 30;

/** Código del 409 cuando otro coach ya respondió (202-06). */
const ALREADY_REPLIED = 'CONQUER_CORRECCION_RESPONDIDA';

const $q = useQuasar();
const conquerApi = useConquerAdminApi();
const upload = useConquerVideoUpload();

const fileInput = ref<HTMLInputElement | null>(null);
const text = ref('');
const video = ref<File | null>(null);
const videoSeconds = ref(0);
const videoError = ref<string | null>(null);
const checking = ref(false);
const sending = ref(false);

const percent = upload.percent;
const showPercent = computed(() => upload.phase.value !== 'idle');
const progressLabel = computed(() => {
  if (upload.phase.value === 'converting') return `Convirtiendo… ${percent.value}%`;
  if (upload.phase.value === 'uploading') return `Subiendo… ${percent.value}%`;
  return 'Enviando…';
});
const canSend = computed(
  () => !sending.value && !checking.value && (text.value.trim().length > 0 || video.value !== null)
);

function notifyError(message: string): void {
  $q.notify({ type: 'negative', message });
}

function pickFile(): void {
  fileInput.value?.click();
}

function removeVideo(): void {
  video.value = null;
  videoSeconds.value = 0;
  videoError.value = null;
}

// Feedback inmediato: un video de más de 30 s se rechaza acá, sin Notify y sin gastar ffmpeg.
async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  // Se limpia para poder elegir el mismo archivo otra vez después de un error.
  input.value = '';
  if (!file) return;

  removeVideo();
  checking.value = true;
  try {
    const checked = await upload.checkDuration(file, REPLY_MAX_SECONDS);
    if ('message' in checked) {
      videoError.value = checked.message;
      return;
    }
    video.value = file;
    videoSeconds.value = checked.seconds;
  } finally {
    checking.value = false;
  }
}

// Si otro coach respondió antes, se relee la corrección (ya respondida) para que la bandeja y el
// diálogo se pongan al día. Las respondidas son las 50 más recientes: la acaba de responder otro.
async function refreshAfterConflict(): Promise<void> {
  try {
    const answered = await conquerApi.listCorrections('respondida');
    const fresh = answered.find((c) => c.id === props.correction.id);
    if (fresh) emit('replied', fresh);
  } catch (err: unknown) {
    notifyError(err instanceof Error ? err.message : 'No pudimos actualizar la corrección');
  }
}

/** Sube el video del coach (conversión, URL firmada, PUT) y arma el body con la clave. */
async function uploadVideo(file: File, trimmed: string): Promise<ReplyCorrectionBody | null> {
  const prepared = await upload.prepareMp4(file, {
    maxBytes: REPLY_MAX_BYTES,
    maxSeconds: 30,
  });
  if (!prepared.ok) {
    notifyError(prepared.message);
    return null;
  }
  const slot = await conquerApi.requestReplyUpload(props.correction.id, 'video/mp4');
  if (prepared.file.size > slot.maxBytes) {
    notifyError('El archivo supera el máximo permitido');
    return null;
  }
  await upload.putToBucket(slot.uploadUrl, prepared.file);
  return {
    text: trimmed.length > 0 ? trimmed : null,
    key: slot.key,
    durationSec: prepared.seconds ?? videoSeconds.value,
  };
}

async function send(): Promise<void> {
  if (!canSend.value) return;
  const trimmed = text.value.trim();
  sending.value = true;
  try {
    const body: ReplyCorrectionBody | null = video.value
      ? await uploadVideo(video.value, trimmed)
      : { text: trimmed };
    if (body === null) return;
    const updated = await conquerApi.replyCorrection(props.correction.id, body);
    $q.notify({ type: 'positive', message: 'Respuesta enviada' });
    emit('replied', updated);
  } catch (err: unknown) {
    notifyError(err instanceof Error ? err.message : 'No pudimos enviar la respuesta');
    if (err instanceof ConquerApiError && err.code === ALREADY_REPLIED) {
      await refreshAfterConflict();
    }
  } finally {
    upload.reset();
    sending.value = false;
  }
}

watch(sending, (value) => emit('busy', value));

onBeforeUnmount(upload.cleanup);
</script>
