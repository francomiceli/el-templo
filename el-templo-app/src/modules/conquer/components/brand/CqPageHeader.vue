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
        <h2 class="cq-title">{{ title }}</h2>
        <p v-if="subtitle" class="cq-sub cq-page-header__subtitle">{{ subtitle }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

// Fase 201 DA-16: cabecera de las pantallas interiores (sketch 022 B `.pghead`): botón atrás de
// 44 px en azul noche, título `.cq-title` y subtítulo `.cq-sub`, sin meandro. Con `backTo` el botón
// es un enlace a esa ruta; sin él emite `back` (para volver entre pantallas que no son rutas).
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
    gap: 6px;
    min-width: 0;
  }

  &__back {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    margin-left: -12px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--cq-night);
    font-size: 28px;
    line-height: 1;
    text-decoration: none;
    cursor: pointer;
  }

  &__text {
    min-width: 0;
  }

  &__subtitle {
    margin-top: 2px;
  }
}
</style>
