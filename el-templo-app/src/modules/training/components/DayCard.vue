<template>
  <div
    class="day-card"
    :class="cardClasses"
    @click="handleClick"
  >
    <div class="day-card__header">
      <div class="day-card__day-name">{{ day.dayName }}</div>
      <div class="day-card__date">{{ formatDate(day.date) }}</div>
    </div>

    <div v-if="day.session" class="day-card__content">
      <div class="day-card__block-count">
        {{ day.session.blockCount }} bloques
      </div>
      <div class="day-card__route">
        {{ getRouteName(day.session) }}
      </div>
    </div>

    <div v-else-if="day.state === 'rest'" class="day-card__content">
      <div class="day-card__rest-label">Descanso</div>
    </div>

    <div v-else class="day-card__content">
      <div class="day-card__no-session text-grey-6">Sin sesión</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { WeekDay } from '../types/session';
import { formatShortDate } from '../composables/useDateNavigation';

/**
 * Individual day card component for weekly carousel
 *
 * Displays a single day with state-based styling:
 * - today + selected: prominent border, bg, shadow, scale
 * - today not selected: border, light bg
 * - completed: green bg, white text
 * - past: dimmed, grey bg
 * - future: dimmed, light grey bg
 * - rest (Sunday): grey bg, no interaction
 */

interface Props {
  /** Week day data including date, state, and session */
  day: WeekDay;
  /** Whether this day is currently selected/centered */
  isSelected?: boolean;
}

interface Emits {
  (e: 'select', date: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false,
});

const emit = defineEmits<Emits>();

/**
 * Determine CSS classes based on day state and selection
 */
const cardClasses = computed(() => {
  const classes: string[] = [];
  const { state } = props.day;

  // State-based styling
  if (state === 'today' && props.isSelected) {
    classes.push('day-card--today-selected');
  } else if (state === 'today') {
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
 * Handle card click - emit select event unless it's a rest day
 */
function handleClick() {
  if (props.day.state !== 'rest') {
    emit('select', props.day.date);
  }
}

/**
 * Format date string to DD/MM
 */
function formatDate(date: string): string {
  return formatShortDate(date);
}

/**
 * Extract route name from session for display
 */
function getRouteName(session: typeof props.day.session): string {
  if (!session || session.blocks.length === 0) {
    return '';
  }
  // Get route from first block (usually NUCLEUS or main block)
  const mainBlock = session.blocks.find(b => b.role === 'NUCLEUS') || session.blocks[0];
  return mainBlock.route.toUpperCase();
}
</script>

<style scoped lang="scss">
.day-card {
  min-width: 120px;
  max-width: 140px;
  padding: 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;

  &__header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__day-name {
    font-weight: 600;
    font-size: 16px;
    line-height: 1.2;
  }

  &__date {
    font-size: 14px;
    opacity: 0.8;
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;
  }

  &__block-count {
    font-weight: 500;
  }

  &__route {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.9;
  }

  &__rest-label {
    font-style: italic;
    opacity: 0.8;
  }

  &__no-session {
    font-size: 13px;
    font-style: italic;
  }

  // State-based styling using Quasar colors
  &--today-selected {
    border: 2px solid var(--q-primary);
    background-color: rgba(var(--q-primary-rgb), 0.1);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
    transform: scale(1.05);

    .day-card__day-name {
      color: var(--q-primary);
    }
  }

  &--today {
    border: 2px solid var(--q-primary);
    background-color: #f5f5f5;

    .day-card__day-name {
      color: var(--q-primary);
    }
  }

  &--completed {
    background-color: var(--q-positive);
    color: white;

    .day-card__day-name,
    .day-card__date,
    .day-card__route {
      color: white;
    }
  }

  &--past {
    opacity: 0.7;
    background-color: #e0e0e0;
  }

  &--future {
    opacity: 0.7;
    background-color: #f5f5f5;
  }

  &--rest {
    background-color: #e0e0e0;
    color: #757575;
    cursor: default;

    &:hover {
      transform: none;
    }
  }

  // Hover effect (except for rest days)
  &:not(.day-card--rest):hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }

  // Today selected has higher hover effect
  &--today-selected:hover {
    transform: scale(1.05) translateY(-2px);
  }
}
</style>
