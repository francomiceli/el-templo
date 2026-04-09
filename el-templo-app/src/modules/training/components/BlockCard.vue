<template>
  <q-expansion-item
    :class="['block-card', colorClass]"
    :label="block.role"
    :caption="blockCaption"
    expand-separator
    header-class="text-weight-medium"
  >
    <template #header>
      <q-item-section>
        <q-item-label class="block-role-name text-body1">
          {{ formatRole(block.role) }}
        </q-item-label>
        <div class="block-meta">
          <div class="block-meta__row">
            <span v-if="block.role.startsWith('ROM_')" class="block-meta__route">{{
              { ROM_LOWER: 'Lower', ROM_CORE: 'Core', ROM_UPPER: 'Upper' }[block.role] || block.role
            }}</span>
            <span v-else-if="block.route && block.route != 'INITIUM'" class="block-meta__route">{{
              getRouteName(block.route)
            }}</span>
            <span
              v-if="block.intensity && block.route != 'INITIUM' && !block.role.startsWith('ROM_')"
              class="block-meta__intensity"
            >
              <span class="block-meta__label">INT</span> {{ block.intensity }}%
            </span>
          </div>
          <div class="block-meta__row block-meta__row--secondary">
            <span class="block-meta__exercises"
              >{{ block.exercises.length }} ejercicio{{
                block.exercises.length !== 1 ? 's' : ''
              }}</span
            >
            <span
              v-if="block.format && typeof block.format === 'string'"
              class="block-meta__format"
              >{{ block.format }}</span
            >
          </div>
        </div>
      </q-item-section>
    </template>

    <q-card class="q-ma-sm">
      <q-card-section class="q-pa-sm">
        <div class="exercise-list">
          <div v-for="exercise in block.exercises" :key="exercise.exerciseId" class="exercise-item">
            <span class="exercise-name">{{ exercise.exerciseName }}</span>
            <span class="exercise-prescription">{{ formatPrescriptionInline(exercise) }}</span>
          </div>
        </div>
      </q-card-section>
    </q-card>
  </q-expansion-item>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Block, BlockRole, Prescription } from '../types/session'
import { getRouteName } from '../utils/routeNames'

interface Props {
  block: Block
  colorClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  colorClass: 'block-bg--default',
})

// getBlockColorClass is exported from utils/blockColors.ts for external use

/**
 * Format block role for display
 */
function formatRole(role: BlockRole): string {
  const roleNames: Record<BlockRole, string> = {
    INITIUM: 'Initium',
    NUCLEUS: 'Nucleus',
    DEUTEROS_1: 'Deuteros 1',
    DEUTEROS_2: 'Deuteros 2',
    ATHLOS: 'Athlos',
    EPIKOS: 'Epikos',
    ROM_LOWER: 'Tren Inferior',
    ROM_CORE: 'Zona Media',
    ROM_UPPER: 'Tren Superior',
  }
  return roleNames[role] || role
}

/**
 * Build caption showing route, intensity, exercise count, and format
 */
const blockCaption = computed(() => {
  const parts: string[] = []

  if (props.block.route) {
    parts.push(getRouteName(props.block.route))
  }

  if (props.block.intensity) {
    parts.push(`${props.block.intensity}%`)
  }

  const exerciseCount = props.block.exercises.length
  parts.push(`${exerciseCount} ejercicio${exerciseCount !== 1 ? 's' : ''}`)

  if (props.block.format && typeof props.block.format === 'string') {
    parts.push(props.block.format)
  }

  return parts.join(' • ')
})

/**
 * Format prescription inline (compact format for exercise list)
 * Returns: "8 · CON" or "30s ISO"
 */
function formatPrescriptionInline(exercise: Prescription): string {
  // PAUSA exercise (I Go You Go)
  if (exercise.notes === 'PAUSA') return 'PAUSA'

  // Death By sequence
  if (exercise.increment) {
    const start = exercise.reps || exercise.seconds || 0
    const seq = `${start}-${start + exercise.increment}-${start + exercise.increment * 2}-...`
    return exercise.contraction === 'ISO' ? `${seq}s ISO` : `${seq} · ${exercise.contraction}`
  }

  // For isometric exercises, show duration with ISO
  if (exercise.contraction === 'ISO' && exercise.seconds) {
    const secsText = exercise.secondsMax
      ? `${exercise.seconds}-${exercise.secondsMax}`
      : `${exercise.seconds}`
    return `${secsText}s ISO`
  }

  // For rep-based exercises, show count and contraction type
  const parts: string[] = []
  if (exercise.reps) {
    const repsText = exercise.repsMax ? `${exercise.reps}-${exercise.repsMax}` : `${exercise.reps}`
    parts.push(repsText)
  }
  if (exercise.contraction) {
    parts.push(exercise.contraction)
  }

  return parts.join(' · ')
}
</script>

<style scoped lang="scss">
@use 'sass:color';
@import 'src/css/quasar.variables.scss';

.block-card {
  border-radius: 8px;
  margin-bottom: 8px;
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  // Nucleus block gets more visual weight
  &.block-bg--nucleus {
    border: 2px solid rgba($primary, 0.25);
    box-shadow: 0 2px 12px rgba($primary, 0.12);

    :deep(.q-expansion-item__container) {
      background: linear-gradient(135deg, rgba($primary, 0.06) 0%, $cream 100%);
    }

    .block-role-name {
      font-size: 17px;
    }
  }
}

.block-role-name {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: $primary;
}

.block-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;

  &__row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;

    &--secondary {
      opacity: 0.85;
    }
  }

  &__route {
    font-size: 13px;
    font-weight: 600;
    color: color.adjust($secondary, $lightness: -12%);
  }

  &__intensity {
    font-size: 12px;
    font-weight: 600;
    color: $primary;
    background: rgba($primary, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
  }

  &__label {
    font-size: 10px;
    font-weight: 700;
    color: rgba($primary, 0.6);
    margin-right: 2px;
  }

  &__exercises {
    font-size: 12px;
    color: color.adjust($secondary, $lightness: -8%);
  }

  &__format {
    font-size: 11px;
    color: color.adjust($secondary, $lightness: -5%);
    background: rgba($secondary, 0.15);
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
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

// Ensure inner card uses cream background
:deep(.q-card) {
  background-color: $cream !important;
}
</style>
