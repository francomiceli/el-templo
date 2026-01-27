<template>
  <div class="deuteros-choice">
    <!-- Header section -->
    <div class="choice-header q-pa-md text-center">
      <div class="text-h5 text-weight-bold">
        Elige tu bloque Deuteros
      </div>
    </div>

    <!-- Swipeable cards container -->
    <div class="cards-container" ref="cardsContainer">
      <!-- Deuteros 1 Card -->
      <div
        class="deuteros-card"
        :class="{
          'deuteros-card--selected': selected === 'DEUTEROS_1',
          [getBlockColorClass('DEUTEROS_1')]: true
        }"
        @click="selectOption('DEUTEROS_1')"
      >
        <div class="card-header" :style="getHeaderStyle('DEUTEROS_1')">
          <div class="text-subtitle1 text-weight-bold text-white">
            Deuteros 1
          </div>
          <div class="text-caption text-white-7">
            {{ getRouteName(deuteros1.route) }}
          </div>
        </div>
        <div class="card-content q-pa-md">
          <div class="exercises-preview">
            <div
              v-for="(exercise, index) in deuteros1.exercises"
              :key="exercise.exerciseId"
              class="exercise-preview-item text-body2"
            >
              <span class="text-grey-7">{{ index + 1 }}.</span>
              {{ exercise.exerciseName }}
            </div>
          </div>
          <div class="exercise-count q-mt-sm text-caption text-grey-7">
            {{ deuteros1.exercises.length }} ejercicios - {{ deuteros1.format }}
          </div>
        </div>
        <!-- Selection indicator -->
        <q-icon
          v-if="selected === 'DEUTEROS_1'"
          name="check_circle"
          color="cyan-8"
          size="24px"
          class="selection-indicator"
        />
      </div>

      <!-- Deuteros 2 Card -->
      <div
        class="deuteros-card"
        :class="{
          'deuteros-card--selected': selected === 'DEUTEROS_2',
          [getBlockColorClass('DEUTEROS_2')]: true
        }"
        @click="selectOption('DEUTEROS_2')"
      >
        <div class="card-header" :style="getHeaderStyle('DEUTEROS_2')">
          <div class="text-subtitle1 text-weight-bold text-white">
            Deuteros 2
          </div>
          <div class="text-caption text-white-7">
            {{ getRouteName(deuteros2.route) }}
          </div>
        </div>
        <div class="card-content q-pa-md">
          <div class="exercises-preview">
            <div
              v-for="(exercise, index) in deuteros2.exercises"
              :key="exercise.exerciseId"
              class="exercise-preview-item text-body2"
            >
              <span class="text-grey-7">{{ index + 1 }}.</span>
              {{ exercise.exerciseName }}
            </div>
          </div>
          <div class="exercise-count q-mt-sm text-caption text-grey-7">
            {{ deuteros2.exercises.length }} ejercicios - {{ deuteros2.format }}
          </div>
        </div>
        <!-- Selection indicator -->
        <q-icon
          v-if="selected === 'DEUTEROS_2'"
          name="check_circle"
          color="deep-purple-8"
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
        :color="buttonColor"
        size="lg"
        class="full-width"
        unelevated
        @click="confirm"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Block, BlockRole } from '../../types/session';
import { getBlockColorClass, getBlockCSSColor } from '../../utils/blockColors';
import { getRouteName } from '../../utils/routeNames';

type DeuterosChoice = 'DEUTEROS_1' | 'DEUTEROS_2';

interface Props {
  /** First Deuteros option block */
  deuteros1: Block;
  /** Second Deuteros option block */
  deuteros2: Block;
}

interface Emits {
  (e: 'select', choice: DeuterosChoice): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

/** Currently selected option */
const selected = ref<DeuterosChoice | null>(null);

/**
 * Select an option
 */
function selectOption(choice: DeuterosChoice): void {
  selected.value = choice;
}

/**
 * Confirm selection and emit
 */
function confirm(): void {
  if (selected.value) {
    emit('select', selected.value);
  }
}

/**
 * Get header background style for a block role
 */
function getHeaderStyle(role: BlockRole): Record<string, string> {
  return {
    backgroundColor: getBlockCSSColor(role),
  };
}

/**
 * Computed button label
 */
const buttonLabel = computed(() => {
  if (!selected.value) {
    return 'Selecciona una opcion';
  }
  return selected.value === 'DEUTEROS_1' ? 'Comenzar Deuteros 1' : 'Comenzar Deuteros 2';
});

/**
 * Computed button color
 */
const buttonColor = computed(() => {
  if (!selected.value) {
    return 'grey-4';
  }
  return selected.value === 'DEUTEROS_1' ? 'cyan' : 'deep-purple';
});
</script>

<style scoped lang="scss">
.deuteros-choice {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
}

.choice-header {
  flex-shrink: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
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

.deuteros-card {
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
  position: relative;

  &--selected {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    outline: 3px solid currentColor;
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
  background: white;
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
  background: white;
  border-radius: 50%;
}

.action-container {
  flex-shrink: 0;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  background: white;
}
</style>
