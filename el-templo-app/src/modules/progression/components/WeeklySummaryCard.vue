<template>
  <q-card class="stats-card" flat bordered>
    <q-card-section class="stats-card__body">
      <!-- Loading state -->
      <div v-if="loading" class="stats-card__loading">
        <q-skeleton type="text" />
        <q-skeleton type="text" />
      </div>

      <!-- Error state -->
      <p v-else-if="error" class="stats-card__error">
        No pudimos cargar tus datos
      </p>

      <!-- Data state -->
      <div v-else class="stats-card__stats">
        <div class="stats-card__stat">
          <div class="stats-card__stat-row">
            <q-icon name="fitness_center" class="stats-card__icon" />
            <span class="stats-card__stat-value">{{ totalSessions }}</span>
          </div>
          <span class="stats-card__stat-label">Sesiones totales</span>
        </div>
        <div class="stats-card__divider" />
        <div class="stats-card__stat">
          <div class="stats-card__stat-row">
            <q-icon name="date_range" class="stats-card__icon" />
            <span class="stats-card__stat-value">{{ summary?.sessionsCompleted ?? 0 }}</span>
          </div>
          <span class="stats-card__stat-label">Esta semana</span>
        </div>
        <div class="stats-card__divider" />
        <div class="stats-card__stat">
          <div class="stats-card__stat-row">
            <q-icon name="speed" class="stats-card__icon" />
            <span class="stats-card__stat-value">{{ summary?.averageRpe ?? '--' }}</span>
          </div>
          <span class="stats-card__stat-label">RPE prom</span>
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import type { WeeklySummary } from '../types'

defineProps<{
  loading: boolean
  error: string | null
  summary: WeeklySummary | null
  totalSessions: number
}>()
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.stats-card {
  background-color: white;
  border-color: rgba($primary, 0.2);
  border-radius: 12px;

  &__body {
    padding: 16px;
  }

  &__loading {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__error {
    font-family: 'Geologica', sans-serif;
    font-size: 14px;
    color: rgba($primary, 0.5);
    text-align: center;
    margin: 0;
  }

  &__stats {
    display: flex;
    justify-content: space-around;
    align-items: center;
  }

  &__stat {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  &__stat-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__icon {
    font-size: 20px;
    color: rgba($primary, 0.5);
  }

  &__stat-value {
    font-family: 'Montserrat', sans-serif;
    font-size: 18px;
    font-weight: 700;
    color: $primary;
  }

  &__stat-label {
    font-family: 'Geologica', sans-serif;
    font-size: 12px;
    color: rgba($primary, 0.7);
    margin-top: 4px;
  }

  &__divider {
    width: 1px;
    height: 32px;
    background: rgba($primary, 0.15);
  }
}
</style>
