<template>
  <q-card class="upsell-badge" flat bordered>
    <q-card-section class="upsell-badge__body">
      <div class="upsell-badge__header">
        <q-icon name="local_fire_department" size="28px" class="upsell-badge__icon" />
        <div>
          <p class="upsell-badge__title">Llevalo al siguiente nivel</p>
          <p class="upsell-badge__text">
            Visitá nuestras sedes y entrená junto a nuestros entrenadores. Tu cuerpo te lo va a
            agradecer.
          </p>
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
// No props needed -- always shown for promo/online users
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.upsell-badge {
  background: linear-gradient(135deg, rgba($primary, 0.08) 0%, rgba(#d4a843, 0.05) 100%);
  border-color: rgba($primary, 0.25);
  border-radius: 12px;

  &__body {
    padding: 16px;
  }

  &__header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  &__icon {
    color: $primary;
    flex-shrink: 0;
    margin-top: 2px;
  }

  &__title {
    font-family: 'Montserrat', sans-serif;
    font-size: 15px;
    font-weight: 700;
    color: $primary;
    margin: 0 0 4px;
  }

  &__text {
    font-family: 'Geologica', sans-serif;
    font-size: 13px;
    color: #666;
    margin: 0;
    line-height: 1.4;
  }
}
</style>
