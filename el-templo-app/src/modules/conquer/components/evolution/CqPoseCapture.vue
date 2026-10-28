<template>
  <div class="cq-pose cq-card" :class="{ 'cq-pose--done': status === 'done' }">
    <div class="cq-pose__tile" aria-hidden="true">
      <span v-if="status === 'uploading'" class="cq-pose__spin" />
      <span v-else-if="status === 'done'" class="cq-pose__mark">✓</span>
      <span v-else class="cq-pose__letter">{{ POSE_LABELS[pose].charAt(0) }}</span>
    </div>

    <div class="cq-pose__body">
      <h2 class="cq-pose__name">{{ POSE_LABELS[pose] }}</h2>
      <p class="cq-sub">{{ POSE_TIPS[pose] }}</p>

      <p v-if="status === 'uploading'" class="cq-sub cq-pose__state" role="status">
        Subiendo la foto…
      </p>
      <p v-else-if="status === 'done'" class="cq-pose__state" role="status">
        <span class="cq-chip cq-chip--hecha">Foto guardada</span>
      </p>
      <p v-else-if="status === 'error'" class="cq-notice cq-pose__notice" role="alert">
        ! {{ message }}
      </p>

      <div class="cq-pose__actions">
        <CqButton
          v-if="status === 'error' && canRetry"
          label="Reintentar"
          variant="secondary"
          small
          :disabled="disabled"
          @click="emit('retry')"
        />
        <CqButton
          :label="actionLabel"
          variant="secondary"
          small
          :disabled="disabled || status === 'uploading'"
          :aria-label="`${actionLabel} de ${POSE_LABELS[pose].toLowerCase()}`"
          @click="emit('capture')"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Pose } from '../../types'
import { POSE_LABELS, POSE_TIPS } from '../../utils/bodyCheck'
import CqButton from '../brand/CqButton.vue'

// Fase 201 §6, D-15: una card del control físico (DA-36) con la pose, su
// consejo y el botón para sacar la foto. No sabe de la cámara ni del API: muestra el estado que le
// pasa la pantalla y emite `capture` / `retry`.
export type PoseStatus = 'idle' | 'uploading' | 'done' | 'error'

const props = withDefaults(
  defineProps<{
    pose: Pose
    status: PoseStatus
    /** Texto del fallo (solo con `status = 'error'`). */
    message?: string
    /** La foto sigue en memoria: se puede reintentar la subida sin volver a sacarla. */
    canRetry?: boolean
    disabled?: boolean
  }>(),
  { message: '', canRetry: false, disabled: false },
)

const emit = defineEmits<{ capture: []; retry: [] }>()

const actionLabel = computed(() => (props.status === 'done' ? 'Volver a sacar' : 'Sacar foto'))
</script>

<style scoped lang="scss">
// `.cq-pose.cq-card` (dos clases en el mismo elemento) le gana a `.cq-root .cq-card` (0,2,0): fila en
// vez de columna y borde punteado dorado mientras la pose esta vacia.
.cq-pose.cq-card {
  flex-direction: row;
  align-items: flex-start;
  gap: 14px;
  border: 1.5px dashed var(--cq-edge-gold);
  box-shadow: none;
}

.cq-pose.cq-pose--done {
  border-style: solid;
  border-color: var(--cq-edge);
}

// Recuadro de la pose: radio 12, sin foto en memoria (la privacidad de la foto no se toca aca)
.cq-pose__tile {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 12px;
  background: var(--cq-sand);
  box-shadow: inset 0 0 0 1px var(--cq-line);
}

.cq-pose--done .cq-pose__tile {
  background: var(--cq-night);
}

.cq-pose__letter,
.cq-pose__mark {
  font-family: var(--cq-font-head);
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
  color: var(--cq-night);
}

.cq-pose--done .cq-pose__mark {
  color: var(--cq-on-night-hi);
}

.cq-pose__spin {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 3px solid var(--cq-edge-gold);
  border-right-color: transparent;
}

.cq-pose__body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

// Un `h2` lleva todo fijado: Quasar tiene estilos globales de h1-h6
.cq-pose__name {
  margin: 0;
  font-family: var(--cq-font-head);
  font-weight: 700;
  font-size: 16px;
  line-height: 1.2;
  letter-spacing: 0;
  color: var(--cq-night);
}

.cq-pose__state {
  margin: 0;
}

// Aviso dentro de la card (incluye el 503 de fotos no disponibles): sin rojo, texto sobre blanco
.cq-pose .cq-pose__notice {
  margin: 0;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.cq-pose__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

@media (prefers-reduced-motion: no-preference) {
  .cq-pose__spin {
    animation: cq-pose-spin 0.8s linear infinite;
  }
}

@keyframes cq-pose-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
