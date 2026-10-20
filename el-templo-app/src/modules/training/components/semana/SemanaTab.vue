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
      <!-- Área de bloques (D-03): chips apilados + figura de 220 px y lista del bloque elegido -->
      <div v-if="activeBlock" class="semana-tab__blocks">
        <div class="semana-tab__split">
          <BlockChipStack
            :blocks="blocks"
            :selected="selectedBlockIndex"
            :interactive="interactive"
            @select="onSelectBlock"
          />
          <div class="semana-tab__stage">
            <span class="semana-tab__halo" aria-hidden="true" />
            <BodyFigure
              :gender="gender"
              :lit="zones.lit"
              :lit2="zones.lit2"
              :tone="completed ? 'sage' : 'terra'"
              :height="220"
            />
          </div>
        </div>
        <BlockExercisesCard :block="activeBlock" />
      </div>
    </SemanaHero>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BodyFigure from 'src/components/anatomy/BodyFigure.vue'
import type { Block, WeekDay } from '../../types/session'
import { defaultBlockIndex, figureZones } from '../../utils/blockMeta'
import WeekHeader from './WeekHeader.vue'
import WeekDayStrip from './WeekDayStrip.vue'
import SemanaHero from './SemanaHero.vue'
import BlockChipStack from './BlockChipStack.vue'
import BlockExercisesCard from './BlockExercisesCard.vue'

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
    /** `users.gender`: elige la figura (D-07) */
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

// Bloques de la sesión elegida, por orden de la sesión
const blocks = computed<Block[]>(() =>
  [...(selectedDay.value?.session?.blocks ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
)

// Bloque tocado por el socio (por id: sobrevive a una recarga de la semana). Se descarta al
// cambiar de día: NUCLEUS vuelve a ser el elegido (D-03), y siempre hay uno elegido.
const pickedBlockId = ref<string | null>(null)

watch(
  () => props.selectedDate,
  () => {
    pickedBlockId.value = null
  },
)

const selectedBlockIndex = computed(() => {
  const picked = blocks.value.findIndex((b) => b.blockId === pickedBlockId.value)
  return picked >= 0 ? picked : defaultBlockIndex(blocks.value)
})

const activeBlock = computed<Block | undefined>(() => blocks.value[selectedBlockIndex.value])

const zones = computed(() => figureZones(blocks.value, selectedBlockIndex.value))

const completed = computed(() => selectedDay.value?.state === 'completed')

function onSelectBlock(index: number): void {
  if (!props.interactive) return
  const block = blocks.value[index]
  if (block) pickedBlockId.value = block.blockId
}

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

  &__blocks {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
  }

  // Halo decorativo detrás de la figura (solo adorno, sin texto)
  &__stage {
    position: relative;
    isolation: isolate;
  }

  &__halo {
    position: absolute;
    top: 52%;
    left: 50%;
    z-index: -1;
    width: 200px;
    height: 220px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(163, 95, 60, 0.16), transparent);
    pointer-events: none;
  }
}
</style>
