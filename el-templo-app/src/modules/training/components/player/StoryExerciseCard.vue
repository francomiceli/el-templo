<template>
  <div class="story-card">
    <!-- Top ~70% — Story area (video or name hero) -->
    <div class="story-card__video-area">
      <!-- Video when available -->
      <VideoPlaceholder
        v-if="activeVideoUrl"
        :video-url="activeVideoUrl"
        class="story-card__video"
      />

      <!-- Name Hero fallback when no video -->
      <div v-else class="story-card__name-hero">
        <div class="story-card__name-hero-text">
          {{ activeName }}
        </div>
        <q-badge
          :color="getBlockAccentColor(blockRole)"
          class="story-card__name-hero-badge"
          :label="activeContraction"
        />
      </div>

      <!-- Tap zones — navigation only, NEVER marks complete -->
      <div class="story-card__tap-left" @click="emit('tap-prev')" />
      <div class="story-card__tap-right" @click="emit('tap-next')" />
    </div>

    <!-- Bottom ~30% — Exercise detail panel -->
    <div class="story-card__detail">
      <!-- Mobility slide subtitle -->
      <div v-if="isMobilitySlide" class="story-card__mobility-label">DESCANSO ACTIVO</div>

      <!-- Exercise name -->
      <div class="story-card__exercise-name">{{ activeName }}</div>

      <!-- Cantidad (formerly Dosis) -->
      <div class="story-card__info-row">
        <span class="story-card__info-label">Cantidad</span>
        <span class="story-card__info-value">{{ formattedDose }}</span>
      </div>

      <!-- Contraction type -->
      <div class="story-card__info-row">
        <span class="story-card__info-label">Contraccion</span>
        <span class="story-card__info-value">{{ formattedContraction }}</span>
      </div>

      <!-- Notes -->
      <div v-if="activeNotes" class="story-card__notes">{{ activeNotes }}</div>

      <!-- Position (not shown for mobility) -->
      <div v-if="!isMobilitySlide && exercise" class="story-card__position">
        {{ exercise.sortOrder + 1 }} de {{ totalExercisesInBlock }}
      </div>

      <!-- Completar button — ONLY way to mark complete per CONTEXT.md -->
      <q-btn
        v-if="!isMobilitySlide"
        unelevated
        class="story-card__complete-btn full-width q-mt-sm"
        :color="isCompleted ? 'positive' : 'primary'"
        :label="isCompleted ? 'Completado' : 'Completar'"
        :icon="isCompleted ? 'check_circle' : undefined"
        size="lg"
        @click="emit('complete')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Prescription, Block, BlockRole } from '../../types/session'
import { getBlockAccentColor } from '../../utils/blockColors'
import VideoPlaceholder from './VideoPlaceholder.vue'

interface Props {
  /** Current exercise prescription (null for mobility slide) */
  exercise: Prescription | null
  /** Mobility exercise data (used when isMobilitySlide is true) */
  mobilityExercise: Block['mobilityExercise']
  /** Whether this is the mobility slide */
  isMobilitySlide: boolean
  /** Block role for accent colors */
  blockRole: BlockRole
  /** Whether this exercise is marked complete */
  isCompleted: boolean
  /** Total exercises in the block (for "X de Y" display) */
  totalExercisesInBlock: number
}

interface Emits {
  (e: 'tap-next'): void
  (e: 'tap-prev'): void
  (e: 'complete'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Active data: exercise or mobility
const activeName = computed(() => {
  if (props.isMobilitySlide && props.mobilityExercise) {
    return props.mobilityExercise.exerciseName
  }
  return props.exercise?.exerciseName ?? ''
})

const activeVideoUrl = computed(() => {
  if (props.isMobilitySlide && props.mobilityExercise) {
    return props.mobilityExercise.videoUrl
  }
  return props.exercise?.videoUrl ?? null
})

const activeContraction = computed(() => {
  if (props.isMobilitySlide && props.mobilityExercise) {
    return props.mobilityExercise.contraction
  }
  return props.exercise?.contraction ?? ''
})

const activeNotes = computed(() => {
  if (props.isMobilitySlide && props.mobilityExercise) {
    return props.mobilityExercise.notes
  }
  return props.exercise?.notes ?? null
})

const CONTRACTION_NAMES: Record<string, string> = {
  CON: 'Concentrica',
  EXC: 'Excentrica',
  ISO: 'Isometrica',
}

const formattedContraction = computed(() => {
  return CONTRACTION_NAMES[activeContraction.value] ?? activeContraction.value
})

/**
 * Format the dose/cantidad for display
 */
const formattedDose = computed(() => {
  if (props.isMobilitySlide && props.mobilityExercise) {
    const mob = props.mobilityExercise
    if (mob.reps !== null && mob.reps > 0) return `${mob.reps} repeticiones`
    if (mob.seconds !== null && mob.seconds > 0) return `${mob.seconds} segundos`
    return '-'
  }

  const ex = props.exercise
  if (!ex) return '-'
  if (ex.notes === 'PAUSA') return 'PAUSA'

  if (ex.reps !== null) {
    if (ex.increment) {
      const start = ex.reps
      const inc = ex.increment
      return `${start} - ${start + inc} - ${start + inc * 2} - ...`
    }
    const repsText = ex.repsMax ? `${ex.reps} \u00B7 ${ex.repsMax}` : `${ex.reps}`
    return `${repsText} repeticiones`
  }

  if (ex.seconds !== null) {
    if (ex.increment) {
      const start = ex.seconds
      const inc = ex.increment
      return `${start} - ${start + inc} - ${start + inc * 2} - ...`
    }
    const secsText = ex.secondsMax ? `${ex.seconds} \u00B7 ${ex.secondsMax}` : `${ex.seconds}`
    return `${secsText} segundos`
  }

  return '-'
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.story-card {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.story-card__video-area {
  position: relative;
  height: 60vh;
  min-height: 300px;
  background: #2e2a26;
  flex-shrink: 0;
}

.story-card__video {
  width: 100%;
  height: 100%;

  :deep(.video-container) {
    height: 100%;
  }
}

.story-card__name-hero {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1e1b18 0%, #2e2a26 50%, #3d3732 100%);
  padding: 24px;
  gap: 12px;
}

.story-card__name-hero-text {
  font-family: 'Montserrat', sans-serif;
  font-size: 28px;
  font-weight: 600;
  color: white;
  text-align: center;
  line-height: 1.3;
}

.story-card__name-hero-badge {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.5px;
  padding: 4px 12px;
}

// Invisible tap zones
.story-card__tap-left,
.story-card__tap-right {
  position: absolute;
  top: 0;
  bottom: 0;
  cursor: pointer;
  z-index: 5;
  -webkit-tap-highlight-color: transparent;
}

.story-card__tap-left {
  left: 0;
  width: 30%;
}

.story-card__tap-right {
  right: 0;
  width: 70%;
}

// Detail panel
.story-card__detail {
  background: $cream;
  padding: 16px;
  border-top: 1px solid rgba($secondary, 0.15);
  flex: 1;
  overflow-y: auto;
}

.story-card__mobility-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: rgba(0, 0, 0, 0.45);
  margin-bottom: 4px;
}

.story-card__exercise-name {
  font-size: 1.25rem;
  font-weight: 700;
  color: #3d3732;
  margin-bottom: 12px;
  line-height: 1.3;
}

.story-card__info-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}

.story-card__info-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: rgba(0, 0, 0, 0.5);
}

.story-card__info-value {
  font-size: 0.95rem;
  font-weight: 500;
  color: #3d3732;
}

.story-card__notes {
  font-size: 13px;
  font-style: italic;
  color: #5a5550;
  padding: 8px 0;
  border-top: 1px solid rgba($secondary, 0.1);
  margin-top: 4px;
}

.story-card__position {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.4);
  margin-top: 4px;
}

.story-card__complete-btn {
  border-radius: 8px;
}
</style>
