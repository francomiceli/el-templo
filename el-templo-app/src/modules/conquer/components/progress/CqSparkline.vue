<template>
  <div class="cq-spark" role="img" aria-label="Curva del escalón 1">
    <!-- La línea y el techo se estiran con el ancho (`preserveAspectRatio="none"`) pero con trazo fijo -->
    <svg
      class="cq-spark__svg"
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <!-- Línea punteada del techo (8 reps / 12 s) -->
      <line
        class="cq-spark__ceiling"
        x1="0"
        :y1="SPARK_PAD"
        :x2="WIDTH"
        :y2="SPARK_PAD"
        stroke-dasharray="3 3"
      />
      <polyline v-if="points.length > 1" class="cq-spark__line" :points="polyline" />
    </svg>
    <!-- Los puntos son círculos HTML posicionados en %: no se ovalan en pantallas anchas (S12-9) -->
    <span
      v-for="(p, i) in points"
      :key="i"
      class="cq-spark__dot"
      aria-hidden="true"
      :style="{ left: `${(p.x / WIDTH) * 100}%`, top: `${(p.y / HEIGHT) * 100}%` }"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SPARK_PAD, sparklinePoints } from '../../utils/progressView'
import type { Unit } from '../../types'

// Fase 201 §7.1 Progreso, DA-35 (sketch 022 B `.spark`): curva del E1 desde el último cambio de
// peldaño. Línea punteada en el techo, trazo azul noche y puntos dorados con borde azul noche. Los
// puntos los calcula `sparklinePoints` (acotados al techo); acá solo se dibuja. Hallazgo S12-9: el
// SVG estirado ovalaba los círculos, así que la línea va en el SVG (trazo `non-scaling-stroke`) y los
// puntos en un `span` redondo encima, a la misma posición en porcentaje.
const WIDTH = 300
const HEIGHT = 56

const props = defineProps<{
  values: readonly number[]
  unit: Unit
}>()

const points = computed(() => sparklinePoints(props.values, props.unit, WIDTH, HEIGHT))
const polyline = computed(() => points.value.map((p) => `${p.x},${p.y}`).join(' '))
</script>

<style scoped lang="scss">
.cq-spark {
  position: relative;
  width: 100%;
  height: 48px;
  margin-top: 6px;

  &__svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  &__ceiling {
    stroke: var(--cq-edge);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  &__line {
    fill: none;
    stroke: var(--cq-night);
    stroke-width: 2;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  &__dot {
    position: absolute;
    width: 9px;
    height: 9px;
    box-sizing: border-box;
    transform: translate(-50%, -50%);
    border: 1.2px solid var(--cq-night);
    border-radius: 50%;
    background: var(--cq-deco-gold);
  }
}
</style>
