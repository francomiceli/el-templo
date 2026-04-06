<template>
  <div class="goal-plan-progress-indicator">
    <!-- Header -->
    <div class="indicator__header">
      <q-icon name="trending_up" size="28px" class="indicator__icon" />
      <h3 class="indicator__title">Tu Progreso</h3>
    </div>

    <!-- Goal Plan Name -->
    <div class="indicator__goal-plan-name">{{ goalPlanName }}</div>
    <div class="indicator__since">Activo desde {{ formatDate(progress.startedAt) }}</div>

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
import type { GoalPlanProgress } from '../types'
import { formatDate } from 'src/utils/format-date'

interface Props {
  /** Goal plan display name */
  goalPlanName: string
  /** Current goal plan progress */
  progress: GoalPlanProgress
}

interface Emits {
  (e: 'continue'): void
}

defineProps<Props>()
defineEmits<Emits>()
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.goal-plan-progress-indicator {
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

.indicator__goal-plan-name {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.1rem;
  color: #4a4a4a;
  margin-bottom: 4px;
}

.indicator__since {
  font-size: 0.85rem;
  color: #6b6b6b;
  margin-bottom: 20px;
}

.indicator__continue-btn {
  margin-top: 8px;
}
</style>
