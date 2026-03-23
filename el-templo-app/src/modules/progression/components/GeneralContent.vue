<template>
  <div class="general-content">
    <!-- Reserve Class CTA (non-virtual branch members only) -->
    <q-card
      v-if="showReservaCta"
      class="general-content__reserva-card"
      flat
      bordered
      clickable
      @click="$router.push('/reservas')"
    >
      <q-card-section class="general-content__reserva-content">
        <div class="general-content__reserva-info">
          <q-icon name="event_available" color="primary" size="36px" />
          <div>
            <p class="general-content__reserva-title">Reserva tu clase</p>
            <p class="general-content__reserva-subtitle">
              Asegura tu lugar en el horario que prefieras
            </p>
          </div>
        </div>
        <q-icon name="chevron_right" color="primary" size="24px" />
      </q-card-section>
    </q-card>

    <!-- Today's Training CTA -->
    <q-card class="general-content__today-card" flat bordered>
      <q-card-section class="general-content__today-content">
        <div class="general-content__today-info">
          <q-icon
            :name="todayCompleted ? 'check_circle' : 'fitness_center'"
            :color="todayCompleted ? 'positive' : 'secondary'"
            size="40px"
          />
          <div class="general-content__today-text">
            <p class="general-content__today-title">
              {{ todayCompleted ? 'Sesion Completada' : 'Tu Sesion de Hoy' }}
            </p>
            <p v-if="!todayCompleted" class="general-content__today-subtitle">
              Lista para comenzar
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
        <q-btn
          v-if="!todayCompleted"
          color="primary"
          text-color="white"
          unelevated
          no-caps
          label="Entrenar"
          icon-right="arrow_forward"
          to="/training"
        />
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

  &__reserva-card {
    background-color: white;
    border-color: rgba($primary, 0.2);
    border-radius: 12px;
    cursor: pointer;
    transition: box-shadow 150ms ease;

    &:active {
      box-shadow: 0 0 0 2px rgba($primary, 0.2);
    }
  }

  &__reserva-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__reserva-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__reserva-title {
    font-family: 'Montserrat', sans-serif;
    font-size: 15px;
    font-weight: 600;
    color: $primary;
    margin: 0;
  }

  &__reserva-subtitle {
    font-size: 12px;
    color: rgba($primary, 0.6);
    margin: 0;
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
    font-family: 'Montserrat', sans-serif;
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
