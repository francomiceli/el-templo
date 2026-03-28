<template>
  <div class="day-card" :class="cardClasses">
    <!-- Day Header -->
    <div class="day-card__header">
      <div class="day-card__header-top">
        <div class="day-card__header-left">
          <span class="day-card__day-name">{{ day.dayName }}</span>
          <span class="day-card__date">{{ formatDate(day.date) }}</span>
        </div>
      </div>
      <div v-if="day.session" class="day-card__header-subtitle">
        <span class="day-card__route">{{ getSessionRouteName(day.session) }}</span>
      </div>
    </div>

    <!-- Rest day content -->
    <div v-if="day.state === 'rest'" class="day-card__rest">
      <q-icon name="self_improvement" size="64px" color="grey-5" />
      <div class="text-h6 text-grey-6 q-mt-md">Descanso</div>
      <div class="text-caption text-grey-5 q-mt-sm">Domingo es tu día de recuperación</div>
    </div>

    <!-- No session content -->
    <div v-else-if="!day.session" class="day-card__empty">
      <q-icon name="event_busy" size="64px" color="grey-5" />
      <div class="text-h6 text-grey-6 q-mt-md">Sin sesión</div>
      <div class="text-caption text-grey-5 q-mt-sm">No hay entrenamiento programado</div>
    </div>

    <!-- Session blocks (scrollable) -->
    <div v-else class="day-card__blocks">
      <template v-for="(item, index) in groupedBlocks" :key="index">
        <BlockCard
          v-if="item.type === 'block'"
          :block="item.block"
          :color-class="getBlockColorClass(item.block.role)"
        />
        <BlockChoiceCard
          v-else-if="item.type === 'choice'"
          :title="item.title"
          :options="item.options"
        />
      </template>
    </div>

    <!-- Start button (only for today with session) -->
    <div v-if="showStartButton" class="day-card__footer">
      <q-btn
        :color="day.state === 'completed' ? 'secondary' : 'primary'"
        size="lg"
        class="start-button"
        :class="{ 'start-button--completed': day.state === 'completed' }"
        unelevated
        @click="handleStart"
      >
        <q-icon
          :name="day.state === 'completed' ? 'replay' : 'play_arrow'"
          size="24px"
          class="q-mr-sm"
        />
        <span class="text-weight-bold">
          {{
            day.state === 'completed'
              ? 'Repetir Sesión'
              : hasActiveProgress
                ? 'Continuar'
                : 'Comenzar'
          }}
        </span>
      </q-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import type { WeekDay, Block } from '../types/session'
import { formatShortDate, isToday } from '../composables/useDateNavigation'
import { useSessionPlayerStore } from '../stores/sessionPlayerStore'
import { getRouteName } from '../utils/routeNames'
import { getBlockColorClass } from '../utils/blockColors'
import BlockCard from './BlockCard.vue'
import BlockChoiceCard from './BlockChoiceCard.vue'

interface Props {
  day: WeekDay
  isSelected?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false,
})

const emit = defineEmits<{
  start: [date: string]
}>()

const $q = useQuasar()
const sessionPlayerStore = useSessionPlayerStore()
const hasActiveProgress = ref(false)

onMounted(async () => {
  const dayId = props.day.session?.dayId
  if (dayId && isToday(props.day.date)) {
    const progress = await sessionPlayerStore.loadProgress(dayId)
    hasActiveProgress.value = progress.elapsedSeconds > 0 || progress.completedBlocks.length > 0
  }
})

/**
 * CSS classes based on day state
 */
const cardClasses = computed(() => {
  const classes: string[] = []
  const { state } = props.day

  if (props.isSelected) {
    classes.push('day-card--selected')
  }

  if (state === 'today') {
    classes.push('day-card--today')
  } else if (state === 'completed') {
    classes.push('day-card--completed')
  } else if (state === 'past') {
    classes.push('day-card--past')
  } else if (state === 'future') {
    classes.push('day-card--future')
  } else if (state === 'rest') {
    classes.push('day-card--rest')
  }

  return classes
})

/**
 * Sort blocks by sortOrder
 */
const sortedBlocks = computed(() => {
  if (!props.day.session?.blocks) return []
  return [...props.day.session.blocks].sort((a: Block, b: Block) => a.sortOrder - b.sortOrder)
})

/**
 * Choice option type for BlockChoiceCard
 */
interface ChoiceOption {
  id: string
  label: string
  block: Block
}

/**
 * Group blocks for display - combines DEUTEROS_1 and DEUTEROS_2 into a choice
 */
const groupedBlocks = computed(() => {
  const blocks = sortedBlocks.value
  const deuteros1 = blocks.find((b) => b.role === 'DEUTEROS_1')
  const deuteros2 = blocks.find((b) => b.role === 'DEUTEROS_2')

  // Build display items in order
  type DisplayItem =
    | { type: 'block'; block: Block }
    | { type: 'choice'; title: string; options: ChoiceOption[] }
  const items: DisplayItem[] = []

  // Add blocks in their original order, inserting deuteros choice at DEUTEROS_1's position
  let choiceInserted = false
  for (const block of blocks) {
    if (block.role === 'DEUTEROS_1' && deuteros1 && deuteros2 && !choiceInserted) {
      items.push({
        type: 'choice',
        title: 'Deuteros',
        options: [
          { id: 'DEUTEROS_1', label: 'Opción 1', block: deuteros1 },
          { id: 'DEUTEROS_2', label: 'Opción 2', block: deuteros2 },
        ],
      })
      choiceInserted = true
    } else if (block.role === 'DEUTEROS_2') {
      // Skip - already included in the choice
      continue
    } else if (block.role !== 'DEUTEROS_1') {
      items.push({ type: 'block', block })
    }
  }

  // Edge case: if only one deuteros exists, show it as regular block
  if (deuteros1 && !deuteros2) {
    const insertIndex = blocks.findIndex((b) => b.role === 'DEUTEROS_1')
    items.splice(insertIndex, 0, { type: 'block', block: deuteros1 })
  }
  if (deuteros2 && !deuteros1) {
    const insertIndex = blocks.findIndex((b) => b.role === 'DEUTEROS_2')
    items.splice(insertIndex, 0, { type: 'block', block: deuteros2 })
  }

  return items
})

/**
 * Show start button only for today with a session
 */
const showStartButton = computed(() => {
  return isToday(props.day.date) && props.day.session !== null
})

/**
 * Format date for display
 */
function formatDate(date: string): string {
  return formatShortDate(date)
}

/**
 * Get route name from session
 */
function getSessionRouteName(session: typeof props.day.session): string {
  if (!session || session.blocks.length === 0) {
    return ''
  }
  const mainBlock = session.blocks.find((b) => b.role === 'NUCLEUS') || session.blocks[0]
  return getRouteName(mainBlock.route)
}

/**
 * Handle start button click — confirm restart if session already completed
 */
function handleStart() {
  if (props.day.state === 'completed') {
    $q.dialog({
      title: 'Repetir sesión',
      message: 'Vas a reiniciar la sesión de hoy. El progreso registrado anteriormente se perderá.',
      cancel: { label: 'Cancelar', flat: true },
      ok: { label: 'Repetir', color: 'primary' },
      persistent: true,
    }).onOk(() => {
      emit('start', props.day.date)
    })
  } else {
    emit('start', props.day.date)
  }
}
</script>

<style scoped lang="scss">
@use 'sass:color';
// Import brand variables
@import 'src/css/quasar.variables.scss';

.day-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0; // Critical for flex child to respect parent height
  background: $cream;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  transition:
    transform 0.3s ease,
    box-shadow 0.3s ease,
    border-color 0.3s ease;
  position: relative; // For today badge positioning

  &__header {
    flex-shrink: 0;
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    border-bottom: 1px solid rgba($secondary, 0.25);
    background: linear-gradient(135deg, rgba($secondary, 0.1) 0%, $cream 100%);
  }

  &__header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__header-left {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
  }

  &__header-subtitle {
    margin-top: 2px;
  }

  &__day-name {
    font-size: 22px;
    font-weight: 700;
    color: $primary;
    font-family: 'Montserrat', sans-serif;
  }

  &__date {
    font-size: 14px;
    color: color.adjust($primary, $lightness: -5%);
    font-weight: 500;
  }

  &__route {
    font-size: 16px;
    color: color.adjust($secondary, $lightness: -15%);
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  &__blocks {
    flex: 1;
    min-height: 0; // Critical for flex child to allow scrolling
    overflow-y: auto;
    padding: 16px;
    background-color: $cream;
    -webkit-overflow-scrolling: touch;
  }

  &__rest,
  &__empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    text-align: center;
  }

  &__footer {
    flex-shrink: 0;
    padding: 16px;
    padding-bottom: max(16px, env(safe-area-inset-bottom));
    background: linear-gradient(to top, $cream 0%, rgba($cream, 0.95) 100%);
    border-top: 1px solid rgba($secondary, 0.2);
  }

  // Selected state - bronze accent
  &--selected {
    border: 2px solid $secondary;
    box-shadow: 0 8px 30px rgba($secondary, 0.25);
  }

  // Today indicator - enhanced styling
  &--today {
    .day-card__header {
      background: linear-gradient(135deg, rgba($primary, 0.12) 0%, rgba($cream, 0.95) 100%);
    }

    .day-card__day-name {
      color: $primary;
    }
  }

  &--completed {
    .day-card__header {
      background: linear-gradient(135deg, rgba($secondary, 0.1) 0%, $cream 100%);
    }
  }

  &--past {
    opacity: 0.85;
  }

  // Rest day - cream background
  &--rest {
    background: $cream;

    .day-card__header {
      background: transparent;
    }

    .day-card__day-name {
      color: $primary;
      opacity: 0.6;
    }
  }
}

.start-button {
  width: 100%;
  height: 52px;
  border-radius: 26px;
  font-size: 16px;
  font-family: 'Montserrat', sans-serif;
  letter-spacing: 0.08em;
  background: linear-gradient(
    135deg,
    $primary 0%,
    color.adjust($primary, $lightness: 8%) 50%,
    mix($primary, $secondary, 70%) 100%
  ) !important;
  box-shadow: 0 4px 12px rgba($primary, 0.3);
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 6px 16px rgba($primary, 0.4);
    transform: translateY(-1px);
  }
}
</style>
