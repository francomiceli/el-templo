<template>
  <!-- Fase 197 D-15 (pantalla 5) y D-12: resumen del bloque libre. Página crema (no overlay).
       Solo el bloque, los minutos y los ejercicios: no toca la evaluación ni los contadores de
       la sesión del día. -->
  <div class="fb-sum">
    <header class="fb-sum__head">
      <p class="fb-sum__kicker">Bloque libre · {{ dayLabel }}</p>
      <h2 class="fb-sum__title">¡Listo!</h2>
      <p class="fb-sum__sub">Esto es lo que hiciste.</p>
    </header>

    <SummaryBlockCard :block="block" :done-ids="completedExerciseIds" />

    <SummaryStats :stats="stats" />

    <div v-if="auraAwarded" class="fb-sum__aura">
      <q-icon name="auto_awesome" size="22px" aria-hidden="true" />
      Sumaste 5 AURA
    </div>

    <!-- D-12: menos de 10' con AURA todavía disponible hoy. Si sale, queda guardado sin AURA. -->
    <div v-if="canEarnAura && !auraAwarded" class="fb-sum__more">
      <p class="fb-sum__more-text">Para sumar AURA hacen falta 10 minutos</p>
      <button
        type="button"
        class="fb-sum__cta fb-sum__cta--secondary"
        @click="emit('keep-training')"
      >
        Seguir entrenando
      </button>
    </div>

    <div class="fb-sum__foot">
      <button type="button" class="fb-sum__cta" @click="emit('done')">Listo</button>
      <button type="button" class="fb-sum__link" @click="emit('pick-another')">
        Elegir otro bloque
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FreeBlockItem } from '../../types/free-blocks'
import SummaryBlockCard from './SummaryBlockCard.vue'
import SummaryStats from './SummaryStats.vue'

interface Props {
  /** Bloque que se hizo */
  block: FreeBlockItem
  /** exerciseId de los ejercicios tildados */
  completedExerciseIds: number[]
  /** Segundos de reloj del bloque */
  durationSeconds: number
  /** true solo si el servidor acreditó los +5 AURA de este bloque */
  auraAwarded: boolean
  /** Terminó en menos de 10' y todavía hay AURA para cobrar hoy */
  canEarnAura: boolean
  /** Día en la sede, ej. "viernes 16" */
  dayLabel: string
}

interface Emits {
  (e: 'done'): void
  (e: 'pick-another'): void
  (e: 'keep-training'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const doneIds = computed(() => new Set(props.completedExerciseIds))

const doneCount = computed(
  () => props.block.exercises.filter((ex) => doneIds.value.has(ex.exerciseId)).length,
)

const workMinutes = computed(() => Math.max(1, Math.round(props.durationSeconds / 60)))

const stats = computed(() => [
  { value: `${workMinutes.value}'`, label: 'de trabajo' },
  { value: doneCount.value, label: 'ejercicios' },
])
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.fb-sum {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 16px 24px;
  color: $pd-ink;
}

.fb-sum__kicker {
  @include pd-kicker-light;
}

.fb-sum__title {
  margin: 4px 0 0;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 28px;
  line-height: 1.15;
  color: $pd-ink;
}

.fb-sum__sub {
  margin: 2px 0 0;
  font-family: 'Geologica', sans-serif;
  font-size: 13px;
  color: $pd-ink-2;
}

// D-18: el dorado es solo de AURA.
.fb-sum__aura {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 16px;
  background: $pd-gold-tint;
  color: $pd-gold-ink;
  font-family: 'Geologica', sans-serif;
  font-weight: 600;
  font-size: 16px;
}

.fb-sum__more {
  @include pd-surface-light;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
}

.fb-sum__more-text {
  margin: 0;
  font-family: 'Geologica', sans-serif;
  font-size: 13px;
  color: $pd-ink;
}

.fb-sum__foot {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  margin-top: 4px;
}

.fb-sum__cta {
  @include pd-cta(56px);

  &--secondary {
    @include pd-cta-secondary-light;
    min-height: 48px;
  }
}

.fb-sum__link {
  align-self: center;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  background: none;
  color: $pd-terra-ink;
  font-family: 'Geologica', sans-serif;
  font-weight: 600;
  font-size: 14px;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

@include pd-sheen-keyframes;
</style>
