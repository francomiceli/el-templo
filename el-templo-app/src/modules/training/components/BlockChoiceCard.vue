<template>
  <q-expansion-item
    class="block-choice-card block-bg--deuteros-1"
    :label="title"
    expand-separator
    header-class="text-weight-medium"
  >
    <template #header>
      <q-item-section>
        <q-item-label class="choice-role-name text-body1">
          {{ title }}
        </q-item-label>
        <div class="choice-meta">
          <span class="choice-meta__hint">{{ subtitle }}</span>
          <span class="choice-meta__count">{{ options.length }} opciones</span>
        </div>
      </q-item-section>
    </template>

    <q-card class="q-ma-sm choice-options">
      <template v-for="(option, index) in options" :key="option.id">
        <!-- Divider between options -->
        <div v-if="index > 0" class="choice-divider">
          <span class="choice-divider__line"></span>
          <span class="choice-divider__text">o</span>
          <span class="choice-divider__line"></span>
        </div>

        <!-- Option -->
        <q-card-section class="choice-option">
          <div class="choice-option__label">{{ option.label }}</div>
          <div class="choice-option__meta">
            <span v-if="option.block.route" class="choice-option__route">
              {{ getRouteName(option.block.route) }}
            </span>
            <span v-if="option.block.intensity" class="choice-option__intensity">
              <span class="choice-option__intensity-label">INT</span> {{ option.block.intensity }}%
            </span>
            <span v-if="option.block.format" class="choice-option__format">
              {{ option.block.format }}
            </span>
          </div>
          <div class="exercise-list">
            <div
              v-for="exercise in option.block.exercises"
              :key="exercise.exerciseId"
              class="exercise-item"
            >
              <span class="exercise-name">{{ exercise.exerciseName }}</span>
              <span class="exercise-prescription">{{ formatPrescription(exercise) }}</span>
            </div>
          </div>
        </q-card-section>
      </template>
    </q-card>
  </q-expansion-item>
</template>

<script setup lang="ts">
import type { Block, Prescription } from '../types/session';
import { getRouteName } from '../utils/routeNames';

export interface BlockChoiceOption {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Block data */
  block: Block;
}

interface Props {
  /** Header title */
  title: string;
  /** Subtitle hint text */
  subtitle?: string;
  /** Available options */
  options: BlockChoiceOption[];
}

withDefaults(defineProps<Props>(), {
  subtitle: 'Elige una opción',
});

/**
 * Format prescription inline (compact format for exercise list)
 */
function formatPrescription(exercise: Prescription): string {
  if (exercise.contraction === 'ISO' && exercise.seconds) {
    return `${exercise.seconds}s ISO`;
  }

  const parts: string[] = [];
  if (exercise.reps) {
    parts.push(`${exercise.reps}`);
  }
  if (exercise.contraction) {
    parts.push(exercise.contraction);
  }

  return parts.join(' · ');
}
</script>

<style scoped lang="scss">
@use 'sass:color';
@import 'src/css/quasar.variables.scss';

.block-choice-card {
  border-radius: 8px;
  margin-bottom: 8px;
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
}

.choice-role-name {
  font-family: 'Cinzel', serif;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: $primary;
}

.choice-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;

  &__hint {
    font-size: 13px;
    font-weight: 500;
    color: color.adjust($secondary, $lightness: -10%);
    font-style: italic;
  }

  &__count {
    font-size: 12px;
    color: color.adjust($secondary, $lightness: -5%);
    background: rgba($secondary, 0.15);
    padding: 2px 6px;
    border-radius: 4px;
  }
}

.choice-options {
  background-color: $cream !important;
}

.choice-option {
  padding: 12px 10px;

  &__label {
    font-size: 12px;
    font-weight: 700;
    color: $primary;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  &__meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }

  &__route {
    font-size: 13px;
    font-weight: 600;
    color: color.adjust($secondary, $lightness: -12%);
  }

  &__intensity {
    font-size: 11px;
    font-weight: 600;
    color: $primary;
    background: rgba($primary, 0.1);
    padding: 2px 5px;
    border-radius: 4px;
  }

  &__format {
    font-size: 10px;
    color: color.adjust($secondary, $lightness: -5%);
    background: rgba($secondary, 0.12);
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  &__intensity-label {
    font-size: 9px;
    font-weight: 700;
    color: rgba($primary, 0.6);
    margin-right: 2px;
  }
}

.exercise-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.exercise-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 13px;
  color: color.adjust($primary, $lightness: -5%);
  padding: 4px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);

  &:last-child {
    border-bottom: none;
  }
}

.exercise-name {
  font-weight: 500;
  flex: 1;
}

.exercise-prescription {
  font-size: 11px;
  color: color.adjust($secondary, $lightness: -8%);
  font-weight: 500;
  flex-shrink: 0;
}

.choice-divider {
  display: flex;
  align-items: center;
  padding: 0 10px;

  &__line {
    flex: 1;
    height: 1px;
    background: rgba($secondary, 0.3);
  }

  &__text {
    padding: 0 12px;
    font-size: 13px;
    font-weight: 600;
    color: color.adjust($secondary, $lightness: -10%);
    font-style: italic;
  }
}
</style>
