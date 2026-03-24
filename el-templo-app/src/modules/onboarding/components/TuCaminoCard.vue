<template>
  <div class="tu-camino-card">
    <div class="tu-camino-card__title">Tu Camino</div>
    <div class="tu-camino-card__goal">
      <q-icon name="flag" size="16px" class="tu-camino-card__icon" />
      <span class="tu-camino-card__goal-text">Objetivo: {{ goalLabel }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  goalType: string
  goalLabel: string
}>()
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

$brand-terracotta: #c07a56;
$brand-aged-gold: #a0755a;

.tu-camino-card {
  background: linear-gradient(
    135deg,
    rgba($brand-terracotta, 0.08),
    rgba($brand-aged-gold, 0.15)
  );
  border-left: 3px solid $primary;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;

  &__title {
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 16px;
    color: $primary;
    margin-bottom: 8px;
  }

  &__goal {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__icon {
    color: $primary;
  }

  &__goal-text {
    font-size: 14px;
    color: rgba($primary, 0.8);
  }
}
</style>
