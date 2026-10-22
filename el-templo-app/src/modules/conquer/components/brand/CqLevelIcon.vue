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
      <path :d="HORNS[level]" />
      <path d="M20 25L7 25q3 8 14 6zM44 25l13 0q-3 8-14 6z" />
      <path d="M19 23Q32 15 45 23L43 40Q41 53 32 55 23 53 21 40z" />
      <ellipse cx="32" cy="46" rx="8.5" ry="6.5" :style="paperStyle" opacity=".92" />
      <circle cx="28.6" cy="46.5" r="1.5" />
      <circle cx="35.4" cy="46.5" r="1.5" />
      <circle cx="26" cy="33" r="1.8" :style="paperStyle" />
      <circle cx="38" cy="33" r="1.8" :style="paperStyle" />
      <path
        v-if="level === 'toro'"
        d="M28.5 51a3.6 3.6 0 0 0 7 0"
        fill="none"
        stroke="var(--cq-gold)"
        stroke-width="2"
        stroke-linecap="round"
      />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { LEVEL_INFO } from '../../utils/format'
import type { Level } from '../../types'

// Fase 201 D-09: ícono de cada nivel, la cabeza del toro que crece (prototipo `bull`): Ternero con
// cuernos chicos, Novillo medianos y Toro grandes y con argolla. Hereda el color del texto
// (`currentColor`); el "papel" (hocico y ojos) usa `--cq-paper`, que el sol pone en crema.
const props = defineProps<{
  level: Level
  size: number
}>()

const HORNS: Record<Level, string> = {
  ternero: 'M23 21l1.5-7 3.5 6zM41 21l-1.5-7-3.5 6z',
  novillo: 'M23 21Q14 19 13 9q5 7 14 9zM41 21q9-2 10-12-5 7-14 9z',
  toro: 'M23 21Q6 21 5 3q7 13 23 14zM41 21q17 0 18-18-7 13-23 14z',
}

const SCALE: Record<Level, number> = { ternero: 0.82, novillo: 0.92, toro: 1.02 }

const paperStyle = { fill: 'var(--cq-paper, var(--cq-sky2))' }
const transform = computed(() => `translate(32 36) scale(${SCALE[props.level]}) translate(-32 -36)`)
</script>

<style scoped lang="scss">
.cq-level-icon {
  flex-shrink: 0;
}
</style>
