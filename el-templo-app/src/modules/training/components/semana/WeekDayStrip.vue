<template>
  <div class="week-strip" role="group" aria-label="Días de la semana">
    <button
      v-for="day in days"
      :key="day.date"
      type="button"
      class="week-strip__day"
      :class="{
        'week-strip__day--on': day.date === selectedDate,
        'week-strip__day--today': day.date === today,
        'week-strip__day--done': day.state === 'completed',
        'week-strip__day--rest': !day.session,
        'week-strip__day--sunday': isSunday(day),
      }"
      :disabled="isSunday(day)"
      :aria-pressed="day.date === selectedDate"
      :aria-label="dayLabel(day)"
      @click="emit('select', day.date)"
    >
      <span class="week-strip__name">{{ dayChip(day.date).short }}</span>
      <b class="week-strip__num">{{ dayChip(day.date).n }}</b>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { WeekDay } from '../../types/session'
import { dayChip, dayKicker } from '../../utils/weekLabels'

// Fase 197 D-03: tira de 7 días. Elegido = borde terracota SIN relleno; hoy = borde de tinta;
// completado = número en círculo salvia (igual que Reservas); domingo / sin plani = borde punteado. El domingo no se elige (D-02).
const props = defineProps<{
  days: WeekDay[]
  selectedDate: string | null
  /** Hoy en la zona de la sede */
  today: string
}>()

const emit = defineEmits<{
  select: [date: string]
}>()

/** El domingo es día de descanso: su chip no se puede elegir */
function isSunday(day: WeekDay): boolean {
  return day.dayOfWeek === 0
}

/** "Hoy · viernes 16, completada" para lectores de pantalla (la fecha larga, no solo "VIE 16") */
function dayLabel(day: WeekDay): string {
  const base = dayKicker(day.date, props.today)
  if (day.state === 'completed') return `${base}, completada`
  if (isSunday(day)) return `${base}, día de descanso`
  if (!day.session) return `${base}, sin plani`
  return base
}
</script>

<style scoped lang="scss">
@import 'src/css/brand';
@import 'src/css/premium-card';

.week-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 5px;

  &__day {
    min-height: 56px;
    padding: 7px 0 7px;
    border: 1px solid $pd-light-line;
    border-radius: 14px;
    background: #fff;
    text-align: center;
    font-family: 'Montserrat', sans-serif;
    font-weight: 600;
    font-size: 11px;
    color: $pd-ink-2;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid $pd-terra-ink;
      outline-offset: 2px;
    }

    // Domingo: no se puede elegir
    &--sunday,
    &:disabled {
      cursor: default;
    }

    // Domingo / sin plani: sin fondo y borde punteado
    &--rest {
      background: transparent;
      border-style: dashed;
      border-color: $pd-light-edge;
    }

    // Hoy (no elegido): borde de tinta
    &--today {
      border-color: $pd-ink;
    }

    // Elegido: borde terracota SIN relleno (el único terracota lleno es el CTA)
    &--on {
      background: #fff;
      border-style: solid;
      border-color: $pd-terra-ink;
      box-shadow: inset 0 0 0 1px $pd-terra-ink;
      color: $pd-terra-ink;
    }
  }

  &__name {
    display: block;
  }

  // El círculo siempre ocupa su lugar (así las fichas no cambian de alto); se pinta solo si está
  // completado: círculo salvia y número blanco, como en Reservas.
  &__num {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    margin: 1px auto 0;
    border-radius: 50%;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 17px;
    line-height: 1;
    color: $pd-ink;
  }

  &__day--on &__num {
    color: $pd-terra-ink;
  }

  &__day--done &__num,
  &__day--done.week-strip__day--on &__num {
    background: $pd-sage;
    color: #fff;
  }
}
</style>
