<!--
  Una foto privada del control físico de Conquer (fase 201, §6, D-08, T-201-70). Pide la URL
  firmada (300 s) al montarse o al cambiar de control o de pose, y la guarda SOLO en un ref local:
  ni store, ni storage del navegador, ni log. Si la imagen falla (URL vencida) pide otra, una sola
  vez. 503 = el almacenamiento privado todavía no está configurado: se muestra el texto del API.
  Sin botón de descarga.
-->
<template>
  <div class="conquer-photo">
    <q-spinner v-if="status === 'loading'" size="28px" color="secondary" />
    <img
      v-else-if="status === 'ok'"
      :src="url"
      :alt="alt"
      loading="lazy"
      referrerpolicy="no-referrer"
      draggable="false"
      class="conquer-photo__img"
      @error="onImageError"
    />
    <div v-else class="text-grey-8 text-center q-pa-md text-body2">{{ message }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import type { Pose } from 'src/types/conquer';

const props = defineProps<{
  userId: number;
  checkId: number;
  pose: Pose;
  alt: string;
}>();

const conquerApi = useConquerAdminApi();

const status = ref<'loading' | 'ok' | 'error'>('loading');
// Solo en memoria de este componente (T-201-70).
const url = ref('');
const message = ref('');
// Descarta respuestas de una foto que ya no está en pantalla.
let token = 0;
let retried = false;

async function load(isRetry: boolean): Promise<void> {
  const mine = ++token;
  retried = isRetry;
  status.value = 'loading';
  url.value = '';
  try {
    const res = await conquerApi.getMemberPhotoUrl(props.userId, props.checkId, props.pose);
    if (mine !== token) return;
    url.value = res.url;
    status.value = 'ok';
  } catch (err: unknown) {
    if (mine !== token) return;
    message.value = err instanceof Error ? err.message : 'No pudimos cargar la foto';
    status.value = 'error';
  }
}

function onImageError(): void {
  if (retried) {
    url.value = '';
    message.value = 'No se pudo mostrar la foto';
    status.value = 'error';
    return;
  }
  void load(true);
}

onMounted(() => {
  void load(false);
});

watch(
  () => [props.userId, props.checkId, props.pose],
  () => {
    void load(false);
  }
);
</script>

<style scoped lang="scss">
.conquer-photo {
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $grey-2;
  border-radius: 4px;
  overflow: hidden;
}

.conquer-photo__img {
  display: block;
  max-width: 100%;
  max-height: 480px;
  object-fit: contain;
  user-select: none;
}
</style>
