<template>
  <div class="cq-days">
    <div class="cq-days__grid" role="group" aria-label="Día de la semana">
      <button
        v-for="day in plan"
        :key="day.dayKey"
        type="button"
        class="cq-days__btn"
        :aria-pressed="day.dayKey === selected"
        @click="emit('select', day.dayKey)"
      >
        <small>{{ day.done ? 'Hecho' : day.dayKey === nextDayKey ? 'Te toca' : '' }}</small>
        {{ day.label }}
      </button>
    </div>
    <div v-if="weekComplete" class="cq-toast cq-days__complete" role="status">
      Semana completa: podés repetir cualquier día
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PlanDayView } from '../../types'

// Fase 201 D-16, §7.1 Hoy (prototipo `.days`): un chip por día del plan. Cada uno dice si ya está
// hecho; el elegido va resaltado. Con la semana completa se puede repetir cualquiera.
withDefaults(
  defineProps<{
    plan: PlanDayView[]
    selected: string
    weekComplete: boolean
    nextDayKey?: string | null
  }>(),
  { nextDayKey: null },
)

const emit = defineEmits<{ select: [dayKey: string] }>()
</script>

<style scoped lang="scss">
.cq-days {
  display: flex;
  flex-direction: column;
  gap: 10px;

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(66px, 1fr));
    gap: 6px;
  }

  &__btn {
    min-height: 54px;
    padding: 4px 2px;
    border-radius: 12px;
    border: 1px solid var(--cq-hair2);
    background: transparent;
    color: var(--cq-cream);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    overflow-wrap: anywhere;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;

    small {
      min-height: 12px;
      font-size: 9.5px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--cq-muted);
    }

    &[aria-pressed='true'] {
      background: var(--cq-sun);
      border-color: var(--cq-sun);
      color: var(--cq-ink);

      small {
        color: var(--cq-ink2);
      }
    }
  }

  &__complete {
    text-align: center;
  }
}
</style>
