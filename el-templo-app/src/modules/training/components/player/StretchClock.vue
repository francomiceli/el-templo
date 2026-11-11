<template>
  <!-- Fase 213-10: reloj por ejercicio del estiramiento (opción B del sketch). Presentacional: el
       tiempo ya viene anclado al paso a "playing" (`stretchClockElapsedMs`) y toda la lógica de
       tramos vive en utils/stretchSession.ts. El reloj NUNCA marca ejercicios (D-08): al terminar
       solo avisa que hay que marcar y terminar. -->
  <section
    class="stretch-clock"
    :class="{
      'stretch-clock--prep': phase.phase === 'transition',
      'stretch-clock--done': phase.phase === 'done',
    }"
    aria-label="Reloj del estiramiento"
  >
    <div class="stretch-clock__kicker">{{ kicker }}</div>
    <div class="stretch-clock__name">{{ title }}</div>
    <div class="stretch-clock__time" role="timer" :aria-label="timeAria">{{ timeLabel }}</div>
    <div class="stretch-clock__meta">
      <span v-if="sideLabel" class="stretch-clock__side">{{ sideLabel }}</span>
    </div>
    <div class="stretch-clock__switch" aria-live="polite">
      {{ switchNotice ? 'Cambiá de lado' : '' }}
    </div>
    <div
      class="stretch-clock__bar"
      role="progressbar"
      aria-label="Avance de la rutina"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="percent"
    >
      <i :style="{ width: percent + '%' }" />
    </div>
    <div class="stretch-clock__left">{{ leftLabel }}</div>
  </section>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import type { StretchExercise } from '../../types/stretch'
import { formatElapsedTime } from '../../utils/formatTime'
import {
  showSideSwitchNotice,
  stretchPhaseAt,
  stretchTimeline,
  stretchTotalMs,
  type StretchPhase,
} from '../../utils/stretchSession'

interface Props {
  exercises: StretchExercise[]
  /** Milisegundos de rutina ya anclados al paso a "playing" (stretchClockElapsedMs) */
  elapsedMs: number
}

export interface StretchSegmentChange {
  exerciseIndex: number
  side: 1 | 2 | null
  phase: StretchPhase['phase']
}

interface Emits {
  (e: 'segment-change', payload: StretchSegmentChange): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const timeline = computed(() => stretchTimeline(props.exercises))
const totalMs = computed(() => stretchTotalMs(timeline.value))
const phase = computed(() => stretchPhaseAt(props.elapsedMs, timeline.value))
const current = computed<StretchExercise | null>(() => props.exercises[phase.value.exerciseIndex] ?? null)
const switchNotice = computed(() => showSideSwitchNotice(phase.value))

const kicker = computed(() => {
  if (phase.value.phase === 'transition') return 'Preparate'
  if (phase.value.phase === 'done') return 'Rutina terminada'
  return 'Estirando'
})

const title = computed(() => {
  if (phase.value.phase === 'done') return 'Marcá lo que hiciste y terminá'
  const name = current.value?.name ?? ''
  return phase.value.phase === 'transition' ? `Ahora: ${name}` : name
})

const sideLabel = computed(() => {
  if (phase.value.phase === 'done' || !current.value) return ''
  if (phase.value.totalSides < 2) return 'Un solo lado'
  // En la transición todavía no hay lado: se anuncia el primero
  return `Lado ${phase.value.side ?? 1} de ${phase.value.totalSides}`
})

const timeLabel = computed(() => formatElapsedTime(Math.ceil(phase.value.remainingMs / 1000)))
const timeAria = computed(() => `Quedan ${Math.ceil(phase.value.remainingMs / 1000)} segundos`)

const percent = computed(() => {
  if (totalMs.value <= 0) return 0
  return Math.round(Math.min(Math.max(props.elapsedMs / totalMs.value, 0), 1) * 100)
})

const leftLabel = computed(() => {
  const leftSeconds = Math.ceil(Math.max(totalMs.value - props.elapsedMs, 0) / 1000)
  return `Quedan ${formatElapsedTime(leftSeconds)} de rutina`
})

// Aviso a la página en cada cambio de tramo (por si quiere vibrar); no depende del segundo a segundo
watch(
  () => [phase.value.exerciseIndex, phase.value.side, phase.value.phase] as const,
  ([exerciseIndex, side, ph]) => {
    emit('segment-change', { exerciseIndex, side, phase: ph })
  },
)
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';
@import 'src/css/premium-card';

.stretch-clock {
  flex: none;
  padding: 10px 16px 12px;
  text-align: center;
  background: $pd-surface;
  color: $pd-cream;
}

.stretch-clock__kicker {
  font-family: 'Montserrat', sans-serif;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: $pd-cream-2;
}

.stretch-clock__name {
  margin: 2px 0 4px;
  font-family: 'Montserrat', sans-serif;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.15;
  // Nombres largos: dos líneas como máximo
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

// Misma tipografía y ancho parejo que el reloj de bloque (dígitos de Cinzel no son tabulares)
.stretch-clock__time {
  font-family: 'Cinzel', Georgia, serif;
  font-size: 56px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}

.stretch-clock__meta {
  min-height: 26px;
  margin-top: 6px;
}

.stretch-clock__side {
  display: inline-block;
  padding: 3px 11px;
  border: 1px solid $pd-field-border;
  border-radius: 999px;
  font-family: 'Montserrat', sans-serif;
  font-size: 12px;
  font-weight: 700;
}

// Alto fijo: el aviso aparece y desaparece sin mover la barra
.stretch-clock__switch {
  min-height: 20px;
  margin-top: 4px;
  font-family: 'Montserrat', sans-serif;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: $pd-cream-2;
}

.stretch-clock__bar {
  position: relative;
  height: 6px;
  margin-top: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: rgba(240, 230, 214, 0.18);

  i {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    background: $pd-cream-2;
    transition: width 0.3s linear;
  }
}

.stretch-clock__left {
  margin-top: 4px;
  font-family: 'Geologica', sans-serif;
  font-size: 11.5px;
  color: $pd-cream-3;
}

@media (prefers-reduced-motion: reduce) {
  .stretch-clock__bar i {
    transition: none;
  }
}
</style>
