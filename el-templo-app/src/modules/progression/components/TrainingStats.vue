<template>
  <div class="training-stats">
    <div class="row q-col-gutter-sm">
      <!-- Total Sessions -->
      <div class="col-6">
        <q-card class="stat-card" flat bordered>
          <q-card-section class="stat-card__content">
            <q-icon name="img:/icons/entrenar.svg" class="stat-card__icon" />
            <div class="stat-card__value">{{ stats.totalSessions }}</div>
            <div class="stat-card__label">Sesiones Totales</div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Days Trained -->
      <div class="col-6">
        <q-card class="stat-card" flat bordered>
          <q-card-section class="stat-card__content">
            <q-icon name="calendar_today" class="stat-card__icon" />
            <div class="stat-card__value">{{ stats.totalDaysTrained }}</div>
            <div class="stat-card__label">Dias Entrenados</div>
          </q-card-section>
        </q-card>
      </div>

      <!-- This Week -->
      <div class="col-6">
        <q-card class="stat-card" flat bordered>
          <q-card-section class="stat-card__content">
            <q-icon name="date_range" class="stat-card__icon" />
            <div class="stat-card__value">{{ stats.sessionsThisWeek }}</div>
            <div class="stat-card__label">Esta Semana</div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Current Streak -->
      <div class="col-6">
        <q-card class="stat-card" flat bordered>
          <q-card-section class="stat-card__content">
            <q-icon name="local_fire_department" class="stat-card__icon" />
            <div class="stat-card__value">{{ stats.currentStreak }}</div>
            <div class="stat-card__label">Racha Actual</div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * TrainingStats component
 *
 * Displays a 2x2 grid of stat cards showing:
 * - Total Sessions
 * - Days Trained
 * - This Week
 * - Current Streak
 *
 * Uses Quasar grid for responsive layout.
 */
import type { ProgressionStats } from '../types'

interface Props {
  /** Statistics data from progression API */
  stats: ProgressionStats
}

defineProps<Props>()
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.training-stats {
  padding: 8px 0;
}

.stat-card {
  background-color: $cream !important;
  border-color: rgba($secondary, 0.3) !important;
  border-radius: 12px;

  &__content {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 16px 12px;
  }

  &__icon {
    font-size: 28px;
    color: $secondary;
    margin-bottom: 8px;
  }

  &__value {
    font-family: 'Montserrat', sans-serif;
    font-size: 28px;
    font-weight: 700;
    color: $primary;
    line-height: 1;
    margin-bottom: 4px;
  }

  &__label {
    font-size: 12px;
    font-weight: 500;
    color: rgba($primary, 0.7);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
}
</style>
