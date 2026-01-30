<template>
  <q-page class="mi-camino">
    <!-- Loading State -->
    <div v-if="progressionStore.loading" class="mi-camino__loading">
      <q-spinner color="primary" size="60px" />
      <p class="mi-camino__loading-text">Cargando tu progreso...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="progressionStore.error" class="mi-camino__error">
      <q-icon name="error_outline" class="mi-camino__error-icon" />
      <p class="mi-camino__error-text">{{ progressionStore.error }}</p>
      <q-btn color="primary" unelevated no-caps @click="fetchStats">
        Reintentar
      </q-btn>
    </div>

    <!-- Empty State (new user with no sessions) -->
    <div v-else-if="isEmptyState" class="mi-camino__empty">
      <q-icon name="directions_run" class="mi-camino__empty-icon" />
      <p class="mi-camino__empty-title">Comienza Tu Camino</p>
      <p class="mi-camino__empty-text">
        Completa tu primera sesion de entrenamiento para ver tu progreso aqui.
      </p>
      <q-btn color="primary" unelevated no-caps to="/training">
        Ir a Entrenar
      </q-btn>
    </div>

    <!-- Content State -->
    <div v-else class="mi-camino__content">
      <!-- Welcome Header -->
      <div class="mi-camino__welcome">
        <div class="mi-camino__welcome-text">
          <p class="mi-camino__greeting">Bienvenido,</p>
          <h1 class="mi-camino__name">{{ userName }}</h1>
          <p class="mi-camino__date">{{ todayFormatted }}</p>
        </div>
        <LevelDisplay v-if="progressionStore.level" :greek-letter="progressionStore.level.greekLetter"
          :level-name="progressionStore.level.displayName" class="mi-camino__level-badge" />
      </div>

      <!-- Today's Training CTA -->
      <q-card class="mi-camino__today-card" flat bordered>
        <q-card-section class="mi-camino__today-content">
          <div class="mi-camino__today-info">
            <q-icon :name="todayCompleted ? 'check_circle' : 'fitness_center'"
              :color="todayCompleted ? 'positive' : 'secondary'" size="40px" />
            <div class="mi-camino__today-text">
              <p class="mi-camino__today-title">
                {{ todayCompleted ? 'Sesion Completada' : 'Tu Sesion de Hoy' }}
              </p>
              <p v-if="!todayCompleted" class="mi-camino__today-subtitle">
                Lista para comenzar
              </p>
              <!-- Session summary when completed -->
              <div v-else class="mi-camino__session-summary">
                <span v-if="progressionStore.todaySession?.durationMinutes" class="mi-camino__summary-item">
                  <q-icon name="timer" size="14px" />
                  {{ progressionStore.todaySession.durationMinutes }} min
                </span>
                <span v-if="progressionStore.todaySession?.rpe" class="mi-camino__summary-item">
                  <q-icon name="speed" size="14px" />
                  RPE {{ progressionStore.todaySession.rpe }}
                </span>
                <span v-if="progressionStore.todaySession?.notes"
                  class="mi-camino__summary-item mi-camino__summary-notes">
                  <q-icon name="notes" size="14px" />
                  {{ progressionStore.todaySession.notes }}
                </span>
              </div>
            </div>
          </div>
          <q-btn v-if="!todayCompleted" color="secondary" text-color="primary" unelevated no-caps label="Entrenar"
            icon-right="arrow_forward" to="/training" />
        </q-card-section>
      </q-card>

      <!-- Training Stats (4 cards in grid) -->
      <TrainingStats v-if="progressionStore.stats" :stats="progressionStore.stats" class="mi-camino__stats" />

      <!-- RPE Trend Chart in a Card (only shown if user has submitted RPE) -->
      <q-card v-if="hasRpeData" class="mi-camino__chart-card" flat bordered>
        <q-card-section>
          <div class="mi-camino__chart-header">
            <h3 class="mi-camino__chart-title">Tendencia de Esfuerzo</h3>
            <div class="mi-camino__chart-average">
              Promedio: <strong>{{ progressionStore.rpeTrend?.averageRpe.toFixed(1) }}</strong>
            </div>
          </div>
          <RpeTrendChart :labels="progressionStore.rpeTrend?.labels ?? []" :data="progressionStore.rpeTrend?.data ?? []" />
        </q-card-section>
      </q-card>

      <!-- Evaluation Request (bottom) -->
      <EvaluationRequest v-if="progressionStore.evaluation" :eligible="progressionStore.evaluation.eligible"
        :pending="progressionStore.evaluation.pendingRequest"
        :average-rpe="progressionStore.evaluation.averageRpeLast2Weeks" class="mi-camino__evaluation"
        @request="handleRequestEvaluation" />
    </div>
  </q-page>
</template>

<script setup lang="ts">
/**
 * MiCamino page
 *
 * Main progression tracking page showing:
 * - Current level with Greek letter display
 * - Training statistics (sessions, days, streak)
 * - RPE trend chart with average
 * - Evaluation request status and button
 *
 * Fetches progression data on mount and handles loading/error/empty states.
 */
import { computed, onMounted } from 'vue';
import { useProgressionStore } from '../stores/progressionStore';
import { useProgressionApi } from '../composables/useProgressionApi';
import { useUserStore } from 'src/stores/useUserStore';
import LevelDisplay from '../components/LevelDisplay.vue';
import TrainingStats from '../components/TrainingStats.vue';
import RpeTrendChart from '../components/RpeTrendChart.vue';
import EvaluationRequest from '../components/EvaluationRequest.vue';

const progressionStore = useProgressionStore();
const userStore = useUserStore();
const { fetchStats, requestEvaluation } = useProgressionApi();

/**
 * User's display name
 */
const userName = computed(() => {
  return userStore.profile?.name || userStore.profile?.email?.split('@')[0] || 'Atleta';
});

/**
 * Today's date formatted in Spanish
 */
const todayFormatted = computed(() => {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  };
  const date = new Date().toLocaleDateString('es-ES', options);
  // Capitalize first letter
  return date.charAt(0).toUpperCase() + date.slice(1);
});

/**
 * Check if today's session is completed
 * Uses progressionStore.todaySession from API (more reliable than weekStore)
 */
const todayCompleted = computed(() => {
  return progressionStore.todaySession?.completed ?? false;
});

/**
 * Check if this is a new user with no training data
 */
const isEmptyState = computed(() => {
  // Empty if stats exist but show 0 sessions
  if (progressionStore.stats && progressionStore.stats.totalSessions === 0) {
    return true;
  }
  // Also empty if no data loaded at all (shouldn't happen normally)
  return !progressionStore.level && !progressionStore.stats && !progressionStore.error;
});

/**
 * Check if user has any RPE data to display the trend chart
 */
const hasRpeData = computed(() => {
  const data = progressionStore.rpeTrend?.data;
  if (!data || data.length === 0) return false;
  // Check if at least one RPE value is not null
  return data.some(rpe => rpe !== null);
});

/**
 * Handle evaluation request button click
 */
async function handleRequestEvaluation() {
  await requestEvaluation();
}

onMounted(() => {
  fetchStats();
});
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.mi-camino {
  padding: 16px;
  background-color: $cream;

  &__loading,
  &__error,
  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    text-align: center;
    padding: 24px;
  }

  &__loading-text {
    margin-top: 16px;
    font-size: 14px;
    color: rgba($primary, 0.7);
  }

  &__error-icon {
    font-size: 64px;
    color: $negative;
    margin-bottom: 16px;
  }

  &__error-text {
    font-size: 14px;
    color: rgba($primary, 0.8);
    margin-bottom: 16px;
  }

  &__empty-icon {
    font-size: 72px;
    color: $secondary;
    margin-bottom: 16px;
  }

  &__empty-title {
    font-family: 'Cinzel', serif;
    font-size: 20px;
    font-weight: 600;
    color: $primary;
    margin: 0 0 8px;
  }

  &__empty-text {
    font-size: 14px;
    color: rgba($primary, 0.7);
    margin: 0 0 20px;
    max-width: 280px;
    line-height: 1.5;
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__welcome {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
  }

  &__welcome-text {
    flex: 1;
  }

  &__greeting {
    font-size: 14px;
    color: rgba($primary, 0.6);
    margin: 0 0 2px;
  }

  &__name {
    font-family: 'Cinzel', serif;
    font-size: 24px;
    font-weight: 600;
    color: $primary;
    margin: 0 0 4px;
  }

  &__date {
    font-size: 13px;
    color: rgba($primary, 0.7);
    margin: 0;
  }

  &__level-badge {
    flex-shrink: 0;
    margin-left: 16px;
  }

  &__today-card {
    background-color: white;
    border-color: rgba($secondary, 0.3);
    border-radius: 12px;
  }

  &__today-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  &__today-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__today-text {
    display: flex;
    flex-direction: column;
  }

  &__today-title {
    font-family: 'Cinzel', serif;
    font-size: 15px;
    font-weight: 600;
    color: $primary;
    margin: 0;
  }

  &__today-subtitle {
    font-size: 13px;
    color: rgba($primary, 0.6);
    margin: 0;
  }

  &__session-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }

  &__summary-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: rgba($primary, 0.7);
    background: rgba($secondary, 0.1);
    padding: 2px 8px;
    border-radius: 10px;
  }

  &__summary-notes {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__level {
    margin-bottom: 8px;
  }

  &__chart-card {
    background-color: white;
    border-color: rgba($secondary, 0.2);
    border-radius: 12px;
  }

  &__chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  &__chart-title {
    font-family: 'Cinzel', serif;
    font-size: 16px;
    font-weight: 600;
    color: $primary;
    margin: 0;
  }

  &__chart-average {
    font-size: 13px;
    color: rgba($primary, 0.7);
    background: rgba($secondary, 0.1);
    padding: 4px 10px;
    border-radius: 12px;

    strong {
      color: $primary;
      font-weight: 600;
    }
  }
}
</style>
