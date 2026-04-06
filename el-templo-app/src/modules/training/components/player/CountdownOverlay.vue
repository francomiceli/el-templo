<template>
  <div class="countdown-overlay">
    <div class="countdown-overlay__backdrop" />
    <div class="countdown-overlay__content">
      <Transition name="countdown-pop" mode="out-in">
        <div v-if="current > 0" :key="current" class="countdown-overlay__number">
          {{ current }}
        </div>
        <div v-else key="go" class="countdown-overlay__go">VAMOS!</div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

interface Emits {
  (e: 'done'): void
}

const emit = defineEmits<Emits>()

const current = ref(3)
let timer: ReturnType<typeof setInterval> | null = null
let goTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  timer = setInterval(() => {
    if (current.value > 0) {
      current.value--
    } else if (timer) {
      clearInterval(timer)
      timer = null
      // Auto-dismiss after 1 second on "VAMOS!"
      goTimer = setTimeout(() => emit('done'), 1000)
    }
  }, 1000)
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (goTimer) {
    clearTimeout(goTimer)
    goTimer = null
  }
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.countdown-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.countdown-overlay__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(30, 27, 24, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.countdown-overlay__content {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 160px;
  height: 160px;
}

.countdown-overlay__number {
  font-family: 'Montserrat', sans-serif;
  font-size: 96px;
  font-weight: 800;
  color: #d4b46a;
  text-shadow: 0 0 40px rgba(212, 180, 106, 0.4);
  line-height: 1;
}

.countdown-overlay__go {
  font-family: 'Montserrat', sans-serif;
  font-size: 26px;
  font-weight: 800;
  color: white;
  letter-spacing: 0.08em;
  background: $primary;
  border-radius: 50%;
  width: 160px;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 40px rgba($primary, 0.4);
}

// Transition animations
.countdown-pop-enter-active {
  animation: pop-in 0.4s ease-out;
}

.countdown-pop-leave-active {
  animation: pop-out 0.2s ease-in;
}

@keyframes pop-in {
  0% {
    opacity: 0;
    transform: scale(1.8);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes pop-out {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(0.6);
  }
}
</style>
