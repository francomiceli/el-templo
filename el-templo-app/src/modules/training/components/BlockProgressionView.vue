<template>
  <div class="block-progression">
    <!-- Story area container -->
    <div class="block-progression__story-area">
      <!-- Segmented progress bar — overlaid at top -->
      <SegmentedProgressBar
        v-if="currentBlock"
        :total-segments="totalSlideCount"
        :active-index="storyNav.currentIndex.value"
        :completed-indices="segmentCompletedIndices"
        class="block-progression__progress-bar"
      />

      <!-- Header overlay — over video with semi-transparent gradient -->
      <div class="block-progression__header-overlay">
        <div class="block-progression__header-gradient" />
        <div class="block-progression__header-content">
          <div class="block-progression__header-left">
            <q-btn flat round dense icon="arrow_back" color="white" @click="emit('back')" />
            <div class="block-progression__header-info q-ml-sm">
              <div class="block-progression__block-name">{{ currentBlockName }}</div>
              <div class="block-progression__route-name">{{ currentRouteName }}</div>
            </div>
          </div>
          <div class="block-progression__header-right">
            <div class="block-progression__timer">{{ formattedTime }}</div>
            <q-btn flat round dense icon="more_vert" color="white">
              <q-menu>
                <q-list style="min-width: 150px">
                  <q-item v-close-popup clickable @click="emit('restart')">
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
      </div>

      <!-- Story Exercise Card — fills the story area -->
      <StoryExerciseCard
        v-if="currentBlock"
        :exercise="currentSlideExercise"
        :mobility-exercise="currentBlock.mobilityExercise"
        :is-mobility-slide="isMobilitySlide"
        :block-role="currentBlock.role"
        :is-completed="isCurrentSlideCompleted"
        :total-exercises-in-block="currentBlock.exercises.length"
        @tap-next="storyNav.next()"
        @tap-prev="storyNav.prev()"
        @complete="onSlideComplete"
      />
    </div>

    <!-- Content area — below story, cream background -->
    <div class="block-progression__content">
      <!-- Compact exercise list — always visible -->
      <CompactExerciseList
        v-if="currentBlock"
        :exercises="compactListData"
        :active-index="storyNav.currentIndex.value"
        :completed-ids="completedIdsSet"
        @navigate="storyNav.goTo($event)"
      />
    </div>

    <!-- Action area: Complete Block button -->
    <div class="block-progression__action">
      <q-btn
        color="primary"
        unelevated
        :label="completeButtonLabel"
        class="full-width"
        size="lg"
        @click="handleCompleteBlock"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { useQuasar } from 'quasar'
import type { Block, BlockRole, Prescription } from '../types/session'

// New player components
import SegmentedProgressBar from './player/SegmentedProgressBar.vue'
import StoryExerciseCard from './player/StoryExerciseCard.vue'
import CompactExerciseList from './player/CompactExerciseList.vue'

// Composables
import { useStoryNavigation } from '../composables/useStoryNavigation'

// Utils
import { getRouteName } from '../utils/routeNames'

const BLOCK_NAMES: Record<string, string> = {
  INITIUM: 'Initium',
  NUCLEUS: 'Nucleus',
  DEUTEROS_1: 'Deuteros',
  DEUTEROS_2: 'Deuteros',
  ATHLOS: 'Athlos',
  EPIKOS: 'Epikos',
}

interface Props {
  dayName: string
  currentBlock: Block | null
  completedBlocks: BlockRole[]
  elapsedSeconds: number
  currentBlockCompletedExercises: number[]
  isSessionComplete: boolean
}

interface Emits {
  (e: 'back'): void
  (e: 'restart'): void
  (e: 'complete-block'): void
  (e: 'toggle-exercise-complete', payload: { prescriptionId: number }): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const $q = useQuasar()

// Total slide count: exercises + mobility (if present and non-INITIUM)
const totalSlideCount = computed(() => {
  if (!props.currentBlock) return 0
  const exerciseCount = props.currentBlock.exercises.length
  const hasMobility =
    props.currentBlock.role !== 'INITIUM' && props.currentBlock.mobilityExercise !== null
  return exerciseCount + (hasMobility ? 1 : 0)
})

// Story navigation
const totalSlidesRef = computed(() => totalSlideCount.value)
const storyNav = useStoryNavigation(totalSlidesRef)

// Reset story navigation when block changes
watch(
  () => props.currentBlock?.blockId,
  () => {
    storyNav.reset()
  },
)

// Cleanup
onUnmounted(() => {
  storyNav.cleanup()
})

// Whether current slide is the mobility slide
const isMobilitySlide = computed(() => {
  if (!props.currentBlock) return false
  const exerciseCount = props.currentBlock.exercises.length
  return (
    storyNav.currentIndex.value === exerciseCount && props.currentBlock.mobilityExercise !== null
  )
})

// Current exercise for the active story slide (null when on mobility)
const currentSlideExercise = computed<Prescription | null>(() => {
  if (!props.currentBlock || isMobilitySlide.value) return null
  return props.currentBlock.exercises[storyNav.currentIndex.value] ?? null
})

// Whether the current slide's exercise is completed
const isCurrentSlideCompleted = computed(() => {
  if (isMobilitySlide.value) return false
  const exercise = currentSlideExercise.value
  if (!exercise) return false
  return props.currentBlockCompletedExercises.includes(exercise.exerciseId)
})

// Set of completed exercise IDs (for CompactExerciseList)
const completedIdsSet = computed(() => new Set(props.currentBlockCompletedExercises))

// Set of completed segment indices (for SegmentedProgressBar)
const segmentCompletedIndices = computed(() => {
  if (!props.currentBlock) return new Set<number>()
  const indices = new Set<number>()
  props.currentBlock.exercises.forEach((ex, index) => {
    if (props.currentBlockCompletedExercises.includes(ex.exerciseId)) {
      indices.add(index)
    }
  })
  return indices
})

// Compact list data: transform exercises + mobility into list format
const compactListData = computed(() => {
  if (!props.currentBlock) return []

  const items = props.currentBlock.exercises.map((ex) => ({
    id: ex.exerciseId,
    name: ex.exerciseName,
    quickDose: formatQuickDose(ex),
    isMobility: false,
  }))

  // Add mobility as last item if present
  if (props.currentBlock.role !== 'INITIUM' && props.currentBlock.mobilityExercise) {
    const mob = props.currentBlock.mobilityExercise
    let dose = ''
    if (mob.reps !== null && mob.reps > 0) dose = `${mob.reps} reps`
    else if (mob.seconds !== null && mob.seconds > 0) dose = `${mob.seconds}s`

    items.push({
      id: mob.exerciseId,
      name: mob.exerciseName,
      quickDose: dose,
      isMobility: true,
    })
  }

  return items
})

// Computed display values
const currentRouteName = computed(() => {
  if (!props.currentBlock) return ''
  return getRouteName(props.currentBlock.route)
})

const formattedTime = computed(() => {
  const s = props.elapsedSeconds
  const m = Math.floor(s / 60)
  return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
})

const currentBlockName = computed(() => {
  if (!props.currentBlock) return ''
  return BLOCK_NAMES[props.currentBlock.role] || props.currentBlock.role
})

const completeButtonLabel = computed(() => {
  if (props.isSessionComplete) return 'Sesion Completada!'
  return `Completar ${currentBlockName.value}`
})

// Format quick dose string for compact list
function formatQuickDose(exercise: Prescription): string {
  if (exercise.notes === 'PAUSA') return 'PAUSA'
  if (exercise.reps !== null) {
    if (exercise.increment) {
      return `${exercise.reps} - ${exercise.reps + exercise.increment} - ...`
    }
    const repsText = exercise.repsMax
      ? `${exercise.reps} \u00B7 ${exercise.repsMax}`
      : `${exercise.reps}`
    return `${repsText} reps`
  } else if (exercise.seconds !== null) {
    if (exercise.increment) {
      return `${exercise.seconds} - ${exercise.seconds + exercise.increment} - ...`
    }
    const secsText = exercise.secondsMax
      ? `${exercise.seconds} \u00B7 ${exercise.secondsMax}`
      : `${exercise.seconds}`
    return `${secsText}s`
  }
  return '-'
}

// Handle exercise completion from story card
function onSlideComplete(): void {
  const exercise = currentSlideExercise.value
  if (exercise) {
    emit('toggle-exercise-complete', { prescriptionId: exercise.exerciseId })
  }
}

/**
 * Handle complete block button press.
 * If exercises are incomplete, show confirmation dialog before emitting.
 */
function handleCompleteBlock(): void {
  const total = props.currentBlock?.exercises.length ?? 0
  const completed = props.currentBlockCompletedExercises.length
  const incomplete = total - completed
  if (incomplete > 0) {
    $q.dialog({
      title: 'Ejercicios sin completar',
      message: `Hay ${incomplete} ejercicio${incomplete > 1 ? 's' : ''} sin completar. Completar bloque de todas formas?`,
      cancel: { label: 'Cancelar', flat: true },
      ok: { label: 'Completar', color: 'primary' },
    }).onOk(() => emit('complete-block'))
  } else {
    emit('complete-block')
  }
}
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.block-progression {
  display: flex;
  flex-direction: column;
  height: 100%;
}

// Story area — contains video, progress bar, header overlay
.block-progression__story-area {
  position: relative;
  height: 60vh;
  min-height: 300px;
  flex-shrink: 0;
  background: #2e2a26;
}

// Segmented progress bar overlay
.block-progression__progress-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
}

// Header overlay on top of video
.block-progression__header-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  pointer-events: none;
}

.block-progression__header-gradient {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 80px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6) 0%, transparent 100%);
}

.block-progression__header-content {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28px 12px 8px;
  pointer-events: auto;
}

.block-progression__header-left {
  display: flex;
  align-items: center;
}

.block-progression__header-info {
  line-height: 1.3;
}

.block-progression__block-name {
  font-family: 'Montserrat', sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: white;
}

.block-progression__route-name {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.block-progression__header-right {
  display: flex;
  align-items: center;
}

.block-progression__timer {
  font-family: 'Roboto Mono', monospace;
  font-size: 16px;
  color: white;
  margin-right: 4px;
}

// Content area below story
.block-progression__content {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 100px; // Space for fixed button
}

// Fixed action button at bottom
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
