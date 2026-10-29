<!-- "Cómo funciona" de Mis invitados (2026-10-29): las condiciones del programa con los números de
     la configuración (los arma `conditionGroups`). Una card con un bloque plegable por tema, cerrados
     por defecto (pedido de Franco: que no ocupe tanta pantalla), con el mismo patrón que la nota de
     reglas de Reservas: <details> da el botón accesible (teclado, aria-expanded implícito) sin JS.
     Componente aparte porque la página lo ubica en dos lugares: arriba si todavía no invitaste a
     nadie, al final si ya tenés invitados. -->
<template>
  <section class="rules-section" aria-labelledby="como-funciona">
    <h2 id="como-funciona" class="rules-section__title">Cómo funciona</h2>
    <div class="rules">
      <details v-for="group in groups" :key="group.title" class="rules__group">
        <summary class="rules__summary">
          <q-icon :name="group.icon" size="20px" class="rules__icon" aria-hidden="true" />
          <span class="rules__title">{{ group.title }}</span>
          <q-icon name="expand_more" size="22px" class="rules__chevron" aria-hidden="true" />
        </summary>
        <ul class="rules__list">
          <li v-for="item in group.items" :key="item" class="rules__item">{{ item }}</li>
        </ul>
      </details>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ConditionGroup } from 'src/utils/invitation-conditions'

defineProps<{ groups: ConditionGroup[] }>()
</script>

<style scoped lang="scss">
@import 'src/css/brand';
@import 'src/css/premium-card';

// Mismo lenguaje que las secciones de la página (título en tinta, card blanca con borde cálido).
.rules-section {
  display: flex;
  flex-direction: column;
  gap: 8px; // título → card

  &__title {
    @include mt-block-title;
    margin: 0;
    color: $pd-ink;
  }
}

.rules {
  @include pd-surface-light;
  overflow: hidden;

  &__group + &__group {
    border-top: 1px solid $pd-light-line;
  }

  &__summary {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 52px;
    padding: 10px 16px;
    cursor: pointer;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    &:focus-visible {
      outline: 2px solid $pd-terra-ink;
      outline-offset: -2px;
    }
  }

  &__icon {
    flex: none;
    color: $pd-terra-ink;
  }

  &__title {
    flex: 1;
    min-width: 0;
    font-family: 'Montserrat', sans-serif;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.3;
    color: $pd-ink;
  }

  &__chevron {
    flex: none;
    color: $pd-ink-2;
    transition: transform 0.2s ease;
  }

  &__group[open] &__chevron {
    transform: rotate(180deg);
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0 16px 16px;
    list-style: none;
  }

  // Viñeta terracota alineada con el ícono del título.
  &__item {
    position: relative;
    padding-left: 32px;
    font-family: 'Geologica', sans-serif;
    font-size: 14px;
    line-height: 1.45;
    color: $pd-ink;

    &::before {
      content: '';
      position: absolute;
      left: 7px;
      top: 0.6em;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: $pd-terra-ink;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .rules__chevron {
    transition: none;
  }
}
</style>
