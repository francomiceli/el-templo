<template>
  <!-- D-09: sin gráfico de esfuerzo. La evaluación de nivel aparece solo si es accionable
       ("Listo para evaluación") o está en curso ("Solicitud pendiente"); si no, no renderiza nada. -->
  <EvaluationRequest
    v-if="evaluation && (evaluation.eligible || evaluation.pendingRequest)"
    :eligible="evaluation.eligible"
    :pending="evaluation.pendingRequest"
    class="general-content__evaluation"
    @request="$emit('requestEvaluation')"
  />
</template>

<script setup lang="ts">
import EvaluationRequest from './EvaluationRequest.vue'
import type { EvaluationStatus } from '../types'

defineProps<{
  evaluation: EvaluationStatus | null
}>()

defineEmits<{
  requestEvaluation: []
}>()
</script>
