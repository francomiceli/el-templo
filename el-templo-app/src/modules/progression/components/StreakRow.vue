<template>
  <div class="streak-row">
    <q-icon name="local_fire_department" class="streak-row__icon" />
    <span class="streak-row__text">{{ streak }} {{ streak === 1 ? 'día' : 'días' }} de racha</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  streak: number
}>()
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.streak-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background-color: rgba($primary, 0.08);

  &__icon {
    font-size: 20px;
    color: #ff6b35;
  }

  &__text {
    font-size: 14px;
    font-weight: 600;
    color: rgba($accent, 0.85);
  }
}
</style>
