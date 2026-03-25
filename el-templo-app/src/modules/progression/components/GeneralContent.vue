<template>
  <div class="general-content">
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
import RpeTrendChart from './RpeTrendChart.vue'
import EvaluationRequest from './EvaluationRequest.vue'
import type { RpeTrend, EvaluationStatus } from '../types'

const props = defineProps<{
  rpeTrend: RpeTrend | null
  evaluation: EvaluationStatus | null
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
