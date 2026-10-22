<template>
  <div class="cq-pose" :class="{ 'cq-pose--done': status === 'done' }">
    <div class="cq-pose__niche" aria-hidden="true">
      <span v-if="status === 'uploading'" class="cq-pose__spin" />
      <span v-else-if="status === 'done'" class="cq-pose__mark">✓</span>
      <span v-else class="cq-pose__letter">{{ POSE_LABELS[pose].charAt(0) }}</span>
    </div>

    <div class="cq-pose__body">
      <div class="cq-caps">{{ POSE_LABELS[pose] }}</div>
      <p class="cq-sub cq-pose__tip">{{ POSE_TIPS[pose] }}</p>

      <p v-if="status === 'uploading'" class="cq-pose__state" role="status">Subiendo la foto…</p>
      <p v-else-if="status === 'done'" class="cq-pose__state cq-pose__state--ok" role="status">
        Foto guardada
      </p>
      <p v-else-if="status === 'error'" class="cq-pose__state cq-pose__state--err" role="alert">
        {{ message }}
      </p>

      <div class="cq-pose__actions">
        <button
          v-if="status === 'error' && canRetry"
          type="button"
          class="cq-small cq-small--fill"
          :disabled="disabled"
          @click="emit('retry')"
        >
          Reintentar
        </button>
        <button
          type="button"
          class="cq-small"
          :disabled="disabled || status === 'uploading'"
          :aria-label="`${actionLabel} de ${POSE_LABELS[pose].toLowerCase()}`"
          @click="emit('capture')"
        >
          {{ actionLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Pose } from '../../types'
import { POSE_LABELS, POSE_TIPS } from '../../utils/bodyCheck'

// Fase 201 §6, D-15: una hornacina del control físico (prototipo `.ph` + `.plinth`) con la pose, su
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
.cq-pose {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
  padding: 14px;
  border: 1px solid var(--cq-hair2);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.085), rgba(255, 255, 255, 0.035));

  &--done {
    border-color: var(--cq-hair);
  }

  // Hornacina: arco arriba, pedestal dorado abajo
  &__niche {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 84px;
    height: 112px;
    margin-bottom: 9px;
    border-radius: 42px 42px 4px 4px;
    border: 1px solid var(--cq-hair2);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03));

    &::after {
      content: '';
      position: absolute;
      left: 6px;
      right: 6px;
      bottom: -9px;
      height: 5px;
      border-radius: 1px;
      background: var(--cq-gold);
      opacity: 0.55;
    }
  }

  &--done &__niche {
    border-color: var(--cq-gold);

    &::after {
      opacity: 1;
    }
  }

  &__letter,
  &__mark {
    font-family: var(--cq-display);
    font-size: 34px;
    font-weight: 600;
    color: var(--cq-gold-hi);
  }

  &__spin {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 3px solid var(--cq-gold);
    border-right-color: transparent;
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  &__tip {
    margin: 0;
  }

  &__state {
    margin: 0;
    font-size: 13px;
    color: var(--cq-cream);

    &--ok {
      color: var(--cq-gold-hi);
    }

    &--err {
      color: var(--cq-gold-hi);
      font-weight: 500;
    }
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }
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
