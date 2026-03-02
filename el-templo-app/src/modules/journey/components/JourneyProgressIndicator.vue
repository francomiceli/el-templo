<template>
  <div class="journey-progress-indicator">
    <!-- Header -->
    <div class="indicator__header">
      <q-icon name="trending_up" size="28px" class="indicator__icon" />
      <h3 class="indicator__title">Tu Progreso</h3>
    </div>

    <!-- Journey Name & Total -->
    <div class="indicator__journey-name">{{ journeyName }}</div>
    <div class="indicator__total">
      {{ totalSessions }} {{ totalSessions === 1 ? 'sesion' : 'sesiones' }} completadas
    </div>

    <!-- Per-Duration Progress -->
    <div class="indicator__durations">
      <div
        v-for="item in durationItems"
        :key="item.duration"
        class="duration-row"
        :class="{ 'duration-row--active': item.duration === completedDuration }"
      >
        <div class="duration-row__time">
          <span class="duration-row__number">{{ item.duration }}</span>
          <span class="duration-row__unit">min</span>
        </div>
        <div class="duration-row__info">
          <div class="duration-row__label">Semana {{ item.semana }}</div>
          <q-linear-progress
            :value="item.semana / 21"
            color="secondary"
            track-color="grey-3"
            size="6px"
            rounded
            class="q-mt-xs"
          />
        </div>
        <q-icon
          v-if="item.duration === completedDuration"
          name="check_circle"
          size="20px"
          class="duration-row__check"
        />
      </div>
    </div>

    <!-- Continue Button -->
    <q-btn
      unelevated
      color="primary"
      label="Continuar"
      class="full-width indicator__continue-btn"
      size="lg"
      @click="$emit('continue')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { JourneyDuration, JourneyProgress } from '../types'

interface Props {
  /** Journey display name */
  journeyName: string
  /** Current journey progress with per-duration semana */
  progress: JourneyProgress
  /** Duration that was just completed */
  completedDuration: JourneyDuration
}

interface Emits {
  (e: 'continue'): void
}

const props = defineProps<Props>()
defineEmits<Emits>()

const durationItems = computed(() => [
  { duration: 20 as const, semana: props.progress.semana20 },
  { duration: 40 as const, semana: props.progress.semana40 },
  { duration: 60 as const, semana: props.progress.semana60 },
])

const totalSessions = computed(() => {
  return props.progress.semana20 + props.progress.semana40 + props.progress.semana60 - 3
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.journey-progress-indicator {
  background: #f5f2eb;
  padding: 24px 20px;
  max-width: 500px;
  margin: 0 auto;
}

.indicator__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.indicator__icon {
  color: #c27a5d;
}

.indicator__title {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.3rem;
  font-weight: 400;
  color: #2a2a2a;
  margin: 0;
}

.indicator__journey-name {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.1rem;
  color: #4a4a4a;
  margin-bottom: 4px;
}

.indicator__total {
  font-size: 0.85rem;
  color: #6b6b6b;
  margin-bottom: 20px;
}

.indicator__durations {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.duration-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  background: #e6e2d6;
  transition: background 0.2s;
}

.duration-row--active {
  background: rgba(194, 122, 93, 0.15);
  border-left: 3px solid #c27a5d;
}

.duration-row__time {
  display: flex;
  align-items: baseline;
  gap: 2px;
  min-width: 52px;
}

.duration-row__number {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.3rem;
  font-weight: 400;
  color: #c27a5d;
  line-height: 1;
}

.duration-row__unit {
  font-size: 0.75rem;
  color: #8a8a8a;
}

.duration-row__info {
  flex: 1;
}

.duration-row__label {
  font-size: 0.9rem;
  font-weight: 500;
  color: #2a2a2a;
}

.duration-row__check {
  color: #c27a5d;
}

.indicator__continue-btn {
  margin-top: 8px;
}
</style>
