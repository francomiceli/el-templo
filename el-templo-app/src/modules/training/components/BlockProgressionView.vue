<template>
  <div class="block-progression">
    <!-- Header with info -->
    <div class="block-progression__header">
      <div class="block-progression__header-left">
        <q-btn flat round dense icon="arrow_back" color="grey-8" @click="$emit('back')" />
        <div class="block-progression__header-info q-ml-sm">
          <div class="text-subtitle1 text-weight-medium">{{ dayName }}</div>
          <div class="text-caption text-grey-7">{{ currentRouteName }}</div>
        </div>
      </div>
      <div class="block-progression__header-right">
        <div class="block-progression__timer text-h6 text-weight-bold q-mr-sm">
          {{ formattedTime }}
        </div>
        <q-btn flat round dense icon="more_vert" color="grey-8">
          <q-menu>
            <q-list style="min-width: 150px">
              <q-item clickable v-close-popup @click="$emit('restart')">
                <q-item-section avatar>
                  <q-icon name="refresh" />
                </q-item-section>
                <q-item-section>Reiniciar</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </div>
    </div>

    <!-- Progress Bar -->
    <ProgressBar
      v-if="currentBlock"
      :completed-blocks="completedBlocks"
      :current-block="currentBlock.role"
    />

    <!-- Video Area -->
    <VideoPlaceholder :video-url="currentExerciseVideoUrl" />

    <!-- Block Content -->
    <div class="block-progression__content">
      <!-- Block Header -->
      <BlockHeader
        v-if="currentBlock"
        :block-name="currentBlockName"
        :block-role="currentBlock.role"
        :route="currentBlock.route"
        :intensity="currentBlock.intensity"
        :format="currentBlock.format"
      />

      <!-- Exercise completion progress -->
      <div v-if="currentBlock" class="block-progression__exercise-progress q-px-md q-pb-xs">
        <div class="text-caption text-grey-7">
          Ejercicios: {{ exerciseCompletedCount }} / {{ exerciseTotalCount }}
        </div>
        <q-linear-progress
          :value="exerciseTotalCount > 0 ? exerciseCompletedCount / exerciseTotalCount : 0"
          color="positive"
          track-color="grey-3"
          rounded
          size="4px"
          class="q-mt-xs"
        />
      </div>

      <!-- Exercise List -->
      <ExerciseList
        v-if="currentBlock"
        :exercises="currentBlock.exercises"
        :block-role="currentBlock.role"
        :selected-index="selectedExerciseIndex"
        :completed-exercises="currentBlockCompletedExercises"
        @update:selected-index="onExerciseSelect"
        @toggle-exercise-complete="onToggleExerciseComplete"
      />

      <!-- Descanso Activo (Mobility) Section -->
      <div
        v-if="currentBlock && currentBlock.role !== 'INITIUM' && currentBlock.mobilityExercise"
        class="block-progression__mobility q-px-md q-mt-sm"
      >
        <div class="text-overline text-grey-7 q-mb-xs" style="letter-spacing: 2px">
          DESCANSO ACTIVO
        </div>
        <q-card flat bordered class="mobility-card">
          <q-card-section class="q-py-sm">
            <div class="row items-center">
              <div class="col">
                <div class="text-body2 text-weight-medium">
                  {{ currentBlock.mobilityExercise.exerciseName }}
                </div>
                <div class="text-caption text-grey-7 q-mt-xs">
                  <q-badge
                    :color="mobilityContractionColor"
                    class="q-mr-xs"
                    :label="currentBlock.mobilityExercise.contraction"
                  />
                  <span
                    v-if="
                      currentBlock.mobilityExercise.seconds &&
                      currentBlock.mobilityExercise.seconds > 0
                    "
                  >
                    {{ currentBlock.mobilityExercise.seconds }}''
                  </span>
                  <span
                    v-else-if="
                      currentBlock.mobilityExercise.reps && currentBlock.mobilityExercise.reps > 0
                    "
                  >
                    {{ currentBlock.mobilityExercise.reps }} reps
                  </span>
                </div>
              </div>
              <q-icon name="self_improvement" size="32px" color="grey-5" />
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Action Area: Complete Block button -->
    <div class="block-progression__action">
      <q-btn
        color="primary"
        unelevated
        :label="completeButtonLabel"
        class="full-width"
        size="lg"
        @click="onCompleteBlock"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Block, BlockRole } from '../types/session'

// Player sub-components
import ProgressBar from './player/ProgressBar.vue'
import VideoPlaceholder from './player/VideoPlaceholder.vue'
import BlockHeader from './player/BlockHeader.vue'
import ExerciseList from './player/ExerciseList.vue'

// Utils
import { getRouteName } from '../utils/routeNames'

interface Props {
  /** Display name for the current day (e.g., "Lunes") */
  dayName: string
  /** Current block being played */
  currentBlock: Block | null
  /** Array of completed block roles */
  completedBlocks: BlockRole[]
  /** Currently selected exercise index */
  selectedExerciseIndex: number
  /** Elapsed time in seconds */
  elapsedSeconds: number
  /** Count of completed exercises in current block */
  exerciseCompletedCount: number
  /** Total exercise count in current block */
  exerciseTotalCount: number
  /** Completed exercise prescription IDs for current block */
  currentBlockCompletedExercises: number[]
  /** Whether session is already complete */
  isSessionComplete: boolean
}

interface Emits {
  (e: 'back'): void
  (e: 'restart'): void
  (e: 'complete-block'): void
  (e: 'select-exercise', index: number): void
  (e: 'toggle-exercise-complete', payload: { prescriptionId: number }): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Display computed values

const currentRouteName = computed(() => {
  if (!props.currentBlock) return ''
  return getRouteName(props.currentBlock.route)
})

const formattedTime = computed(() => {
  const seconds = props.elapsedSeconds
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
})

const currentBlockName = computed(() => {
  if (!props.currentBlock) return ''
  const role = props.currentBlock.role
  const names: Record<string, string> = {
    INITIUM: 'Initium',
    NUCLEUS: 'Nucleus',
    DEUTEROS_1: 'Deuteros',
    DEUTEROS_2: 'Deuteros',
    ATHLOS: 'Athlos',
    EPIKOS: 'Epikos',
  }
  return names[role] || role
})

const currentExerciseVideoUrl = computed(() => {
  // Video URLs will be added when exercise videos are available
  return null
})

const mobilityContractionColor = computed(() => {
  if (!props.currentBlock?.mobilityExercise) return 'grey'
  const c = props.currentBlock.mobilityExercise.contraction
  if (c === 'ISO') return 'orange'
  if (c === 'CON') return 'blue-grey'
  if (c === 'EXC') return 'teal'
  return 'grey'
})

const completeButtonLabel = computed(() => {
  if (props.isSessionComplete) {
    return 'Sesion Completada!'
  }
  return `Completar ${currentBlockName.value}`
})

// Event handlers

function onExerciseSelect(index: number): void {
  emit('select-exercise', index)
}

function onToggleExerciseComplete(payload: { prescriptionId: number }): void {
  emit('toggle-exercise-complete', payload)
}

function onCompleteBlock(): void {
  emit('complete-block')
}
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.block-progression {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.block-progression__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: $cream;
  border-bottom: 1px solid rgba($secondary, 0.2);
}

.block-progression__header-left {
  display: flex;
  align-items: center;
}

.block-progression__header-info {
  line-height: 1.3;
}

.block-progression__header-right {
  display: flex;
  align-items: center;
}

.block-progression__timer {
  font-family: 'Roboto Mono', monospace;
  color: #424242;
}

.block-progression__exercise-progress {
  padding-top: 4px;
}

.block-progression__content {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 100px; // Space for fixed button
}

.block-progression__mobility {
  .mobility-card {
    border-color: rgba(176, 141, 110, 0.3);
    background: rgba(176, 141, 110, 0.05);
  }
}

.block-progression__action {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  background: $cream;
  border-top: 1px solid rgba($secondary, 0.2);
  z-index: 100;
  max-width: 500px;
  margin-left: auto;
  margin-right: auto;
}
</style>
