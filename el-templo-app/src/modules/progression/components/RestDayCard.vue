<template>
  <q-card class="rest-day-card" flat bordered>
    <q-card-section class="rest-day-card__body">
      <div class="rest-day-card__header">
        <q-icon name="self_improvement" size="32px" color="info" />
        <p class="rest-day-card__title">Hoy es dia de descanso</p>
      </div>
      <p class="rest-day-card__tip">{{ todayTip }}</p>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const REST_TIPS = [
  'Estira 10 minutos hoy. Tu cuerpo te lo agradece mañana.',
  'Hidratáte bien y descansa. La recuperación es parte del entrenamiento.',
  'Camina 20 minutos. El movimiento suave ayuda a recuperar.',
  'Hoy es un buen día para trabajar movilidad de hombros.',
  'Dormi bien esta noche. El músculo crece cuando descansas.',
  'Probá 5 minutos de respiración profunda. Calma el sistema nervioso.',
]

const todayTip = computed(() => {
  const dayIndex = Math.floor(Date.now() / 86400000) % REST_TIPS.length
  return REST_TIPS[dayIndex]
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.rest-day-card {
  background-color: white;
  border-color: rgba($info, 0.3);
  border-radius: 12px;

  &__body {
    padding: 16px;
  }

  &__header {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__title {
    font-family: 'Montserrat', sans-serif;
    font-size: 16px;
    font-weight: 700;
    color: $info;
    margin: 0;
  }

  &__tip {
    font-family: 'Geologica', sans-serif;
    font-size: 14px;
    color: rgba($info, 0.8);
    margin: 8px 0 0;
  }
}
</style>
