<template>
  <svg
    class="cq-level-icon"
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    role="img"
    :aria-label="LEVEL_INFO[level].name"
  >
    <g :transform="transform" fill="currentColor">
      <template v-if="level === 'toro'">
        <path d="M27 14Q21 3 32 .8T37 14z" fill="var(--cq-deco-gold)" />
        <path
          d="M32 13V2.5M29.5 13.5Q26.5 8 27 3.5M34.5 13.5Q37.5 8 37 3.5"
          fill="none"
          stroke="currentColor"
          stroke-width=".9"
          stroke-linecap="round"
          opacity=".55"
        />
        <path d="M14 34C14 19 22 12 32 12s18 7 18 22v12q0 8-8 11h-6l-1-11h-6l-1 11h-6q-8-3-8-11z" />
        <path
          d="M18 30Q24.5 27.5 30.5 30v5q1.5 2 3 0v-5Q39.5 27.5 46 30l-1.5 4.5Q39 37.5 35.5 37L35 46h-6l-.5-9Q25 37.5 19.5 34.5z"
          :style="paperFill"
        />
        <path
          d="M15.5 25Q32 18 48.5 25"
          fill="none"
          stroke-width="1.4"
          stroke-linecap="round"
          :style="paperStroke"
        />
      </template>
      <template v-else>
        <template v-if="level === 'novillo'">
          <path d="M5 23Q7 3 32 2.5T59 23Q47 14.5 32 14.5T5 23z" />
          <path
            d="M32 13L12 12M32 13L18 7.5M32 13L25 5M32 13V4.2M32 13L39 5M32 13L46 7.5M32 13L52 12"
            fill="none"
            stroke-width="1.1"
            stroke-linecap="round"
            :style="paperStroke"
          />
        </template>
        <template v-else>
          <circle cx="32" cy="10" r="2.6" />
          <path d="M30.6 11h2.8v3h-2.8z" />
        </template>
        <path d="M10 37h44l-3 5H13z" />
        <path d="M13 38C13 21 21 13 32 13s19 8 19 25z" />
        <path
          d="M16.5 35h10v15q0 6-5.5 5.5-4.5-.5-4.5-5.5zM47.5 35h-10v15q0 6 5.5 5.5 4.5-.5 4.5-5.5z"
        />
        <path
          v-if="level === 'novillo'"
          d="M16 20.5Q32 10 48 20.5"
          fill="none"
          stroke-width="1.4"
          stroke-linecap="round"
          :style="paperStroke"
        />
        <path
          d="M17 27.5Q32 22 47 27.5"
          fill="none"
          stroke-width="1.6"
          stroke-linecap="round"
          :style="paperStroke"
        />
        <path d="M23.5 30.5Q32 27.5 40.5 30.5L40 38H24z" :style="paperFill" />
      </template>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { LEVEL_INFO } from '../../utils/format'
import type { Level } from '../../types'

// Fase 201 DA-16: ícono de cada nivel, un casco de frente que crece con el nivel: Legionario
// (`ternero`) con el casco romano simple, Centurión (`novillo`) con la cresta transversal y Espartano
// (`toro`) con el corintio y la cresta dorada. Va en azul noche sobre claro y en `--cq-on-night-hi`
// dentro de `.cq-dark` (regla en `conquer.scss`); el "papel" (la cara y las líneas del casco) usa
// `--cq-paper`, que `.cq-dark` define en azul noche. Sobre claro, el papel es blanco.
const props = defineProps<{
  level: Level
  size: number
}>()

const SCALE: Record<Level, number> = { ternero: 0.82, novillo: 0.92, toro: 1.02 }

const PAPER = 'var(--cq-paper, var(--cq-surface))'
const paperFill = { fill: PAPER }
const paperStroke = { stroke: PAPER }
const transform = computed(() => `translate(32 36) scale(${SCALE[props.level]}) translate(-32 -36)`)
</script>

<style scoped lang="scss">
.cq-level-icon {
  flex-shrink: 0;
  color: var(--cq-night);
}
</style>
