<template>
  <div class="evaluation-request">
    <!-- Not Eligible State -->
    <div v-if="!eligible && !pending" class="evaluation-request__row">
      <q-icon name="schedule" class="evaluation-request__icon" />
      <div class="evaluation-request__content">
        <p class="evaluation-request__message">
          Mantené un RPE promedio de 6 o menos durante 2 semanas para solicitar una evaluacion de
          nivel.
        </p>
        <div v-if="averageRpe !== null" class="evaluation-request__rpe">
          RPE Promedio: <strong>{{ averageRpe.toFixed(1) }}</strong>
        </div>
      </div>
    </div>

    <!-- Eligible State -->
    <div v-else-if="eligible && !pending" class="evaluation-request__row">
      <q-icon
        name="emoji_events"
        class="evaluation-request__icon evaluation-request__icon--success"
      />
      <div class="evaluation-request__content">
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
    </div>

    <!-- Pending State -->
    <div v-else class="evaluation-request__row">
      <q-icon name="schedule" class="evaluation-request__icon evaluation-request__icon--pending" />
      <div class="evaluation-request__content">
        <p class="evaluation-request__message evaluation-request__message--pending">
          Solicitud Pendiente
        </p>
        <p class="evaluation-request__submessage">Tu coach revisara tu progreso pronto.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  eligible: boolean
  pending: boolean
  averageRpe: number | null
}

defineProps<Props>()

defineEmits<{
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

  &__row {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  &__icon {
    font-size: 40px;
    color: rgba($primary, 0.4);
    flex-shrink: 0;

    &--success {
      color: $secondary;
    }

    &--pending {
      color: $secondary;
    }
  }

  &__content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__message {
    font-size: 14px;
    color: rgba($primary, 0.8);
    margin: 0;
    line-height: 1.5;

    &--success {
      font-family: 'Montserrat', sans-serif;
      font-size: 16px;
      font-weight: 600;
      color: $primary;
    }

    &--pending {
      font-family: 'Montserrat', sans-serif;
      font-size: 15px;
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
    padding: 4px 10px;
    border-radius: 16px;
    align-self: flex-start;

    strong {
      color: $primary;
      font-weight: 600;
    }
  }

  &__btn {
    font-family: 'Montserrat', sans-serif;
    letter-spacing: 0.05em;
    font-weight: 500;
    padding: 8px 20px;
    align-self: flex-start;
  }
}
</style>
