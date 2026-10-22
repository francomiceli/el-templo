<template>
  <!-- Fase 201 §6, T-201-66: una foto privada del control. La URL firmada se pide AL MOSTRARLA, vive
       solo en esta variable local y no se guarda en el store ni se loguea. Si la imagen no carga (la
       URL venció) se pide otra una sola vez; si vuelve a fallar se ofrece reintentar. -->
  <div class="cq-photo">
    <img
      v-if="state === 'ready'"
      class="cq-photo__img"
      :src="url"
      :alt="alt"
      decoding="async"
      referrerpolicy="no-referrer"
      draggable="false"
      @error="onImageError"
    />
    <span v-else-if="state === 'loading'" class="cq-photo__msg" role="status">Cargando…</span>
    <span v-else-if="state === 'none'" class="cq-photo__msg">Sin foto</span>
    <span v-else class="cq-photo__msg" role="alert">
      {{ message }}
      <button type="button" class="cq-small" @click="retry">Reintentar</button>
    </span>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { createLogger } from 'src/utils/logger'
import { ConquerApiError, isConquerCanceled, useConquerApi } from '../../composables/useConquerApi'
import type { Pose } from '../../types'

// Foto de un control por URL firmada (5 minutos). Sin foto en esa pose muestra "Sin foto".
const props = defineProps<{
  checkId: number
  pose: Pose
  hasPhoto: boolean
  alt: string
}>()

const log = createLogger('CqCheckPhoto')
const api = useConquerApi()

const state = ref<'none' | 'loading' | 'ready' | 'error'>('loading')
const url = ref('')
const message = ref('')
let retriedOnce = false
/** Descarta la respuesta de un pedido viejo si cambió la foto o se pidió otra. */
let ticket = 0

async function load(): Promise<void> {
  if (!props.hasPhoto) {
    ticket += 1
    state.value = 'none'
    return
  }
  ticket += 1
  const mine = ticket
  state.value = 'loading'
  try {
    const res = await api.getPhotoUrl(props.checkId, props.pose)
    if (mine !== ticket) return
    url.value = res.url
    state.value = 'ready'
  } catch (err: unknown) {
    if (isConquerCanceled(err) || mine !== ticket) return
    if (err instanceof ConquerApiError) {
      if (!err.isExpected) log.error('Failed to load check photo', { status: err.status })
      message.value = err.message
    } else {
      message.value = 'No pudimos cargar la foto. Probá de nuevo.'
    }
    state.value = 'error'
  }
}

function onImageError(): void {
  if (!retriedOnce) {
    retriedOnce = true
    void load()
    return
  }
  message.value = 'No pudimos mostrar la foto.'
  state.value = 'error'
}

function retry(): void {
  retriedOnce = false
  void load()
}

watch(
  () => [props.checkId, props.pose, props.hasPhoto] as const,
  () => {
    retriedOnce = false
    void load()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  ticket += 1
  api.cleanup()
})
</script>

<style scoped lang="scss">
.cq-photo {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;

  &__img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
  }

  &__msg {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 10px;
    text-align: center;
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.16em;
    color: var(--cq-muted);
  }
}
</style>
