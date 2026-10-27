<template>
  <q-page class="guia-home">
    <h1 class="guia-home__sr">Guía</h1>

    <div class="guia-home__hub">
      <!-- Empezá acá: oscura con la foto de las barras. Abre las historias de siempre (ruta `guia`). -->
      <button
        type="button"
        class="guia-home__card guia-home__card--guia"
        :style="fotoStyle"
        @click="abrirHistorias"
      >
        <span class="guia-home__in">
          <span class="guia-home__kicker guia-home__kicker--dark">Empezá acá</span>
          <span class="guia-home__ttl">Cómo es entrenar en El Templo</span>
          <span class="guia-home__txt guia-home__txt--dark">
            Tu semana, las clases, los niveles. 7 historias cortas.
          </span>
          <span class="guia-home__grow" />
          <span class="guia-home__cta">Ver la guía</span>
        </span>
      </button>

      <!-- Tus músculos: blanca con el cuerpo encendido asomando a la derecha. -->
      <button type="button" class="guia-home__card guia-home__card--cuerpo" @click="abrirTuCuerpo">
        <span class="guia-home__fig" aria-hidden="true">
          <BodyFigure side="front" :lit="[]" :roles="HUB_ROLES" :height="380" />
        </span>
        <span class="guia-home__in guia-home__in--cuerpo">
          <span class="guia-home__kicker">Tus músculos</span>
          <span class="guia-home__ttl">Qué trabaja cada ejercicio</span>
          <span class="guia-home__txt">
            Tocá un músculo: qué hace y en qué ejercicios lo usás.
          </span>
          <span class="guia-home__grow" />
          <span class="guia-home__cta">Explorar</span>
        </span>
      </button>
    </div>
  </q-page>
</template>

<script setup lang="ts">
/**
 * Fase 200 D12 (sketch 020 "Síntesis"): portada de la Guía con dos cards de media pantalla. Solo
 * existe con ANATOMIA_ALUMNOS_ENABLED (la ruta `guia-inicio` no se registra apagado). D13: "Ver la
 * guía" va a la ruta `guia`, que sigue siendo las historias de siempre.
 */
import { useRouter } from 'vue-router'
import BodyFigure from 'src/components/anatomy/BodyFigure.vue'
import { NOCHE_GRADIENT, sceneBackgroundStyle } from 'src/constants/sceneVeil'

const router = useRouter()

// Misma foto y velo que la Guía (`/bars-open.webp`, sin URLs nuevas).
const fotoStyle = sceneBackgroundStyle(NOCHE_GRADIENT)

// `HUB_LIT` del sketch: pecho, abdomen, cuádriceps, espalda alta, glúteo y hombro trabajan fuerte;
// isquios, oblicuos y gemelos sostienen.
const HUB_ROLES: Record<string, 'fuerte' | 'sostiene'> = {
  chest: 'fuerte',
  abs: 'fuerte',
  quadriceps: 'fuerte',
  'upper-back': 'fuerte',
  gluteal: 'fuerte',
  deltoids: 'fuerte',
  hamstring: 'sostiene',
  obliques: 'sostiene',
  calves: 'sostiene',
}

function abrirHistorias(): void {
  void router.push({ name: 'guia' })
}

function abrirTuCuerpo(): void {
  void router.push({ name: 'tu-cuerpo' })
}
</script>

<style lang="scss" scoped>
@import 'src/css/brand';
@import 'src/css/premium-card';

@include pd-sheen-keyframes;

.guia-home {
  display: flex;
  flex-direction: column;
  background-color: transparent;
}

.guia-home__sr {
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

// Las dos cards se reparten el alto disponible (flex 1 con base 0: nunca empujan al q-page).
.guia-home__hub {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding: 14px;
}

.guia-home__card {
  position: relative;
  display: block;
  flex: 1 1 0;
  width: 100%;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid $pd-light-line;
  border-radius: 20px;
  background: #fff;
  color: $pd-ink;
  text-align: left;
  box-shadow: 0 6px 18px rgba(150, 89, 58, 0.08);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible {
    outline: 2px solid $pd-terra-ink;
    outline-offset: 2px;
  }
}

.guia-home__card--guia {
  border-color: $pd-surface;
  background-color: $pd-surface;
  color: $pd-cream;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.22);
}

.guia-home__in {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 20px 18px 18px;
}

// El cuerpo asoma a la derecha: el texto se queda en el 58 % de la izquierda.
.guia-home__in--cuerpo {
  max-width: 58%;
}

// Kicker en sans bold (Montserrat 800, como el rol de los bloques): Cinzel a 11 px se leía finito.
.guia-home__kicker {
  @include pd-role-label;
  display: block;
  font-size: 12px;
  letter-spacing: 0.1em;
}

.guia-home__kicker--dark {
  color: $pd-cream-2;
}

.guia-home__ttl {
  display: -webkit-box;
  margin-top: 6px;
  overflow: hidden;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 22px;
  line-height: 1.2;
  letter-spacing: -0.01em;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

// Con poco alto el texto se recorta (2 líneas) antes de pisar el botón.
.guia-home__txt {
  display: -webkit-box;
  margin-top: 8px;
  overflow: hidden;
  font-family: 'Geologica', sans-serif;
  font-size: 14.5px;
  line-height: 1.45;
  color: $pd-ink-2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.guia-home__txt--dark {
  color: $pd-cream-3;
}

.guia-home__grow {
  flex: 1;
  min-height: 8px;
}

// Botón lleno del rework (el de la card de hoy): es un span porque toda la card es el botón.
.guia-home__cta {
  @include pd-cta(46px);
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  justify-content: center;
  width: auto;
  flex: none;
}

.guia-home__fig {
  position: absolute;
  top: 14px;
  right: -30px;
  z-index: 1;
  pointer-events: none;

  :deep(.body-figure__caption) {
    display: none;
  }

  // Lo que no trabaja queda en un beige liso (sketch: `.mu:not(.r-*) path { fill: #ece3d6 }`).
  :deep(.mu:not(.mu--r-fuerte):not(.mu--r-sostiene):not(.mu--x) path) {
    fill: #ece3d6;
  }
}
</style>
