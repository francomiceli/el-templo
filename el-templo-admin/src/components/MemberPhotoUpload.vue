<template>
  <div class="member-photo-upload">
    <!-- Avatar display -->
    <q-avatar size="128px" class="q-mb-sm" style="border: 2px solid #e0e0e0">
      <q-img
        v-if="currentPhotoUrl"
        :src="currentPhotoUrl"
        :ratio="1"
        fit="cover"
        spinner-color="primary"
      />
      <q-icon v-else name="person" size="64px" color="grey-5" />
    </q-avatar>

    <!-- Action buttons -->
    <div class="row q-gutter-xs justify-center">
      <q-btn
        flat
        dense
        icon="upload_file"
        label="Subir"
        size="sm"
        :loading="uploading"
        @click="triggerFileInput"
      />
      <q-btn
        flat
        dense
        icon="photo_camera"
        label="Camara"
        size="sm"
        :loading="uploading"
        @click="showWebcam = true"
      />
    </div>

    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      style="display: none"
      @change="onFileSelected"
    />

    <!-- Webcam dialog -->
    <q-dialog v-model="showWebcam" @hide="stopWebcam">
      <q-card style="min-width: 360px">
        <q-card-section>
          <div class="text-h6">Capturar foto</div>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <video
            ref="videoRef"
            autoplay
            playsinline
            style="width: 320px; height: 240px; background: #000; display: block; margin: 0 auto"
          ></video>
          <canvas ref="canvasRef" style="display: none" width="320" height="240"></canvas>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cancelar" @click="showWebcam = false" />
          <q-btn color="primary" label="Capturar" :loading="uploading" @click="captureWebcam" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useMembersApi } from 'src/composables/useMembersApi';

const log = createLogger('MemberPhotoUpload');

const props = defineProps<{
  userId: number;
  currentPhotoUrl: string | null;
}>();

const emit = defineEmits<{
  uploaded: [url: string];
}>();

const $q = useQuasar();
const membersApi = useMembersApi();

const uploading = ref(false);
const showWebcam = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const videoRef = ref<HTMLVideoElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
let webcamStream: MediaStream | null = null;

function triggerFileInput() {
  fileInputRef.value?.click();
}

function onFileSelected(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    doUpload(file);
  }
  // Reset input so the same file can be selected again
  if (target) target.value = '';
}

async function startWebcam() {
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 320, height: 240 },
    });
    if (videoRef.value) {
      videoRef.value.srcObject = webcamStream;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Failed to start webcam', { error: message });
    $q.notify({ type: 'negative', message: 'No se pudo acceder a la camara' });
    showWebcam.value = false;
  }
}

function captureWebcam() {
  if (!videoRef.value || !canvasRef.value) return;

  const canvas = canvasRef.value;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.drawImage(videoRef.value, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      const file = new File([blob], 'webcam-capture.jpg', { type: 'image/jpeg' });
      doUpload(file);
      showWebcam.value = false;
    },
    'image/jpeg',
    0.85
  );
}

function stopWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach((track) => track.stop());
    webcamStream = null;
  }
}

async function doUpload(file: File) {
  uploading.value = true;
  try {
    const publicUrl = await membersApi.uploadMemberPhoto(props.userId, file);
    emit('uploaded', publicUrl);
    $q.notify({ type: 'positive', message: 'Foto actualizada' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Photo upload failed', { error: message, userId: props.userId });
    $q.notify({ type: 'negative', message: 'Error al subir la foto' });
  } finally {
    uploading.value = false;
  }
}

// Start webcam when dialog opens
watch(showWebcam, (val) => {
  if (val) {
    nextTick(() => startWebcam());
  }
});

onBeforeUnmount(() => {
  stopWebcam();
});
</script>

<style scoped>
.member-photo-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
}
</style>
