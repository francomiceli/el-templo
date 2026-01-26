<template>
  <div class="day-card" :class="cardClasses">
    <!-- Day Header -->
    <div class="day-card__header">
      <div class="day-card__header-left">
        <span class="day-card__day-name">{{ day.dayName }}</span>
        <span class="day-card__separator">·</span>
        <span class="day-card__date">{{ formatDate(day.date) }}</span>
      </div>
      <div v-if="day.session" class="day-card__header-right">
        <span class="day-card__route">{{ getSessionRouteName(day.session) }}</span>
      </div>
    </div>

    <!-- Rest day content -->
    <div v-if="day.state === 'rest'" class="day-card__rest">
      <q-icon name="self_improvement" size="64px" color="grey-5" />
      <div class="text-h6 text-grey-6 q-mt-md">Descanso</div>
      <div class="text-caption text-grey-5 q-mt-sm">
        Domingo es tu día de recuperación
      </div>
    </div>

    <!-- No session content -->
    <div v-else-if="!day.session" class="day-card__empty">
      <q-icon name="event_busy" size="64px" color="grey-5" />
      <div class="text-h6 text-grey-6 q-mt-md">Sin sesión</div>
      <div class="text-caption text-grey-5 q-mt-sm">
        No hay entrenamiento programado
      </div>
    </div>

    <!-- Session blocks (scrollable) -->
    <div v-else class="day-card__blocks">
      <BlockCard v-for="block in sortedBlocks" :key="block.blockId" :block="block"
        :color-class="getBlockColorClass(block.role)" />
    </div>

    <!-- Start button (only for today with session) -->
    <div v-if="showStartButton" class="day-card__footer">
      <q-btn color="primary" size="lg" class="start-button" unelevated :disable="day.state === 'completed'"
        @click="handleStart">
        <q-icon name="play_arrow" size="24px" class="q-mr-sm" />
        <span class="text-weight-bold">
          {{ day.state === 'completed' ? 'Sesión Completada' : 'Comenzar' }}
        </span>
      </q-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { WeekDay, Block } from '../types/session';
import { formatShortDate, isToday } from '../composables/useDateNavigation';
import { getRouteName } from '../utils/routeNames';
import { getBlockColorClass } from '../utils/blockColors';
import BlockCard from './BlockCard.vue';

interface Props {
  day: WeekDay;
  isSelected?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false,
});

const emit = defineEmits<{
  start: [date: string];
}>();

/**
 * CSS classes based on day state
 */
const cardClasses = computed(() => {
  const classes: string[] = [];
  const { state } = props.day;

  if (props.isSelected) {
    classes.push('day-card--selected');
  }

  if (state === 'today') {
    classes.push('day-card--today');
  } else if (state === 'completed') {
    classes.push('day-card--completed');
  } else if (state === 'past') {
    classes.push('day-card--past');
  } else if (state === 'future') {
    classes.push('day-card--future');
  } else if (state === 'rest') {
    classes.push('day-card--rest');
  }

  return classes;
});

/**
 * Sort blocks by sortOrder
 */
const sortedBlocks = computed(() => {
  if (!props.day.session?.blocks) return [];
  return [...props.day.session.blocks].sort((a: Block, b: Block) => a.sortOrder - b.sortOrder);
});

/**
 * Show start button only for today with a session
 */
const showStartButton = computed(() => {
  return isToday(props.day.date) && props.day.session !== null;
});

/**
 * Format date for display
 */
function formatDate(date: string): string {
  return formatShortDate(date);
}

/**
 * Get route name from session
 */
function getSessionRouteName(session: typeof props.day.session): string {
  if (!session || session.blocks.length === 0) {
    return '';
  }
  const mainBlock = session.blocks.find(b => b.role === 'NUCLEUS') || session.blocks[0];
  return getRouteName(mainBlock.route);
}

/**
 * Handle start button click
 */
function handleStart() {
  emit('start', props.day.date);
}
</script>

<style scoped lang="scss">
.day-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  transition: transform 0.3s ease, box-shadow 0.3s ease;

  &__header {
    flex-shrink: 0;
    padding: 12px 16px;
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    border-bottom: 1px solid #f0f0f0;
    background: linear-gradient(135deg, #fafafa 0%, #ffffff 100%);
  }

  &__header-left {
    flex: 1;
    display: flex;
    align-items: baseline;
    min-width: 0;
  }

  &__header-right {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-width: 0;
  }

  &__day-name {
    font-size: 20px;
    font-weight: 700;
    color: #333;
  }

  &__separator {
    margin: 0 8px;
    color: #ccc;
    font-weight: 300;
  }

  &__date {
    font-size: 14px;
    color: #666;
  }

  &__route {
    font-size: 14px;
    color: var(--q-primary);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-align: right;
  }

  &__blocks {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
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
    background: linear-gradient(to top,
        rgba(255, 255, 255, 1) 0%,
        rgba(255, 255, 255, 0.95) 100%);
    border-top: 1px solid #f0f0f0;
  }

  // State variations
  &--today {
    .day-card__header {
      background: linear-gradient(135deg, rgba(var(--q-primary-rgb), 0.05) 0%, #ffffff 100%);
    }

    .day-card__day-name {
      color: var(--q-primary);
    }
  }

  &--completed {
    .day-card__header {
      background: linear-gradient(135deg, rgba(var(--q-positive-rgb), 0.1) 0%, #ffffff 100%);
    }

    .day-card__day-name {
      color: var(--q-positive);
    }
  }

  &--past {
    opacity: 0.85;
  }

  &--rest {
    background: #f5f5f5;

    .day-card__header {
      background: transparent;
    }
  }
}

.start-button {
  width: 100%;
  height: 52px;
  border-radius: 26px;
  font-size: 16px;
}
</style>
