<template>
  <section class="week-strip" aria-label="Tu semana">
    <div class="week-strip__title">Tu semana</div>
    <div class="week-strip__row">
      <div class="week-strip__big">{{ sessionsCount }}</div>
      <div class="week-strip__label">{{ weekNoun }}<br />esta semana</div>
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
    </div>
    <!-- UAT D21: el total se resalta con el número en una pastilla terracota -->
    <div class="week-strip__total">
      <span class="week-strip__badge">{{ totalSessions }}</span>
      <span>{{ sessionsTotalCaption(totalLabel, totalSessions) }}</span>
    </div>
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
const weekNoun = computed(() => (sessionsCount.value === 1 ? 'sesión' : 'sesiones'))
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

  &__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
  }

  &__big {
    font-family: 'Montserrat', sans-serif;
    font-size: 32px;
    font-weight: 700;
    line-height: 1;
    color: #2c2318;
  }

  &__label {
    white-space: nowrap;
    font-size: 13px;
    line-height: 1.3;
    color: #6b6459;
  }

  &__days {
    display: flex;
    gap: 5px;
    margin: 0 0 0 auto;
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

  &__total {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    font-size: 13px;
    color: #6b6459;
  }

  // Pastilla terracota con el número del total: #fff sobre #96593a = 5.6:1 (AA).
  &__badge {
    padding: 1px 9px;
    border-radius: 999px;
    background: #96593a;
    color: #ffffff;
    font-family: 'Montserrat', sans-serif;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
  }
}
</style>
