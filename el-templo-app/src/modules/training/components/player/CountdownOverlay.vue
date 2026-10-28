<template>
  <PhotoScene class="countdown-overlay">
    <div class="countdown-overlay__content">
      <p v-if="kicker" class="countdown-overlay__kicker">{{ kicker }}</p>
      <div class="countdown-overlay__stage" role="timer" aria-label="Cuenta regresiva">
        <Transition name="countdown-pop" mode="out-in">
          <div v-if="current > 0" :key="current" class="countdown-overlay__number">
            {{ current }}
          </div>
          <!-- "¡VAMOS!" tallado en piedra (sketch 025): palabra en Cinzel 900 bronce, columna dórica y destello -->
          <div v-else key="go" class="countdown-overlay__go">
            <div class="countdown-overlay__go-word" data-t="¡VAMOS!">¡VAMOS!</div>
            <div class="countdown-overlay__go-column" aria-hidden="true">
              <DoricColumn :height="16" />
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </PhotoScene>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import PhotoScene from './PhotoScene.vue'
import DoricColumn from './DoricColumn.vue'
import { COUNTDOWN_START, COUNTDOWN_TICK_MS, GO_DONE_DELAY_MS } from '../../utils/countdown'

// 3-2-1 sobre la foto de Guía con su velo (fase 197, sketch 018). Los textos los arma cada página:
// el kicker dice dónde estás ("Bloque 2 de 4 · Combos I"). Sin el nombre del primer ejercicio.
interface Props {
  /** Cinzel arriba del número */
  kicker?: string
}

interface Emits {
  (e: 'done'): void
}

withDefaults(defineProps<Props>(), {
  kicker: '',
})
const emit = defineEmits<Emits>()

const current = ref(COUNTDOWN_START)
let timer: ReturnType<typeof setInterval> | null = null
let goTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  timer = setInterval(() => {
    if (current.value > 0) {
      current.value--
    } else if (timer) {
      clearInterval(timer)
      timer = null
      // Auto-dismiss after 1 second on "VAMOS!" (la animación del cartel dura 1,25 s: entra completa)
      goTimer = setTimeout(() => emit('done'), GO_DONE_DELAY_MS)
    }
  }, COUNTDOWN_TICK_MS)
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

// Alto fijo: el cartel de "¡VAMOS!" (palabra + columna) y el número no mueven el texto de abajo
.countdown-overlay__stage {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 176px;
  margin: 8px 0;
}

// Números en Cinzel, a juego con el cartel tallado
.countdown-overlay__number {
  font-family: 'Cinzel', Georgia, serif;
  font-size: 170px;
  font-weight: 700;
  color: #f3e6d2;
  text-shadow: 0 6px 40px rgba(212, 180, 106, 0.35);
  line-height: 1;
}

// ─── ¡VAMOS! tallado en piedra (sketch 025, variante 1) ───────────────────────────────────────────
// Cinzel 900 con relleno bronce: llega desde lejos, la columna dórica se abre abajo y cruza un destello.
// Línea de tiempo (<= 1,25 s, ver utils/countdown.ts): palabra 0–0,55 s · columna 0,2–0,8 s · destello 0,45–1,25 s.
.countdown-overlay__go {
  --go-col-w: min(300px, 76vw);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  // El cartel trae su propia animación: la entrada genérica (zoom 1.8) lo desproporcionaría
  &.countdown-pop-enter-active {
    animation: none;
  }
}

.countdown-overlay__go-word {
  position: relative;
  // 70px en un teléfono de 390; en pantallas angostas encoge para que no se corte
  font-family: 'Cinzel', Georgia, serif;
  font-size: min(70px, 17.5vw);
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.01em;
  white-space: nowrap;
  background: linear-gradient(180deg, #fff4dd 0%, #e9c99b 38%, #b07c4f 62%, #f1d6ad 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 2px 0 #5b3b24) drop-shadow(0 0 18px rgba(233, 191, 155, 0.55));
  animation: go-word-in 0.55s cubic-bezier(0.2, 1.4, 0.4, 1) both;

  // Destello que cruza la palabra
  &::after {
    content: attr(data-t);
    position: absolute;
    inset: 0;
    color: transparent;
    background: linear-gradient(
        105deg,
        transparent 42%,
        rgba(255, 252, 240, 0.95) 50%,
        transparent 58%
      )
      160% 0 / 250% 100% no-repeat;
    -webkit-background-clip: text;
    background-clip: text;
    filter: none;
    animation: go-word-sweep 0.8s 0.45s ease-out both;
  }
}

.countdown-overlay__go-column {
  width: 0;
  animation: go-column-open 0.6s 0.2s ease-out forwards;
}

@keyframes go-word-in {
  0% {
    opacity: 0;
    transform: scale(2.4);
    letter-spacing: 0.2em;
  }
  60% {
    opacity: 1;
  }
  100% {
    opacity: 1;
    transform: scale(1);
    letter-spacing: 0.01em;
  }
}

@keyframes go-word-sweep {
  from {
    background-position: 160% 0;
  }
  to {
    background-position: -60% 0;
  }
}

@keyframes go-column-open {
  to {
    width: var(--go-col-w);
  }
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

// Sin movimiento con `prefers-reduced-motion`: el número cambia sin zoom y el cartel de "¡VAMOS!"
// aparece ya terminado (palabra completa, columna abierta, sin destello)
@media (prefers-reduced-motion: reduce) {
  .countdown-pop-enter-active,
  .countdown-pop-leave-active {
    animation: none;
  }

  .countdown-overlay__go-word {
    animation: none;

    &::after {
      animation: none;
      display: none;
    }
  }

  .countdown-overlay__go-column {
    width: var(--go-col-w);
    animation: none;
  }
}
</style>
