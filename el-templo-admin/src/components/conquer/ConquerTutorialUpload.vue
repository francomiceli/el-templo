<!--
  Tutorial en video de un ejercicio o de un combo (fase 202, D-25, DA-39, DA-48, DA-52): subir, ver,
  reemplazar y borrar el "cómo se hace" que el alumno ve en "Ver cómo se hace". Un .mov se convierte
  a MP4 en el navegador antes de subir (`transcodeToMp4`); el API solo acepta MP4 de hasta 200 MB y
  no hay tope de duración. El flujo es: archivo → conversión (si hace falta) → URL firmada → PUT al
  bucket → confirmación; el API devuelve la vista completa de tutoriales y el store la reemplaza.
  A diferencia de Ejercicios, la subida NO depende del ambiente (DA-48): anda también en staging. Sin
  almacenamiento configurado (`storageReady` false) los botones quedan deshabilitados con un aviso.
-->
<template>
  <div data-test="conquer-tutorial-upload">
    <q-banner
      v-if="!storageReady && !hideStorageNotice"
      dense
      rounded
      class="bg-grey-3 text-accent q-mb-sm"
      data-test="conquer-tutorial-storage-banner"
    >
      <template #avatar><q-icon name="cloud_off" color="secondary" /></template>
      El almacenamiento de videos no está configurado
    </q-banner>

    <div
      v-if="url === null"
      class="text-body2 text-grey-8 q-mb-sm"
      data-test="conquer-tutorial-empty"
    >
      Sin video tutorial
    </div>
    <video
      v-else
      :src="url"
      controls
      preload="metadata"
      playsinline
      class="tutorial-video q-mb-sm"
      data-test="conquer-tutorial-video"
    />

    <div v-if="busy" class="q-mb-sm" data-test="conquer-tutorial-progress">
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

    <div class="row q-gutter-sm">
      <q-btn
        unelevated
        no-caps
        color="secondary"
        :icon="url === null ? 'upload' : 'swap_horiz'"
        :label="url === null ? 'Subir video' : 'Reemplazar'"
        :disable="!storageReady || busy"
        style="min-height: 44px"
        data-test="conquer-tutorial-pick"
        @click="pickFile"
      />
      <q-btn
        v-if="url !== null"
        outline
        no-caps
        color="secondary"
        icon="delete_outline"
        label="Borrar"
        :disable="busy"
        :loading="deleting"
        style="min-height: 44px"
        data-test="conquer-tutorial-delete"
        @click="confirmDelete = true"
      />
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="video/mp4,video/quicktime,.mp4,.mov"
      class="hidden"
      data-test="conquer-tutorial-file"
      @change="onFileChange"
    />

    <q-dialog v-model="confirmDelete">
      <q-card style="min-width: 280px; max-width: 420px">
        <q-card-section class="text-subtitle1 text-weight-medium">Borrar tutorial</q-card-section>
        <q-card-section class="q-pt-none">
          ¿Borrar el tutorial de {{ name }}? Los alumnos dejan de ver "Ver cómo se hace".
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn
            flat
            no-caps
            color="accent"
            label="Cancelar"
            style="min-height: 44px"
            data-test="conquer-tutorial-delete-cancel"
            @click="confirmDelete = false"
          />
          <q-btn
            unelevated
            no-caps
            color="secondary"
            label="Borrar"
            style="min-height: 44px"
            data-test="conquer-tutorial-delete-confirm"
            @click="removeTutorial"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import { useConquerVideoUpload } from 'src/composables/useConquerVideoUpload';
import { useConquerTutorialsStore } from 'src/stores/useConquerTutorialsStore';
import type { TutorialTargetInput } from 'src/types/conquer';

const props = defineProps<{
  target: TutorialTargetInput;
  /** Nombre del ejercicio o del combo (va en la confirmación de borrado). */
  name: string;
  url: string | null;
  storageReady: boolean;
  /** Ajustes muestra UN aviso arriba de la card en vez de uno por combo. */
  hideStorageNotice?: boolean;
}>();

/** Tope del API para un tutorial (DA-39): 200 MB, sin tope de duración. */
const TUTORIAL_MAX_BYTES = 200 * 1024 * 1024;

const $q = useQuasar();
const conquerApi = useConquerAdminApi();
const store = useConquerTutorialsStore();
const upload = useConquerVideoUpload();

const fileInput = ref<HTMLInputElement | null>(null);
const working = ref(false);
const deleting = ref(false);
const confirmDelete = ref(false);

const percent = upload.percent;
const busy = computed(() => working.value || deleting.value);
const showPercent = computed(() => upload.phase.value !== 'idle');
const progressLabel = computed(() => {
  if (upload.phase.value === 'converting') return `Convirtiendo… ${percent.value}%`;
  if (upload.phase.value === 'uploading') return `Subiendo… ${percent.value}%`;
  return 'Guardando…';
});

function notifyError(message: string): void {
  $q.notify({ type: 'negative', message });
}

function pickFile(): void {
  fileInput.value?.click();
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  // Se limpia para poder elegir el mismo archivo otra vez después de un error.
  input.value = '';
  if (!file || !props.storageReady) return;

  working.value = true;
  try {
    const prepared = await upload.prepareMp4(file, { maxBytes: TUTORIAL_MAX_BYTES });
    if (!prepared.ok) {
      notifyError(prepared.message);
      return;
    }
    const slot = await conquerApi.requestTutorialUpload(props.target, 'video/mp4');
    if (prepared.file.size > slot.maxBytes) {
      notifyError('El archivo supera el máximo permitido');
      return;
    }
    await upload.putToBucket(slot.uploadUrl, prepared.file);
    const view = await conquerApi.confirmTutorial(props.target, slot.key);
    store.apply(view);
    $q.notify({ type: 'positive', message: 'Tutorial guardado' });
  } catch (err: unknown) {
    notifyError(err instanceof Error ? err.message : 'No pudimos guardar el tutorial');
  } finally {
    upload.reset();
    working.value = false;
  }
}

async function removeTutorial(): Promise<void> {
  confirmDelete.value = false;
  deleting.value = true;
  try {
    const view = await conquerApi.deleteTutorial(props.target);
    store.apply(view);
    $q.notify({ type: 'positive', message: 'Tutorial borrado' });
  } catch (err: unknown) {
    notifyError(err instanceof Error ? err.message : 'No pudimos borrar el tutorial');
  } finally {
    deleting.value = false;
  }
}

onBeforeUnmount(upload.cleanup);
</script>

<style scoped>
.tutorial-video {
  display: block;
  width: 100%;
  max-width: 320px;
  border-radius: 8px;
  background: #000;
}
</style>
