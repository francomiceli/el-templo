<template>
  <div class="week-header">
    <span class="week-header__label">{{ weekRangeLabel(monday) }}</span>
    <span class="week-header__arrows">
      <button
        type="button"
        class="week-header__arrow"
        aria-label="Semana anterior"
        :disabled="!canPrev"
        @click="emit('prev')"
      >
        <q-icon name="chevron_left" size="22px" />
      </button>
      <button
        type="button"
        class="week-header__arrow"
        aria-label="Semana siguiente"
        :disabled="!canNext"
        @click="emit('next')"
      >
        <q-icon name="chevron_right" size="22px" />
      </button>
    </span>
  </div>
</template>

<script setup lang="ts">
import { weekRangeLabel } from '../../utils/weekLabels'

// Fase 197 D-03: rótulo "12 AL 18 DE OCTUBRE" con flechas de hitbox 44 que no suman alto
// (alto del bloque 24 + 8 de padding inferior, botones de 44 con margen vertical -10).
defineProps<{
  /** Lunes de la semana que se ve ("YYYY-MM-DD") */
  monday: string
  canPrev: boolean
  canNext: boolean
}>()

const emit = defineEmits<{
  prev: []
  next: []
}>()
</script>

<style scoped lang="scss">
@import 'src/css/brand';
@import 'src/css/premium-card';

.week-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  // 24 de contenido + 8 de aire debajo del rótulo (box-sizing: border-box)
  height: 32px;
  padding-bottom: 8px;

  &__label {
    @include pd-label-11;
  }

  &__arrows {
    display: flex;
    margin-right: -12px;
  }

  &__arrow {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    margin: -10px 0;
    padding: 0;
    border: 0;
    background: none;
    color: $pd-ink;
    cursor: pointer;

    &:disabled {
      color: $pd-light-edge;
      cursor: default;
    }

    &:focus-visible {
      outline: 2px solid $pd-terra-ink;
      outline-offset: -4px;
      border-radius: 12px;
    }
  }
}
</style>
