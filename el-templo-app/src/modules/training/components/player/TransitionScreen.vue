<template>
  <PhotoScene class="transition-screen" role="region" aria-label="Entre bloques">
    <div class="transition-screen__body">
      <p class="transition-screen__kicker">{{ data.kicker }}</p>

      <!-- Recorrido de la sesión: hechos, el que sigue y pendientes -->
      <ol class="transition-screen__path">
        <li
          v-for="item in data.items"
          :key="item.key"
          class="transition-screen__step"
          :class="`transition-screen__step--${item.status}`"
          :aria-current="item.status === 'next' ? 'step' : undefined"
        >
          <span class="transition-screen__dot" aria-hidden="true" />
          <span class="transition-screen__name">{{ keepHyphenWords(item.name) }}</span>
          <span class="transition-screen__meta">{{ keepHyphenWords(item.meta) }}</span>
          <span v-if="item.status === 'done'" class="transition-screen__sr">, hecho</span>
        </li>
      </ol>

      <!-- Mitad inferior: descanso activo con aro, descanso sin reloj, o lo que viene -->
      <section v-if="timedRest || freeRest || previewRest" class="transition-screen__rest">
        <p class="transition-screen__kicker">
          {{ previewRest ? 'Lo que viene' : 'Descanso activo' }}
        </p>

        <!-- a. Movilidad con segundos: aro + video + dosis -->
        <div v-if="timedRest" class="transition-screen__row">
          <div class="transition-screen__ring" role="timer" :aria-label="ringLabel">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle class="transition-screen__ring-bg" cx="60" cy="60" :r="RING_RADIUS" />
              <circle
                class="transition-screen__ring-fg"
                cx="60"
                cy="60"
                :r="RING_RADIUS"
                :stroke-dasharray="RING_LENGTH"
                :stroke-dashoffset="ringOffset"
              />
            </svg>
            <div class="transition-screen__ring-in">
              <span
                class="transition-screen__ring-time"
                :class="{ 'transition-screen__ring-time--ok': countdown.isDone.value }"
              >
                {{ ringTime }}
              </span>
              <span class="transition-screen__ring-sub">{{ ringSub }}</span>
            </div>
          </div>
          <div class="transition-screen__info">
            <div class="transition-screen__video">
              <VideoPlaceholder v-if="timedRest.videoUrl" :video-url="timedRest.videoUrl" />
              <span v-else class="transition-screen__play" aria-hidden="true" />
            </div>
            <p class="transition-screen__ex">{{ timedRest.name }}</p>
            <p class="transition-screen__dose">{{ timedRest.detail }}</p>
          </div>
          <!-- Solo al llegar a "Listo" se anuncia (un anuncio por segundo sería ruido) -->
          <span class="transition-screen__sr" aria-live="polite">{{ doneAnnouncement }}</span>
        </div>

        <!-- b. Movilidad con repeticiones: sin reloj -->
        <div v-else-if="freeRest" class="transition-screen__row">
          <div class="transition-screen__video transition-screen__video--big">
            <VideoPlaceholder v-if="freeRest.videoUrl" :video-url="freeRest.videoUrl" />
            <span v-else class="transition-screen__play" aria-hidden="true" />
          </div>
          <div class="transition-screen__info">
            <p class="transition-screen__ex">{{ freeRest.name }}</p>
            <p v-if="freeRest.detail" class="transition-screen__dose">{{ freeRest.detail }}</p>
            <p class="transition-screen__hint">
              Sin reloj: hacelas a tu ritmo y seguí cuando estés.
            </p>
          </div>
        </div>

        <!-- c. Sin movilidad: los ejercicios del bloque que viene -->
        <ul v-else-if="previewRest" class="transition-screen__list">
          <li v-for="(item, i) in previewRest.items" :key="`${i}-${item.name}`">
            <span class="transition-screen__list-name">{{ item.name }}</span>
            <span class="transition-screen__list-dose">{{ item.dose }}</span>
          </li>
          <li v-if="previewRest.extra > 0" class="transition-screen__list-more">
            y {{ previewRest.extra }} más
          </li>
        </ul>
      </section>

      <div class="transition-screen__foot">
        <button ref="ctaRef" type="button" class="transition-screen__cta" @click="emit('start')">
          <q-icon v-if="data.next === 'block'" name="play_arrow" size="22px" />
          <span>{{ data.actionLabel }}</span>
        </button>
        <button type="button" class="transition-screen__link" @click="emit('back')">
          Volver al último ejercicio
        </button>
      </div>
    </div>
  </PhotoScene>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import PhotoScene from './PhotoScene.vue'
import VideoPlaceholder from './VideoPlaceholder.vue'
import { useRestCountdown } from '../../composables/useRestCountdown'
import { formatCountdown, type BlockTransitionData } from '../../utils/blockTransition'
import { keepHyphenWords } from '../../utils/blockMeta'

// Pantalla única entre bloques (fase 197, sketch 018 D · Recorrido + Respiro): el recorrido de la
// sesión arriba, el descanso activo del bloque que terminó abajo y un solo botón hacia el 3-2-1.
// El descanso nunca arranca solo el bloque siguiente: al llegar a cero el aro dice "Listo" y listo.

interface Props {
  data: BlockTransitionData
}

interface Emits {
  (e: 'start'): void
  (e: 'back'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Aro de 120 px: radio 52, el trazo se vacía con lo que falta
const RING_RADIUS = 52
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

// Un computed por caso: el template no depende de que el tipo se afine solo dentro del v-if
const timedRest = computed(() => (props.data.rest.kind === 'timed' ? props.data.rest : null))
const freeRest = computed(() => (props.data.rest.kind === 'free' ? props.data.rest : null))
const previewRest = computed(() => (props.data.rest.kind === 'preview' ? props.data.rest : null))

// El descanso es el que traía el bloque al montarse (la pantalla se monta una vez por transición)
const countdown = useRestCountdown(timedRest.value?.seconds ?? 0)

// Terminado = aro completo (en salvia); si no, se vacía a medida que pasa el tiempo
const ringOffset = computed(() =>
  countdown.isDone.value ? 0 : RING_LENGTH * (1 - countdown.fractionLeft.value),
)

const ringLabel = computed(() =>
  countdown.isDone.value
    ? 'Descanso activo terminado'
    : `Descanso activo, quedan ${formatCountdown(countdown.remaining.value)}`,
)

const ringTime = computed(() =>
  countdown.isDone.value ? 'Listo' : formatCountdown(countdown.remaining.value),
)

const ringSub = computed(() =>
  countdown.isDone.value ? 'descanso' : `de ${formatCountdown(countdown.total)}`,
)

const doneAnnouncement = computed(() =>
  countdown.isDone.value ? 'Descanso activo terminado' : '',
)

const ctaRef = ref<HTMLButtonElement | null>(null)

onMounted(() => {
  if (timedRest.value) countdown.start()
  // Foco inicial en el botón principal (lectores de pantalla y teclado)
  void nextTick(() => ctaRef.value?.focus({ preventScroll: true }))
})

onUnmounted(() => {
  countdown.cleanup()
})
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.transition-screen {
  color: $pd-cream;
}

.transition-screen__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: max(44px, calc(env(safe-area-inset-top, 0px) + 20px)) 20px
    max(28px, calc(env(safe-area-inset-bottom, 0px) + 16px));
}

.transition-screen__kicker {
  margin: 0;
  font-family: 'Cinzel', serif;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: $pd-cream-2;
}

// Recorrido ----------------------------------------------------------------------------------------
.transition-screen__path {
  position: relative;
  list-style: none;
  margin: 18px 0 0;
  padding: 0;

  // Línea que une los puntos
  &::before {
    content: '';
    position: absolute;
    left: 9px;
    top: 14px;
    bottom: 14px;
    width: 2px;
    background: rgba(240, 230, 214, 0.2);
  }
}

.transition-screen__step {
  position: relative;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 9px 0;
}

.transition-screen__dot {
  position: relative;
  z-index: 1;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid rgba(240, 230, 214, 0.45);
  background: #1c1915;
}

.transition-screen__name {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 16px;
  color: $pd-cream-3;
}

.transition-screen__meta {
  font-size: 13px;
  color: $pd-cream-3;
  white-space: nowrap;
}

// Hechos: salvia, nombre tachado
.transition-screen__step--done {
  .transition-screen__dot {
    border-color: $pd-sage-on-dark;
    background: $pd-sage-on-dark;
  }

  .transition-screen__name {
    color: $pd-sage-on-dark;
    text-decoration: line-through;
    text-decoration-thickness: 1.5px;
  }
}

// El que sigue: dorado
.transition-screen__step--next {
  margin: 4px -12px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(212, 180, 106, 0.12);
  border: 1px solid rgba(212, 180, 106, 0.45);

  .transition-screen__dot {
    border-color: $pd-gold;
    background: $pd-gold;
    box-shadow: 0 0 0 6px rgba(212, 180, 106, 0.18);
  }

  .transition-screen__name {
    font-size: 22px;
    color: #fff;
  }

  .transition-screen__meta {
    color: $pd-cream-2;
  }
}

// Mitad inferior -------------------------------------------------------------------------------------
.transition-screen__rest {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid rgba(240, 230, 214, 0.16);
}

.transition-screen__row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
}

.transition-screen__ring {
  position: relative;
  flex: none;
  width: 120px;
  height: 120px;

  svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
}

.transition-screen__ring-bg {
  fill: none;
  stroke: rgba(240, 230, 214, 0.14);
  stroke-width: 8;
}

.transition-screen__ring-fg {
  fill: none;
  stroke: $pd-sage-on-dark;
  stroke-width: 8;
  stroke-linecap: round;

  // Sin movimiento con `prefers-reduced-motion`: la cuenta sigue, el aro salta de a segundo
  @media (prefers-reduced-motion: no-preference) {
    transition: stroke-dashoffset 1s linear;
  }
}

.transition-screen__ring-in {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.transition-screen__ring-time {
  font-family: 'Montserrat', sans-serif;
  font-weight: 800;
  font-size: 30px;
  color: #fff;
  font-variant-numeric: tabular-nums;

  &--ok {
    font-size: 22px;
    color: $pd-sage-on-dark;
  }
}

.transition-screen__ring-sub {
  font-size: 11px;
  letter-spacing: 0.06em;
  color: $pd-cream-2;
}

.transition-screen__info {
  flex: 1;
  min-width: 0;
}

.transition-screen__video {
  position: relative;
  width: 100%;
  height: 64px;
  margin-bottom: 8px;
  overflow: hidden;
  border-radius: 10px;
  background: linear-gradient(135deg, #4a3f33, #2e2a26);
  border: 1px solid rgba(240, 230, 214, 0.14);

  &--big {
    flex: none;
    width: 120px;
    height: 120px;
    margin: 0;
  }

  // El video fallido del player muestra un cartel de 48 px + texto: acá no entra, queda el recuadro
  :deep(.video-placeholder__text) {
    display: none;
  }

  :deep(.video-placeholder .q-icon) {
    font-size: 28px;
  }
}

// Triángulo de "play" del recuadro sin video
.transition-screen__play {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  transform: translate(-40%, -50%);
  border-left: 12px solid $pd-cream-3;
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
}

.transition-screen__ex {
  margin: 0 0 2px;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 16px;
  line-height: 1.2;
  color: #fff;
}

.transition-screen__dose {
  margin: 0;
  font-size: 13px;
  color: $pd-cream-2;
}

.transition-screen__hint {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: $pd-cream-3;
}

.transition-screen__list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;

  li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 0;
    border-top: 1px solid rgba(240, 230, 214, 0.14);
    font-size: 15px;
    color: $pd-cream;

    &:last-child {
      border-bottom: 1px solid rgba(240, 230, 214, 0.14);
    }
  }
}

.transition-screen__list-dose {
  flex: none;
  color: $pd-cream-2;
  font-variant-numeric: tabular-nums;
}

.transition-screen__list-more {
  color: $pd-cream-3;
}

// Pie ------------------------------------------------------------------------------------------------
.transition-screen__foot {
  margin-top: auto;
  padding-top: 16px;
}

.transition-screen__cta {
  @include pd-cta(52px);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 16px;
}

.transition-screen__link {
  display: block;
  width: 100%;
  min-height: 44px;
  margin-top: 6px;
  border: 0;
  background: none;
  color: $pd-cream-2;
  font-family: 'Geologica', sans-serif;
  font-weight: 500;
  font-size: 14px;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

// Solo para lectores de pantalla
.transition-screen__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@include pd-sheen-keyframes;
</style>
