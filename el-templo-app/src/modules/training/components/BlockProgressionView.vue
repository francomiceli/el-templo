<template>
  <div class="block-progression">
    <!-- Story area container -->
    <div class="block-progression__story-area">
      <!-- Segmented progress bar — overlaid at top -->
      <SegmentedProgressBar
        v-if="viewingBlock"
        :total-segments="totalSlideCount"
        :active-index="storyNav.currentIndex.value"
        class="block-progression__progress-bar"
      />

      <!-- Header overlay — over video with semi-transparent gradient -->
      <div class="block-progression__header-overlay">
        <div class="block-progression__header-gradient" />
        <div class="block-progression__header-content">
          <div class="block-progression__header-left">
            <q-btn flat round dense icon="arrow_back" color="white" @click="emit('back')" />
            <div class="block-progression__header-info q-ml-sm">
              <div class="block-progression__block-name">{{ viewingBlockName }}</div>
              <div class="block-progression__route-name">{{ viewingRouteName }}</div>
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
        v-if="viewingBlock"
        :exercise="currentSlideExercise"
        :mobility-exercise="viewingBlock.mobilityExercise"
        :is-mobility-slide="isMobilitySlide"
        :block-role="viewingBlock.role"
        :format="viewingBlock.format"
        :format-description="viewingBlock.formatDescription"
        :is-completed="isCurrentSlideCompleted"
        :total-exercises-in-block="viewingBlock.exercises.length"
        :all-exercises-completed="allExercisesCompleted"
        :read-only="isReviewingPrevious"
        @tap-next="storyNav.next()"
        @tap-prev="storyNav.prev()"
        @complete="onSlideComplete"
        @complete-block="emit('complete-block')"
        @undo-last="onUndoLast"
      />
    </div>

    <!-- Content area — below story, cream background -->
    <div class="block-progression__content">
      <!-- Compact exercise list — always visible -->
      <CompactExerciseList
        v-if="viewingBlock"
        :exercises="compactListData"
        :active-index="storyNav.currentIndex.value"
        :completed-ids="viewingCompletedIdsSet"
        @navigate="storyNav.goTo($event)"
      />

      <!-- Previous blocks navigation — only show when there are completed blocks -->
      <div v-if="completedBlocks.length > 0" class="block-progression__block-nav">
        <div class="block-progression__block-nav-label">Ver bloques anteriores</div>
        <div class="block-progression__block-chips">
          <button
            v-for="(block, idx) in completedBlocksList"
            :key="block.blockId"
            class="block-progression__block-chip"
            :class="{
              'block-progression__block-chip--active': idx === viewingCompletedChipIndex,
            }"
            @click="viewBlock(blockIndexOf(block))"
          >
            {{ BLOCK_NAMES[block.role] || block.role }}
            <q-icon name="check" size="12px" class="q-ml-xs" />
          </button>
        </div>
      </div>

      <!-- "Back to current" banner when reviewing — below chips -->
      <div
        v-if="isReviewingPrevious"
        class="block-progression__review-banner"
        @click="returnToCurrent"
      >
        <q-icon name="arrow_forward" size="16px" class="q-mr-xs" />
        Volver a {{ currentBlockName }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { Block, BlockRole, Prescription } from '../types/session'

// New player components
import SegmentedProgressBar from './player/SegmentedProgressBar.vue'
import StoryExerciseCard from './player/StoryExerciseCard.vue'
import CompactExerciseList from './player/CompactExerciseList.vue'

// Composables
import { useStoryNavigation } from '../composables/useStoryNavigation'

// Utils
import { getRouteName } from '../utils/routeNames'
import { formatDose, formatQuickDose } from '../utils/formatDose'

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
  playableBlocks: Block[]
  activeBlockIndex: number
  completedBlocks: BlockRole[]
  elapsedSeconds: number
  completedExercises: Record<string, number[]>
}

interface Emits {
  (e: 'back'): void
  (e: 'restart'): void
  (e: 'complete-block'): void
  (e: 'toggle-exercise-complete', payload: { prescriptionId: number }): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Viewing state — separate from active block progress
const viewingBlockIndex = ref(props.activeBlockIndex)

// Sync viewing index when active block advances (e.g. after completing a block)
watch(
  () => props.activeBlockIndex,
  (newIdx) => {
    viewingBlockIndex.value = newIdx
  },
)

const viewingBlock = computed<Block | null>(() => {
  return props.playableBlocks[viewingBlockIndex.value] ?? null
})

const isReviewingPrevious = computed(() => {
  return viewingBlockIndex.value !== props.activeBlockIndex
})

function viewBlock(idx: number): void {
  // Can view completed blocks and the current active block
  if (idx <= props.activeBlockIndex) {
    viewingBlockIndex.value = idx
    storyNav.reset()
  }
}

function returnToCurrent(): void {
  viewingBlockIndex.value = props.activeBlockIndex
  storyNav.reset()
}

// Only completed blocks for the chip list
const completedBlocksList = computed(() => {
  const activeBlock = props.playableBlocks[props.activeBlockIndex]
  return props.playableBlocks.filter(
    (b) => props.completedBlocks.includes(b.role) && b.blockId !== activeBlock?.blockId,
  )
})

// Which chip is highlighted when viewing a completed block
const viewingCompletedChipIndex = computed(() => {
  if (!viewingBlock.value) return -1
  return completedBlocksList.value.findIndex((b) => b.blockId === viewingBlock.value?.blockId)
})

function blockIndexOf(block: Block): number {
  return props.playableBlocks.findIndex((b) => b.blockId === block.blockId)
}

// Completed exercises for the currently VIEWED block
const viewingBlockCompletedExercises = computed<number[]>(() => {
  if (!viewingBlock.value) return []
  return props.completedExercises[viewingBlock.value.role] ?? []
})

const viewingCompletedIdsSet = computed(() => new Set(viewingBlockCompletedExercises.value))

// Total slide count: exercises + mobility (if present and non-INITIUM)
const totalSlideCount = computed(() => {
  if (!viewingBlock.value) return 0
  const exerciseCount = viewingBlock.value.exercises.length
  const hasMobility =
    viewingBlock.value.role !== 'INITIUM' && viewingBlock.value.mobilityExercise !== null
  return exerciseCount + (hasMobility ? 1 : 0)
})

// Story navigation
const totalSlidesRef = computed(() => totalSlideCount.value)
const storyNav = useStoryNavigation(totalSlidesRef)

// Reset story navigation when viewed block changes
watch(
  () => viewingBlock.value?.blockId,
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
  if (!viewingBlock.value) return false
  const exerciseCount = viewingBlock.value.exercises.length
  return (
    storyNav.currentIndex.value === exerciseCount && viewingBlock.value.mobilityExercise !== null
  )
})

// Current exercise for the active story slide (null when on mobility)
const currentSlideExercise = computed<Prescription | null>(() => {
  if (!viewingBlock.value || isMobilitySlide.value) return null
  return viewingBlock.value.exercises[storyNav.currentIndex.value] ?? null
})

// Whether the current slide's exercise is completed
const isCurrentSlideCompleted = computed(() => {
  if (isMobilitySlide.value) return false
  const exercise = currentSlideExercise.value
  if (!exercise) return false
  return viewingBlockCompletedExercises.value.includes(exercise.exerciseId)
})

// Whether all exercises in the viewed block are completed
const allExercisesCompleted = computed(() => {
  if (!viewingBlock.value) return false
  if (isReviewingPrevious.value) return false // Don't show block-complete prompt when reviewing
  const total = viewingBlock.value.exercises.length
  if (total === 0) return false
  return viewingBlock.value.exercises.every((ex) =>
    viewingBlockCompletedExercises.value.includes(ex.exerciseId),
  )
})

// Undo last completed exercise
function onUndoLast(): void {
  if (!viewingBlock.value || isReviewingPrevious.value) return
  for (let i = viewingBlock.value.exercises.length - 1; i >= 0; i--) {
    const ex = viewingBlock.value.exercises[i]
    if (viewingBlockCompletedExercises.value.includes(ex.exerciseId)) {
      storyNav.goTo(i)
      emit('toggle-exercise-complete', { prescriptionId: ex.exerciseId })
      return
    }
  }
}

// Compact list data
const compactListData = computed(() => {
  if (!viewingBlock.value) return []

  const items = viewingBlock.value.exercises.map((ex) => ({
    id: ex.exerciseId,
    name: ex.exerciseName,
    quickDose: formatQuickDose(ex),
    isMobility: false,
  }))

  if (viewingBlock.value.role !== 'INITIUM' && viewingBlock.value.mobilityExercise) {
    const mob = viewingBlock.value.mobilityExercise
    items.push({
      id: mob.exerciseId,
      name: mob.exerciseName,
      quickDose: formatDose(mob),
      isMobility: true,
    })
  }

  return items
})

// Computed display values
const viewingRouteName = computed(() => {
  if (!viewingBlock.value) return ''
  return getRouteName(viewingBlock.value.route)
})

const formattedTime = computed(() => {
  const s = props.elapsedSeconds
  const m = Math.floor(s / 60)
  return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
})

const viewingBlockName = computed(() => {
  if (!viewingBlock.value) return ''
  return BLOCK_NAMES[viewingBlock.value.role] || viewingBlock.value.role
})

const currentBlockName = computed(() => {
  const block = props.playableBlocks[props.activeBlockIndex]
  if (!block) return ''
  return BLOCK_NAMES[block.role] || block.role
})

// Handle exercise completion from story card (only on active block)
function onSlideComplete(): void {
  if (isReviewingPrevious.value) return
  const exercise = currentSlideExercise.value
  if (exercise) {
    emit('toggle-exercise-complete', { prescriptionId: exercise.exerciseId })
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

// Block navigation at bottom
.block-progression__block-nav {
  padding: 16px 12px;
  border-top: 1px solid rgba($secondary, 0.1);
}

.block-progression__block-nav-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 0, 0, 0.4);
  margin-bottom: 8px;
}

.block-progression__block-chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
}

.block-progression__block-chip {
  display: flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  border: 1.5px solid rgba($secondary, 0.2);
  background: transparent;
  color: rgba(0, 0, 0, 0.4);
  cursor: default;
  transition: all 0.2s ease;

  &--completed {
    cursor: pointer;
    color: rgba(0, 0, 0, 0.6);
    border-color: rgba($secondary, 0.3);
  }

  &--current {
    cursor: pointer;
  }

  &--active {
    background: $primary;
    color: white;
    border-color: $primary;
  }
}

// Review banner
.block-progression__review-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  background: $primary;
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}

// Content area below story
.block-progression__content {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 16px;
}
</style>
