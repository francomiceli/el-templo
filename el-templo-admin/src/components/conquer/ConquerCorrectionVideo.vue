<!--
  Video privado de una corrección de Conquer (fase 202, D-26, DA-44, T-201-147). Pide la URL
  firmada (300 s) al montarse o al cambiar de corrección o de quién (alumno o coach), y la guarda
  SOLO en un ref local: ni store, ni storage del navegador, ni log. `available: false` (borrado o
  vencido) y un error del <video> muestran "Video no disponible". Si la URL vence mientras el coach
  mira y el video falla, "Volver a cargar" pide otra. 503 = los videos todavía no están
  configurados: se muestra el texto del API.
-->
<template>
  <div class="conquer-correction-video" data-test="conquer-correction-video">
    <q-spinner v-if="status === 'loading'" size="28px" color="secondary" />
    <video
      v-else-if="status === 'ok'"
      :src="url"
      controls
      playsinline
      preload="metadata"
      class="conquer-correction-video__player"
      @error="onVideoError"
    />
    <div v-else class="text-center q-pa-md">
      <div class="text-grey-8 text-body2">{{ message }}</div>
      <q-btn
        v-if="canReload"
        flat
        dense
        no-caps
        color="secondary"
        label="Volver a cargar"
        class="q-mt-sm"
        data-test="conquer-correction-video-reload"
        @click="load"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import type { CorrectionVideoWho } from 'src/types/conquer';

const props = defineProps<{
  correctionId: number;
  who: CorrectionVideoWho;
}>();

const UNAVAILABLE = 'Video no disponible';

const conquerApi = useConquerAdminApi();

const status = ref<'loading' | 'ok' | 'unavailable'>('loading');
// Solo en memoria de este componente (T-201-147).
const url = ref('');
const message = ref(UNAVAILABLE);
// "Volver a cargar" no tiene sentido si el API dijo que no hay video.
const canReload = ref(false);
// Descarta respuestas de un video que ya no está en pantalla.
let token = 0;

async function load(): Promise<void> {
  const mine = ++token;
  status.value = 'loading';
  url.value = '';
  try {
    const res = await conquerApi.getCorrectionVideoUrl(props.correctionId, props.who);
    if (mine !== token) return;
    if (!res.available || res.url === null) {
      message.value = UNAVAILABLE;
      canReload.value = false;
      status.value = 'unavailable';
      return;
    }
    url.value = res.url;
    status.value = 'ok';
  } catch (err: unknown) {
    if (mine !== token) return;
    message.value = err instanceof Error ? err.message : UNAVAILABLE;
    canReload.value = true;
    status.value = 'unavailable';
  }
}

function onVideoError(): void {
  token += 1;
  url.value = '';
  message.value = UNAVAILABLE;
  canReload.value = true;
  status.value = 'unavailable';
}

onMounted(() => {
  void load();
});

watch(
  () => [props.correctionId, props.who],
  () => {
    void load();
  }
);
</script>

<style scoped lang="scss">
.conquer-correction-video {
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $grey-2;
  border-radius: 4px;
  overflow: hidden;
}

.conquer-correction-video__player {
  display: block;
  width: 100%;
  max-height: 60vh;
  background: #000;
}
</style>
