<template>
  <div class="semana-tab" :inert="interactive ? undefined : true">
    <div class="semana-tab__weekbox">
      <WeekHeader
        :monday="monday"
        :can-prev="canPrev"
        :can-next="canNext"
        @prev="onPrev"
        @next="onNext"
      />
      <WeekDayStrip :days="days" :selected-date="selectedDate" :today="today" @select="onSelect" />
    </div>

    <SemanaHero
      :day="selectedDay"
      :today="today"
      :has-progress="hasProgress"
      @start="onStart"
      @redo="onRedo"
      @summary="onSummary"
      @go-libre="onGoLibre"
    >
      <!-- Área de bloques (197-13): figura, chips y lista del bloque elegido -->
      <slot :day="selectedDay" :gender="gender" />
    </SemanaHero>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WeekDay } from '../../types/session'
import WeekHeader from './WeekHeader.vue'
import WeekDayStrip from './WeekDayStrip.vue'
import SemanaHero from './SemanaHero.vue'

// Fase 197 D-03: tab Semana presentacional (props + emits). La monta EntrenarView con datos de
// `useTrainingWeek` y la vidriera de D-06 con datos fijos (`interactive = false`: sin eventos y
// con `inert` en todo el contenido).
const props = withDefaults(
  defineProps<{
    days: WeekDay[]
    selectedDate: string | null
    /** Hoy en la zona de la sede */
    today: string
    /** Lunes de la semana que se ve */
    monday: string
    canPrev: boolean
    canNext: boolean
    hasProgress: boolean
    /** `users.gender`: elige la figura (D-07). Lo usa el área de bloques */
    gender?: string | null
    interactive?: boolean
  }>(),
  {
    gender: null,
    interactive: true,
  },
)

const emit = defineEmits<{
  'select-date': [date: string]
  'prev-week': []
  'next-week': []
  start: [date: string]
  redo: [date: string]
  summary: []
  'go-libre': []
}>()

const selectedDay = computed(() => props.days.find((d) => d.date === props.selectedDate))

function onSelect(date: string): void {
  if (props.interactive) emit('select-date', date)
}

function onPrev(): void {
  if (props.interactive) emit('prev-week')
}

function onNext(): void {
  if (props.interactive) emit('next-week')
}

function onStart(date: string): void {
  if (props.interactive) emit('start', date)
}

function onRedo(date: string): void {
  if (props.interactive) emit('redo', date)
}

function onSummary(): void {
  if (props.interactive) emit('summary')
}

function onGoLibre(): void {
  if (props.interactive) emit('go-libre')
}
</script>

<style scoped lang="scss">
.semana-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 16px 24px;

  &__weekbox {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
}
</style>
