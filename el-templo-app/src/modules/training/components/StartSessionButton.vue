<template>
  <transition name="slide-up">
    <div v-if="visible" class="start-button-container">
      <q-btn
        :disable="disabled"
        color="primary"
        size="lg"
        class="start-button"
        unelevated
        @click="handleStart"
      >
        <div class="button-content">
          <q-icon name="play_arrow" size="24px" class="q-mr-sm" />
          <span class="text-weight-bold">
            {{ disabled ? 'Sesión Completada' : 'Comenzar Entrenamiento' }}
          </span>
        </div>
      </q-btn>
    </div>
  </transition>
</template>

<script setup lang="ts">
interface Props {
  visible: boolean;
  disabled?: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  start: [];
}>();

function handleStart() {
  emit('start');
}
</script>

<style scoped lang="scss">
.start-button-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  background: linear-gradient(
    to top,
    rgba(255, 255, 255, 1) 0%,
    rgba(255, 255, 255, 0.95) 80%,
    rgba(255, 255, 255, 0) 100%
  );
  z-index: 100;
  pointer-events: none; // Allow clicks through gradient
}

.start-button {
  width: 100%;
  height: 56px;
  border-radius: 28px;
  pointer-events: all; // Re-enable clicks on button
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);

  &:active {
    transform: scale(0.98);
  }
}

.button-content {
  display: flex;
  align-items: center;
  justify-content: center;
}

// Slide-up transition
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease-out, opacity 0.3s ease-out;
}

.slide-up-enter-from {
  transform: translateY(100%);
  opacity: 0;
}

.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

.slide-up-enter-to,
.slide-up-leave-from {
  transform: translateY(0);
  opacity: 1;
}

// Disabled state styling
.start-button:disabled {
  opacity: 0.6;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}
</style>
