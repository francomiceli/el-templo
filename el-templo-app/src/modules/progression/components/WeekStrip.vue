<template>
  <section class="week-strip" aria-label="Tus sesiones">
    <div class="week-strip__title">Tus sesiones</div>
    <div class="week-strip__figures">
      <div class="week-strip__figure">
        <div class="week-strip__big">{{ sessionsCount }}</div>
        <div class="week-strip__label">esta semana</div>
      </div>
      <div class="week-strip__figure">
        <div class="week-strip__big">{{ totalSessions }}</div>
        <div class="week-strip__label">{{ sessionsTotalCaption(totalLabel) }}</div>
      </div>
    </div>
    <ul class="week-strip__days">
      <li
        v-for="(dot, i) in dots"
        :key="dot.date"
        class="week-strip__day"
        :aria-label="dotAriaLabel(dot, i)"
      >
        <i
          class="week-strip__dot"
          :class="{
            'week-strip__dot--trained': dot.trained,
            'week-strip__dot--today': dot.isToday,
          }"
          aria-hidden="true"
        ></i>
        <span aria-hidden="true">{{ dot.letter }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  dotAriaLabel,
  sessionsThisWeek,
  sessionsTotalCaption,
  weekDots,
} from '../utils/check-in-summary'

const props = withDefaults(
  defineProps<{
    weekStart: string
    todayStr: string
    completedDates: string[]
    totalSessions: number
    totalLabel?: 'total' | 'templo'
  }>(),
  { totalLabel: 'total' },
)

const dots = computed(() => weekDots(props.weekStart, props.todayStr, props.completedDates))
const sessionsCount = computed(() => sessionsThisWeek(props.weekStart, props.completedDates))
</script>

<style scoped lang="scss">
@import 'src/css/brand';

.week-strip {
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 1px 2px rgba(44, 35, 24, 0.06);

  &__title {
    margin: 0 0 8px;
    font-family: 'Montserrat', sans-serif;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: $mt-block-title-color;
  }

  // Dos cifras de igual jerarquía, columnas iguales con un filete vertical en el medio.
  &__figures {
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin-bottom: 14px;
  }

  &__figure {
    min-width: 0;
    text-align: center;

    & + & {
      border-left: 1px solid #e5dbcd;
    }
  }

  &__big {
    font-family: 'Montserrat', sans-serif;
    font-size: 32px;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    color: #2c2318;
  }

  &__label {
    margin-top: 4px;
    font-size: 13px;
    line-height: 1.3;
    color: #6b6459;
  }

  &__days {
    display: flex;
    justify-content: space-between;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__day {
    width: 22px;
    text-align: center;
    font-family: 'Montserrat', sans-serif;
    font-size: 10px;
    font-weight: 600;
    color: #6b6459;
  }

  &__dot {
    display: block;
    box-sizing: border-box;
    width: 22px;
    height: 22px;
    margin-bottom: 3px;
    border-radius: 50%;
    border: 1.5px solid #d9cfc1;

    &--trained {
      background: #96593a;
      border-color: #96593a;
    }

    &--today {
      border-width: 2px;
      border-color: #2c2318;
    }
  }
}
</style>
