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

      <!-- Después del NUCLEUS: los dos Deuteros para elegir acá mismo, en lugar del descanso activo -->
      <section v-if="choice" class="transition-screen__rest">
        <p class="transition-screen__kicker">Elegí tu Deuteros</p>
        <p class="transition-screen__hint">
          Elegí según si querés dedicar más tiempo al tren superior o al tren inferior (piernas).
          <b>Tocá una tarjeta para elegirla.</b>
        </p>
        <div
          class="transition-screen__options"
          :class="{ 'transition-screen__options--waiting': selected === null }"
          role="radiogroup"
          aria-label="Elegí tu Deuteros"
        >
          <button
            v-for="option in choice"
            :key="option.id"
            type="button"
            role="radio"
            :aria-checked="selected === option.id"
            class="transition-screen__option"
            :class="{ 'transition-screen__option--on': selected === option.id }"
            @click="selected = option.id"
          >
            <span class="transition-screen__option-k">{{ option.label }}</span>
            <span class="transition-screen__option-name">{{ keepHyphenWords(option.ruta) }}</span>
            <span class="transition-screen__option-meta">{{ option.meta }}</span>
            <ul class="transition-screen__option-ex">
              <li v-for="(nombre, i) in option.ejercicios" :key="`${i}-${nombre}`">{{ nombre }}</li>
              <li v-if="option.resto > 0" class="transition-screen__option-more">
                y {{ option.resto }} más
              </li>
            </ul>
            <!-- Guía de toque: qué hacer con la tarjeta (la elegida dice que está elegida) -->
            <span class="transition-screen__option-tap">
              <q-icon :name="selected === option.id ? 'check_circle' : 'touch_app'" size="16px" />
              {{ selected === option.id ? 'Elegido' : 'Tocá para elegir' }}
            </span>
          </button>
        </div>
      </section>

      <!-- Mitad inferior: los ejercicios del bloque que viene (nunca el descanso activo) -->
      <section v-else-if="previewRest" class="transition-screen__rest">
        <p class="transition-screen__kicker">Lo que viene</p>
        <ul class="transition-screen__list">
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
        <button
          ref="ctaRef"
          type="button"
          class="transition-screen__cta"
          :disabled="choice !== null && selected === null"
          @click="onCta"
        >
          <q-icon v-if="data.next === 'block' || selected" name="play_arrow" size="22px" />
          <span>{{ ctaLabel }}</span>
        </button>
        <button type="button" class="transition-screen__link" @click="emit('back')">
          Volver al último ejercicio
        </button>
      </div>
    </div>
  </PhotoScene>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import PhotoScene from './PhotoScene.vue'
import type { BlockTransitionData } from '../../utils/blockTransition'
import { keepHyphenWords } from '../../utils/blockMeta'
import { playerBlockContent } from '../../utils/playerHeader'
import { getRouteName } from '../../utils/routeNames'
import type { Block } from '../../types/session'

// Pantalla única entre bloques (fase 197, sketch 018 D · Recorrido): el recorrido de la sesión
// arriba, abajo los ejercicios del bloque que viene (o, después del NUCLEUS, los dos Deuteros para
// elegir) y un solo botón hacia el 3-2-1. Desde 2026-10-27 no se muestra el descanso activo.

type DeuterosId = 'DEUTEROS_1' | 'DEUTEROS_2'

interface Props {
  data: BlockTransitionData
  /**
   * Los dos Deuteros cuando el que sigue es "elegir Deuteros" (`data.next === 'deuteros'`): la pantalla
   * los muestra para elegir acá, en lugar del descanso activo del NUCLEUS (2026-10-27).
   */
  deuterosOptions?: { id: DeuterosId; label: string; block: Block }[] | null
}

interface Emits {
  (e: 'start'): void
  (e: 'back'): void
  (e: 'choose-deuteros', choice: DeuterosId): void
}

const props = withDefaults(defineProps<Props>(), { deuterosOptions: null })
const emit = defineEmits<Emits>()

/** Máximo de ejercicios nombrados en cada opción de Deuteros (uno por línea) */
const MAX_EJERCICIOS_OPCION = 5

// Opciones de Deuteros listas para pintar; null = esta transición no es la de elegir Deuteros
const choice = computed(() => {
  const options = props.deuterosOptions
  if (props.data.next !== 'deuteros' || !options || options.length !== 2) return null
  return options.map((o) => {
    const nombres = o.block.exercises.map((ex) => ex.exerciseName)
    return {
      id: o.id,
      label: o.label,
      ruta: getRouteName(o.block.route),
      meta: [o.block.format, playerBlockContent(o.block)].filter(Boolean).join(' - '),
      ejercicios: nombres.slice(0, MAX_EJERCICIOS_OPCION),
      resto: Math.max(0, nombres.length - MAX_EJERCICIOS_OPCION),
    }
  })
})

const selected = ref<DeuterosId | null>(null)

const ctaLabel = computed(() => {
  if (!choice.value) return props.data.actionLabel
  const elegido = choice.value.find((o) => o.id === selected.value)
  return elegido ? `Comenzar ${elegido.label}` : 'Tocá un Deuteros para comenzar'
})

function onCta(): void {
  if (!choice.value) {
    emit('start')
  } else if (selected.value) {
    emit('choose-deuteros', selected.value)
  }
}

// La lista del bloque que viene (o nada: el Deuteros sin elegir se elige en esta misma pantalla)
const previewRest = computed(() => (props.data.rest.kind === 'preview' ? props.data.rest : null))

const ctaRef = ref<HTMLButtonElement | null>(null)

onMounted(() => {
  // Foco inicial en el botón principal (lectores de pantalla y teclado)
  void nextTick(() => ctaRef.value?.focus({ preventScroll: true }))
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

.transition-screen__hint {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: $pd-cream-3;
}

.transition-screen__hint b {
  font-weight: 600;
  color: $pd-cream;
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

// Elección de Deuteros: dos tarjetas lado a lado, la elegida con borde dorado ------------------------
.transition-screen__options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 12px;
}

.transition-screen__option {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 12px;
  border: 1.5px solid rgba(240, 230, 214, 0.22);
  border-radius: 14px;
  background: rgba(28, 25, 21, 0.55);
  color: $pd-cream;
  font-family: 'Geologica', sans-serif;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;

  &--on {
    border-color: $pd-gold;
    background: rgba(28, 25, 21, 0.78);
    box-shadow:
      0 0 0 1px $pd-gold,
      0 6px 18px rgba(0, 0, 0, 0.35);
  }
}

.transition-screen__option-k {
  font-family: 'Cinzel', serif;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: $pd-cream-2;
}

.transition-screen__option-name {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 16px;
  line-height: 1.2;
}

.transition-screen__option-meta {
  font-size: 12px;
  color: $pd-cream-2;
}

// Ejercicios uno por línea
.transition-screen__option-ex {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;

  li {
    padding: 3px 0;
    font-size: 14px;
    line-height: 1.3;
    color: $pd-cream;
  }
}

.transition-screen__option-ex .transition-screen__option-more {
  color: $pd-cream-3;
}

// "Tocá para elegir" al pie de la tarjeta; en la elegida, "Elegido" en dorado
.transition-screen__option-tap {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: auto;
  padding-top: 10px;
  font-size: 12px;
  font-weight: 600;
  color: $pd-cream-2;
}

.transition-screen__option--on .transition-screen__option-tap {
  color: $pd-gold;
}

// Mientras no hay elegida, los bordes laten suave para invitar a tocar
.transition-screen__options--waiting .transition-screen__option {
  animation: transition-screen-invite 1.8s ease-in-out infinite;
}

@keyframes transition-screen-invite {
  0%,
  100% {
    border-color: rgba(240, 230, 214, 0.22);
  }

  50% {
    border-color: rgba(240, 230, 214, 0.6);
  }
}

@media (prefers-reduced-motion: reduce) {
  .transition-screen__options--waiting .transition-screen__option {
    animation: none;
  }
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

  &:disabled {
    @include pd-cta-disabled;
  }
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
