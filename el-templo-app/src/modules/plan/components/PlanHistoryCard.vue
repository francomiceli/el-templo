<template>
  <!-- Sketch 028 D: card clara PLEGADA. Al expandirse muestra TODOS los planes anteriores (sin
       "Ver todos" ni hoja). Nunca muestra el monto pagado. -->
  <section v-if="items.length > 0" class="ph-card">
    <button
      type="button"
      class="ph-head"
      :aria-expanded="open"
      :aria-controls="listId"
      @click="open = !open"
    >
      <q-icon name="history" size="20px" class="ph-head__icon" aria-hidden="true" />
      <span class="ph-head__title">Planes anteriores ({{ items.length }})</span>
      <q-icon
        name="expand_more"
        size="24px"
        class="ph-head__chevron"
        :class="{ 'ph-head__chevron--open': open }"
        aria-hidden="true"
      />
    </button>

    <ul v-show="open" :id="listId" class="ph-list">
      <li v-for="item in rows" :key="item.id" class="ph-row">
        <span class="ph-row__name">{{ item.name }}</span>
        <span class="ph-row__range">{{ item.range }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatShortDateEs } from 'src/utils/short-date'
import type { PlanHistoryItem } from '../types'

const props = defineProps<{
  items: PlanHistoryItem[]
  /** Hoy en la sede ("YYYY-MM-DD"): decide cuándo las fechas llevan año. */
  today: string
}>()

const open = ref(false)
const listId = 'plan-history-list'

const rows = computed(() =>
  props.items.map((item) => ({
    id: item.id,
    name: item.planName,
    // Un solo día (ej. clase única): "9 jul", no "9 jul → 9 jul".
    range:
      item.endDate === null
        ? `Desde el ${formatShortDateEs(item.startDate, props.today)}`
        : item.endDate === item.startDate
          ? formatShortDateEs(item.startDate, props.today)
          : `${formatShortDateEs(item.startDate, props.today)} → ${formatShortDateEs(item.endDate, props.today)}`,
  })),
)
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.ph-card {
  @include pd-surface-light;
  overflow: hidden;
}

.ph-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  padding: 14px 16px;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  font-family: 'Geologica', sans-serif;
  font-weight: 600;
  font-size: 14px;
  color: $pd-ink;

  &__icon {
    color: $pd-terra-ink;
  }

  &__title {
    flex: 1;
  }

  &__chevron {
    color: $pd-ink-2;
    transition: transform 0.2s;

    &--open {
      transform: rotate(180deg);
    }

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }
}

.ph-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ph-row {
  position: relative;
  padding: 12px 16px 12px 52px;
  border-top: 1px solid $pd-light-line;

  // Puntito de la línea de tiempo (decorativo).
  &::before {
    content: '';
    position: absolute;
    left: 25px;
    top: 18px;
    width: 10px;
    height: 10px;
    box-sizing: border-box;
    border-radius: 50%;
    border: 2px solid $pd-light-edge;
    background: #fff;
  }

  &__name {
    display: block;
    font-family: 'Geologica', sans-serif;
    font-weight: 600;
    font-size: 14px;
    color: $pd-ink;
    overflow-wrap: anywhere;
  }

  &__range {
    display: block;
    margin-top: 2px;
    font-size: 13px;
    color: #6b6459;
  }
}
</style>
