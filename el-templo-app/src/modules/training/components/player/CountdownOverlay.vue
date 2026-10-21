<template>
  <PhotoScene class="countdown-overlay">
    <div class="countdown-overlay__content">
      <p v-if="kicker" class="countdown-overlay__kicker">{{ kicker }}</p>
      <div class="countdown-overlay__stage" role="timer" aria-label="Cuenta regresiva">
        <Transition name="countdown-pop" mode="out-in">
          <div v-if="current > 0" :key="current" class="countdown-overlay__number">
            {{ current }}
          </div>
          <div v-else key="go" class="countdown-overlay__go">VAMOS!</div>
        </Transition>
      </div>
      <p v-if="subtitle" class="countdown-overlay__subtitle">{{ subtitle }}</p>
    </div>
  </PhotoScene>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import PhotoScene from './PhotoScene.vue'

// 3-2-1 sobre la foto de Guía con su velo (fase 197, sketch 018). Los textos los arma cada página:
// el kicker dice dónde estás ("Bloque 2 de 4 · Combos I") y el subtítulo qué viene primero.
interface Props {
  /** Cinzel arriba del número */
  kicker?: string
  /** Debajo del número (el primer ejercicio) */
  subtitle?: string
}

interface Emits {
  (e: 'done'): void
}

withDefaults(defineProps<Props>(), {
  kicker: '',
  subtitle: '',
})
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
@import 'src/css/premium-card';

.countdown-overlay__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
}

.countdown-overlay__kicker {
  margin: 0;
  font-family: 'Cinzel', serif;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: $pd-cream-2;
}

// Alto fijo: el cartel de "VAMOS!" (círculo de 160) y el número no mueven el texto de abajo
.countdown-overlay__stage {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 176px;
  margin: 8px 0;
}

.countdown-overlay__number {
  font-family: 'Montserrat', sans-serif;
  font-size: 168px;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 6px 40px rgba(212, 180, 106, 0.35);
  line-height: 1;
}

.countdown-overlay__subtitle {
  margin: 0;
  font-size: 16px;
  color: $pd-cream-2;
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

// Sin movimiento con `prefers-reduced-motion`: el número cambia sin zoom
@media (prefers-reduced-motion: reduce) {
  .countdown-pop-enter-active,
  .countdown-pop-leave-active {
    animation: none;
  }
}
</style>
