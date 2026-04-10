<template>
  <div class="block-choice">
    <!-- Header section -->
    <div class="choice-header q-pa-md">
      <div class="choice-header__title">{{ title }}</div>
      <div class="choice-header__desc">
        Elegí según si querés dedicar más tiempo al tren superior o al tren inferior (piernas).
      </div>
    </div>

    <!-- Swipeable cards container -->
    <div class="cards-container">
      <div
        v-for="option in options"
        :key="option.id"
        class="choice-card"
        :class="{
          'choice-card--selected': selected === option.id,
          [getBlockColorClass(option.block.role)]: true,
        }"
        @click="selectOption(option.id)"
      >
        <div class="card-header" :style="getHeaderStyle(option.block.role)">
          <div class="text-subtitle1 text-weight-bold text-white">
            {{ option.label }}
          </div>
          <div class="text-caption text-white-7">
            {{ getRouteName(option.block.route) }}
          </div>
        </div>
        <div class="card-content q-pa-md">
          <div class="exercises-preview">
            <div
              v-for="exercise in option.block.exercises"
              :key="exercise.exerciseId"
              class="exercise-preview-item text-body2"
            >
              {{ exercise.exerciseName }}
            </div>
          </div>
          <div class="exercise-count q-mt-sm text-caption text-grey-7">
            {{ option.block.exercises.length }} ejercicios - {{ option.block.format }}
          </div>
        </div>
        <!-- Selection indicator — empty circle when unselected, filled when selected -->
        <q-icon
          :name="selected === option.id ? 'check_circle' : 'radio_button_unchecked'"
          :color="selected === option.id ? 'primary' : 'grey-5'"
          size="24px"
          class="selection-indicator"
        />
      </div>
    </div>

    <!-- Bottom action button -->
    <div class="action-container q-pa-md">
      <q-btn
        :disable="!selected"
        :label="buttonLabel"
        :color="selected ? 'primary' : 'grey-4'"
        size="lg"
        class="full-width"
        unelevated
        @click="confirm"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Block, BlockRole } from '../../types/session'
import { getBlockColorClass, getBlockCSSColor } from '../../utils/blockColors'
import { getRouteName } from '../../utils/routeNames'

export interface BlockOption {
  /** Unique identifier for this option */
  id: string
  /** Display label for this option */
  label: string
  /** Block data to display */
  block: Block
}

interface Props {
  /** Header title */
  title: string
  /** Available options to choose from */
  options: BlockOption[]
  /** Prefix for confirm button (e.g., "Comenzar" → "Comenzar Deuteros 1") */
  confirmButtonPrefix?: string
}

interface Emits {
  (e: 'select', choiceId: string): void
}

const props = withDefaults(defineProps<Props>(), {
  confirmButtonPrefix: 'Comenzar',
})
const emit = defineEmits<Emits>()

/** Currently selected option id */
const selected = ref<string | null>(null)

/**
 * Select an option
 */
function selectOption(id: string): void {
  selected.value = id
}

/**
 * Confirm selection and emit
 */
function confirm(): void {
  if (selected.value) {
    emit('select', selected.value)
  }
}

/**
 * Get header background style for a block role
 */
function getHeaderStyle(role: BlockRole): Record<string, string> {
  return {
    backgroundColor: getBlockCSSColor(role),
  }
}

/**
 * Get the selected option's label
 */
const selectedOption = computed(() => {
  return props.options.find((o) => o.id === selected.value)
})

/**
 * Computed button label
 */
const buttonLabel = computed(() => {
  if (!selectedOption.value) {
    return 'Selecciona una opcion'
  }
  return `${props.confirmButtonPrefix} ${selectedOption.value.label}`
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.block-choice {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: $cream;
}

.choice-header {
  flex-shrink: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);

  &__title {
    font-family: 'Montserrat', sans-serif;
    font-size: 14px;
    font-weight: 800;
    color: rgba($primary, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &__desc {
    font-size: 13px;
    color: rgba(0, 0, 0, 0.5);
    margin-top: 4px;
    line-height: 1.4;
  }
}

.cards-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.choice-card {
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  cursor: pointer;
  position: relative;

  &--selected {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    outline: 3px solid $primary;
  }

  &:active {
    transform: scale(0.99);
  }
}

.card-header {
  padding: 16px;
}

.text-white-7 {
  color: rgba(255, 255, 255, 0.7);
}

.card-content {
  background: $cream;
}

.exercises-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.exercise-preview-item {
  padding: 4px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);

  &:last-child {
    border-bottom: none;
  }
}

.exercise-count {
  padding-top: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

.selection-indicator {
  position: absolute;
  top: 12px;
  right: 12px;
  background: $cream;
  border-radius: 50%;
}

.action-container {
  flex-shrink: 0;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  background: $cream;
}
</style>
