<template>
  <q-dialog
    :model-value="modelValue"
    position="bottom"
    @update:model-value="(value: boolean) => emit('update:modelValue', value)"
  >
    <!-- Fase 201 D-25, DA-44: el diálogo se monta fuera de .cq-root (teleport): la hoja lleva su propia raíz -->
    <div class="cq-root cq-vsheet" role="dialog" :aria-label="title">
      <div class="cq-vsheet__head">
        <h2 class="cq-vsheet__title">{{ title }}</h2>
        <button type="button" class="cq-textlink cq-vsheet__close" @click="close">Cerrar</button>
      </div>

      <!-- La única pieza oscura de la hoja: el escenario del video -->
      <div class="cq-vsheet__stage cq-dark">
        <div v-if="loading" class="cq-vsheet__state" role="status">
          <span class="cq-vsheet__spin" aria-hidden="true" />
          <span>Cargando el video</span>
        </div>
        <p v-else-if="showError" class="cq-vsheet__state" role="status">Video no disponible</p>
        <!-- Fase 201 D-25: reproducción en línea (iPhone y Android), arranca solo con el play del alumno y baja solo entonces -->
        <video
          v-else
          ref="videoEl"
          class="cq-vsheet__video"
          :src="url ?? undefined"
          controls
          playsinline
          preload="metadata"
          @error="onVideoError"
        />
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import '../../styles/conquer.scss'
import { createLogger } from 'src/utils/logger'

// Fase 201 D-25, DA-44: hoja de video reusable de Conquer (tutoriales ahora y correcciones en 202-13). El padre
// pasa la URL ya resuelta: acá no se pide nada. `loading` muestra un spinner mientras el padre la
// pide; `unavailable` (o un error del `<video>`, o una URL vacía) dice "Video no disponible", sin rojo.
// Al cerrar se pausa el video. Nunca se loguea la URL (puede ser firmada).
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    url: string | null
    loading?: boolean
    unavailable?: boolean
  }>(),
  { loading: false, unavailable: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const log = createLogger('CqVideoSheet')
const videoEl = ref<HTMLVideoElement | null>(null)
const failed = ref(false)

const showError = computed(() => props.unavailable || failed.value || !props.url)

function close(): void {
  emit('update:modelValue', false)
}

function onVideoError(): void {
  failed.value = true
  log.warn('tutorial video failed')
}

// Otra URL o volver a abrir la hoja da otra oportunidad al video
watch(
  () => props.url,
  () => {
    failed.value = false
  },
)

watch(
  () => props.modelValue,
  (open) => {
    if (open) failed.value = false
    else videoEl.value?.pause()
  },
)
</script>

<style scoped lang="scss">
.cq-vsheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 460px;
  max-height: 90vh;
  overflow-y: auto;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  border-radius: 20px 20px 0 0;
  background: var(--cq-surface-2);

  &__head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px 8px;
  }

  // Quasar da estilos globales a h1-h6: se fijan todos los que importan
  &__title {
    margin: 0;
    min-width: 0;
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

  // Dos clases en el mismo elemento le ganan a `.cq-root .cq-dark` (sombra, borde y línea luminosa)
  &__stage.cq-dark {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 160px;
    border-radius: 0;
    box-shadow: none;

    &::after {
      display: none;
    }
  }

  &__video {
    display: block;
    width: 100%;
    max-height: 70vh;
    object-fit: contain;
    background: transparent;
  }

  &__state {
    margin: 0;
    padding: 24px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    text-align: center;
    font-size: 15px;
    color: var(--cq-on-night);
  }

  &__spin {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid var(--cq-on-night-gold);
    border-right-color: transparent;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .cq-vsheet__spin {
    animation: cq-vsheet-spin 0.9s linear infinite;
  }
}

@keyframes cq-vsheet-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
