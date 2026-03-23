<template>
  <div class="general-content">
    <!-- Reserve Class CTA (non-virtual branch members only) -->
    <q-card
      v-if="showReservaCta"
      class="general-content__cta-card"
      flat
      bordered
      clickable
      @click="$router.push('/reservas')"
    >
      <q-card-section class="general-content__cta-content">
        <div class="general-content__cta-info">
          <q-icon name="event_available" color="primary" size="32px" />
          <div>
            <p class="general-content__cta-title">
              <span class="general-content__cta-accent">Reservá</span> tu clase presencial
            </p>
            <p class="general-content__cta-subtitle">
              Asegurá tu lugar en el horario que prefieras
            </p>
          </div>
        </div>
        <div class="general-content__cta-arrow">
          <q-icon name="chevron_right" size="24px" />
        </div>
      </q-card-section>
    </q-card>

    <!-- Today's Training CTA -->
    <q-card
      class="general-content__cta-card"
      flat
      bordered
      clickable
      @click="$router.push('/training')"
    >
      <q-card-section class="general-content__cta-content">
        <div class="general-content__cta-info">
          <q-icon
            :name="todayCompleted ? 'check_circle' : 'fitness_center'"
            size="32px"
            :color="todayCompleted ? 'positive' : 'primary'"
          />
          <div class="general-content__today-text">
            <p class="general-content__cta-title">
              <template v-if="todayCompleted">Sesión Completada</template>
              <template v-else
                >Tu <span class="general-content__cta-accent">sesión</span> de hoy</template
              >
            </p>
            <p v-if="!todayCompleted" class="general-content__cta-subtitle">
              Podés entrenar desde donde quieras
            </p>
            <div v-else class="general-content__session-summary">
              <span v-if="todaySession?.durationMinutes" class="general-content__summary-item">
                <q-icon name="timer" size="14px" />
                {{ todaySession.durationMinutes }} min
              </span>
              <span v-if="todaySession?.rpe" class="general-content__summary-item">
                <q-icon name="speed" size="14px" />
                RPE {{ todaySession.rpe }}
              </span>
              <span
                v-if="todaySession?.notes"
                class="general-content__summary-item general-content__summary-notes"
              >
                <q-icon name="notes" size="14px" />
                {{ todaySession.notes }}
              </span>
            </div>
          </div>
        </div>
        <div class="general-content__cta-arrow">
          <q-icon name="chevron_right" size="24px" />
        </div>
      </q-card-section>
    </q-card>

    <!-- Training Stats -->
    <TrainingStats v-if="stats" :stats="stats" class="general-content__stats" />

    <!-- RPE Trend Chart -->
    <q-card v-if="hasRpeData" class="general-content__chart-card" flat bordered>
      <q-card-section>
        <div class="general-content__chart-header">
          <h3 class="general-content__chart-title">Tendencia de Esfuerzo</h3>
          <div class="general-content__chart-average">
            Promedio: <strong>{{ rpeTrend?.averageRpe.toFixed(1) }}</strong>
          </div>
        </div>
        <RpeTrendChart :labels="rpeTrend?.labels ?? []" :data="rpeTrend?.data ?? []" />
      </q-card-section>
    </q-card>

    <!-- Evaluation Request -->
    <EvaluationRequest
      v-if="evaluation"
      :eligible="evaluation.eligible"
      :pending="evaluation.pendingRequest"
      :average-rpe="evaluation.averageRpeLast2Weeks"
      class="general-content__evaluation"
      @request="$emit('requestEvaluation')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TrainingStats from './TrainingStats.vue'
import RpeTrendChart from './RpeTrendChart.vue'
import EvaluationRequest from './EvaluationRequest.vue'
import type { ProgressionStats, RpeTrend, EvaluationStatus, TodaySession } from '../types'

const props = defineProps<{
  todayCompleted: boolean
  todaySession: TodaySession | null
  stats: ProgressionStats | null
  rpeTrend: RpeTrend | null
  evaluation: EvaluationStatus | null
  showReservaCta: boolean
}>()

defineEmits<{
  requestEvaluation: []
}>()

const hasRpeData = computed(() => {
  const data = props.rpeTrend?.data
  if (!data || data.length === 0) return false
  return data.some((rpe) => rpe !== null)
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.general-content {
  display: flex;
  flex-direction: column;
  gap: 16px;

  &__cta-card {
    background-color: white;
    border-color: rgba($primary, 0.2);
    border-radius: 12px;
    cursor: pointer;
    transition: box-shadow 150ms ease;

    &:active {
      box-shadow: 0 0 0 2px rgba($primary, 0.2);
    }
  }

  &__cta-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  &__cta-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__cta-icon {
    color: $primary;
  }

  &__cta-title {
    font-family: 'Montserrat', sans-serif;
    font-size: 15px;
    font-weight: 500;
    color: $primary;
    margin: 0;
  }

  &__cta-accent {
    font-weight: 700;
  }

  &__cta-subtitle {
    font-size: 12px;
    color: rgba($primary, 0.6);
    margin: 0;
  }

  &__cta-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, $primary, darken($primary, 12%));
    color: white;
    flex-shrink: 0;
  }

  &__today-text {
    display: flex;
    flex-direction: column;
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
    font-family: 'Montserrat', sans-serif;
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
