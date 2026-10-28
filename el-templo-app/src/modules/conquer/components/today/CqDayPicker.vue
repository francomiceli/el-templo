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
        <small class="cq-days__state" :class="{ 'cq-days__state--done': day.done }">{{
          day.done ? 'Hecho' : day.dayKey === nextDayKey ? 'Te toca' : ''
        }}</small>
        <span class="cq-days__label">{{ day.label }}</span>
      </button>
    </div>
    <div v-if="weekComplete" class="cq-notice cq-days__complete" role="status">
      Semana completa: podés repetir cualquier día
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PlanDayView } from '../../types'

// Fase 201 D-16, §7.1 Hoy, DA-31 (sketch 022 B `.days`/`.day`): una ficha por día del plan. Arriba el
// estado ("Hecho", "Te toca" o vacío) y abajo el día; el elegido va en azul noche. Con la semana
// completa se puede repetir cualquiera. A 390 px entran los 5 días de Toro en una fila.
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
    grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));
    gap: 6px;
  }

  &__btn {
    min-height: 56px;
    padding: 6px 2px;
    border-radius: 14px;
    border: 1px solid var(--cq-edge);
    background: var(--cq-surface);
    color: var(--cq-text);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;

    &[aria-pressed='true'] {
      background: var(--cq-night);
      border-color: var(--cq-night);
      color: var(--cq-on-night-hi);
      box-shadow: 0 4px 12px rgba(19, 29, 68, 0.25);
    }
  }

  &__state {
    min-height: 14px;
    font-size: 10.5px;
    font-weight: 600;
    line-height: 14px;
    color: var(--cq-text-2);

    &--done {
      color: var(--cq-sage);
    }
  }

  &__label {
    max-width: 100%;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.2;
    overflow-wrap: anywhere;
    color: inherit;
  }

  // El día elegido: texto sobre azul noche (el estado en `--cq-on-night`, el día en `--cq-on-night-hi`)
  &__btn[aria-pressed='true'] &__state {
    color: var(--cq-on-night);
  }

  &__complete {
    justify-content: center;
    text-align: center;
  }
}
</style>
