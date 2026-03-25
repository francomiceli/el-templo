<template>
  <Transition name="fade">
    <div
      v-if="message"
      class="rpe-contextual"
      role="status"
      aria-live="polite"
      :style="{ background: message.background }"
    >
      <q-icon :name="message.icon" :color="message.iconColor" size="20px" />
      <span class="rpe-contextual__text">{{ message.text }}</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  /** Current RPE value from the slider (1-10 or null) */
  rpeValue: number | null
  /** Whether the user has interacted with the RPE slider */
  hasInteracted: boolean
}

interface RpeMessage {
  icon: string
  iconColor: string
  background: string
  text: string
}

const props = defineProps<Props>()

function getRpeMessage(rpe: number): RpeMessage {
  if (rpe <= 3) {
    return {
      icon: 'trending_up',
      iconColor: 'primary',
      background: 'rgba(192, 122, 86, 0.08)',
      text: 'Podrías subir la intensidad en tu próxima sesión',
    }
  }
  if (rpe <= 6) {
    return {
      icon: 'check_circle',
      iconColor: 'positive',
      background: 'rgba(90, 154, 107, 0.08)',
      text: 'Buen balance -- segui asi',
    }
  }
  if (rpe <= 8) {
    return {
      icon: 'hotel',
      iconColor: 'secondary',
      background: 'rgba(160, 117, 90, 0.08)',
      text: 'Buen esfuerzo. Descansa bien hoy',
    }
  }
  // rpe 9-10
  return {
    icon: 'local_fire_department',
    iconColor: 'warning',
    background: 'rgba(212, 168, 67, 0.08)',
    text: 'Entrenaste al máximo. Considerá un día de recuperación mañana',
  }
}

const message = computed<RpeMessage | null>(() => {
  if (!props.hasInteracted || props.rpeValue === null) return null
  return getRpeMessage(props.rpeValue)
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.rpe-contextual {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  margin-top: 12px;

  &__text {
    font-size: 14px;
    line-height: 1.5;
    color: rgba($primary, 0.8);
  }
}

.fade-enter-active {
  transition: opacity 200ms ease;
}

.fade-enter-from {
  opacity: 0;
}
</style>
