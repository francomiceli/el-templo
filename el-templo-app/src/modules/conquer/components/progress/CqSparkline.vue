<template>
  <svg
    class="cq-spark"
    :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
    preserveAspectRatio="none"
    role="img"
    aria-label="Curva del escalón 1"
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
    <circle v-for="(p, i) in points" :key="i" class="cq-spark__dot" :cx="p.x" :cy="p.y" r="3.5" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SPARK_PAD, sparklinePoints } from '../../utils/progressView'
import type { Unit } from '../../types'

// Fase 201 §7.1 Progreso (ref `drawSparks`): curva del E1 desde el último cambio de peldaño. Línea
// punteada en el techo, trazo y puntos en dorado claro. Los puntos los calcula `sparklinePoints`
// (acotados al techo); acá solo se dibuja.
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
  display: block;
  width: 100%;
  height: 56px;

  &__ceiling {
    stroke: var(--cq-hair);
    stroke-width: 1;
  }

  &__line {
    fill: none;
    stroke: var(--cq-gold-hi);
    stroke-width: 2;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  &__dot {
    fill: var(--cq-gold-hi);
  }
}
</style>
