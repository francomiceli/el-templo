<template>
  <div class="evaluation-request">
    <!-- Not Eligible State -->
    <div
      v-if="!eligible && !pending"
      class="evaluation-request__state evaluation-request__state--not-eligible"
    >
      <q-icon name="schedule" class="evaluation-request__icon" />
      <p class="evaluation-request__message">
        Mantiene un RPE promedio de 6 o menos durante 2 semanas para solicitar una evaluacion de
        nivel.
      </p>
      <div v-if="averageRpe !== null" class="evaluation-request__rpe">
        RPE Promedio: <strong>{{ averageRpe.toFixed(1) }}</strong>
      </div>
    </div>

    <!-- Eligible State -->
    <div
      v-else-if="eligible && !pending"
      class="evaluation-request__state evaluation-request__state--eligible"
    >
      <q-icon
        name="emoji_events"
        class="evaluation-request__icon evaluation-request__icon--success"
      />
      <p class="evaluation-request__message evaluation-request__message--success">
        Listo para Evaluacion
      </p>
      <q-btn
        class="evaluation-request__btn"
        color="primary"
        unelevated
        no-caps
        @click="$emit('request')"
      >
        Solicitar Evaluacion
      </q-btn>
    </div>

    <!-- Pending State -->
    <div v-else class="evaluation-request__state evaluation-request__state--pending">
      <q-icon name="schedule" class="evaluation-request__icon evaluation-request__icon--pending" />
      <p class="evaluation-request__message evaluation-request__message--pending">
        Solicitud Pendiente
      </p>
      <p class="evaluation-request__submessage">Tu coach revisara tu progreso pronto.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * EvaluationRequest component
 *
 * Displays evaluation eligibility status and request button.
 * States:
 * 1. Not eligible: Shows requirements message with current RPE
 * 2. Eligible: Shows success message with request button
 * 3. Pending: Shows pending message with clock icon
 */

interface Props {
  /** Whether member is eligible to request evaluation */
  eligible: boolean
  /** Whether member has a pending evaluation request */
  pending: boolean
  /** Average RPE for last 2 weeks (null if insufficient data) */
  averageRpe: number | null
}

defineProps<Props>()

defineEmits<{
  /** Emitted when user clicks the request button */
  (e: 'request'): void
}>()
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.evaluation-request {
  padding: 16px;
  background-color: $cream;
  border-radius: 12px;
  border: 1px solid rgba($secondary, 0.2);

  &__state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 12px;
  }

  &__icon {
    font-size: 48px;
    color: rgba($primary, 0.4);

    &--success {
      color: $secondary;
    }

    &--pending {
      color: $secondary;
    }
  }

  &__message {
    font-size: 14px;
    color: rgba($primary, 0.8);
    margin: 0;
    line-height: 1.5;
    max-width: 280px;

    &--success {
      font-family: 'Montserrat', sans-serif;
      font-size: 18px;
      font-weight: 600;
      color: $primary;
    }

    &--pending {
      font-family: 'Montserrat', sans-serif;
      font-size: 16px;
      font-weight: 500;
      color: $secondary;
    }
  }

  &__submessage {
    font-size: 13px;
    color: rgba($primary, 0.6);
    margin: 0;
  }

  &__rpe {
    font-size: 13px;
    color: rgba($primary, 0.7);
    background: rgba($secondary, 0.1);
    padding: 6px 12px;
    border-radius: 16px;

    strong {
      color: $primary;
      font-weight: 600;
    }
  }

  &__btn {
    font-family: 'Montserrat', sans-serif;
    letter-spacing: 0.05em;
    font-weight: 500;
    padding: 10px 24px;
  }
}
</style>
