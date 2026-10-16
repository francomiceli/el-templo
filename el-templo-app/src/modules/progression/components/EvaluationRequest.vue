<template>
  <section class="evaluation-request">
    <!-- Solicitud pendiente (tiene precedencia, igual que antes) -->
    <template v-if="pending">
      <h3 class="evaluation-request__title">Solicitud pendiente</h3>
      <p class="evaluation-request__text">Tu coach va a revisar tu progreso pronto.</p>
    </template>

    <!-- Listo para evaluación -->
    <template v-else-if="eligible">
      <h3 class="evaluation-request__title">Listo para evaluación</h3>
      <button type="button" class="evaluation-request__btn" @click="$emit('request')">
        Solicitar evaluación
      </button>
    </template>
  </section>
</template>

<script setup lang="ts">
interface Props {
  eligible: boolean
  pending: boolean
}

defineProps<Props>()

defineEmits<{
  (e: 'request'): void
}>()
</script>

<style scoped lang="scss">
.evaluation-request {
  padding: 16px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(44, 35, 24, 0.06);

  &__title {
    margin: 0;
    font-family: 'Montserrat', sans-serif;
    font-size: 15px;
    font-weight: 700;
    color: #2c2318;
  }

  &__text {
    margin: 4px 0 0;
    font-size: 14px;
    line-height: 1.4;
    color: #6b6459;
  }

  &__btn {
    height: 48px;
    margin-top: 12px;
    padding: 0 20px;
    border: 0;
    border-radius: 12px;
    background: #96593a;
    color: #fff;
    font-family: 'Geologica', sans-serif;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
}
</style>
