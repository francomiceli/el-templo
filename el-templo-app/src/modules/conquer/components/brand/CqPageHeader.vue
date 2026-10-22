<template>
  <div class="cq-page-header">
    <div class="cq-page-header__row">
      <router-link v-if="backTo" :to="backTo" class="cq-page-header__back" :aria-label="backLabel">
        <span aria-hidden="true">‹</span>
      </router-link>
      <button
        v-else
        type="button"
        class="cq-page-header__back"
        :aria-label="backLabel"
        @click="emit('back')"
      >
        <span aria-hidden="true">‹</span>
      </button>
      <div class="cq-page-header__text">
        <h2 class="cq-display cq-page-header__title">{{ title }}</h2>
        <div v-if="subtitle" class="cq-ital cq-page-header__subtitle">{{ subtitle }}</div>
      </div>
    </div>
    <div class="cq-meander" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

// Fase 201 D-09: cabecera de las pantallas interiores (prototipo `head`): botón atrás de 44 px,
// título en Cormorant, subtítulo en cursiva y meandro dorado. Con `backTo` el botón es un enlace a
// esa ruta; sin él emite `back` (para volver entre pantallas que no son rutas).
withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    backTo?: RouteLocationRaw
    backLabel?: string
  }>(),
  { subtitle: '', backTo: undefined, backLabel: 'Volver' },
)

const emit = defineEmits<{ back: [] }>()
</script>

<style scoped lang="scss">
.cq-page-header {
  display: flex;
  flex-direction: column;
  gap: 16px;

  &__row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
  }

  &__back {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    margin-left: -12px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--cq-gold-hi);
    font-family: var(--cq-display);
    font-size: 30px;
    line-height: 1;
    text-decoration: none;
    cursor: pointer;
  }

  &__title {
    font-size: 25px;
  }

  &__subtitle {
    margin-top: 3px;
  }
}
</style>
