<template>
  <div class="story-card">
    <!-- Top ~70% — Story area (video or name hero or block-complete prompt) -->
    <div class="story-card__video-area">
      <!-- All exercises completed — prompt to advance -->
      <div v-if="allExercisesCompleted && !readOnly" class="story-card__block-done">
        <q-icon name="check_circle" size="48px" color="positive" class="q-mb-md" />
        <div class="story-card__block-done-title">Bloque completo</div>
        <div class="story-card__block-done-subtitle">Listo para pasar al siguiente?</div>
        <div class="story-card__block-done-actions">
          <q-btn
            unelevated
            color="primary"
            label="Siguiente bloque"
            class="story-card__block-done-btn"
            @click="emit('complete-block')"
          />
          <q-btn
            flat
            color="white"
            label="Volver al ultimo ejercicio"
            icon="undo"
            class="story-card__block-done-btn"
            @click="emit('undo-last')"
          />
        </div>
      </div>

      <!-- Video when available -->
      <VideoPlaceholder
        v-else-if="activeVideoUrl"
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

      <!-- Tap zones — navigation only, hidden when block complete -->
      <template v-if="!allExercisesCompleted">
        <div class="story-card__tap-left" @click="emit('tap-prev')" />
        <div class="story-card__tap-right" @click="emit('tap-next')" />
      </template>
    </div>

    <!-- Bottom — Exercise detail panel -->
    <div class="story-card__detail">
      <!-- Mobility slide subtitle -->
      <div v-if="isMobilitySlide" class="story-card__mobility-label">DESCANSO ACTIVO</div>

      <!-- Exercise name -->
      <div class="story-card__exercise-name">{{ activeName }}</div>

      <!-- Dose + contraction on left, Completar on right -->
      <div class="story-card__info-action-row">
        <div class="story-card__info-left">
          <span class="story-card__info-value">{{ formattedDose }}</span>
          <span class="story-card__info-separator">&middot;</span>
          <span class="story-card__info-value">{{ formattedContraction }}</span>
        </div>
        <q-btn
          v-if="!isMobilitySlide && !readOnly"
          unelevated
          dense
          class="story-card__complete-btn"
          :color="isCompleted ? 'positive' : 'primary'"
          :label="isCompleted ? 'Completado' : 'Completar'"
          :icon="isCompleted ? 'check_circle' : undefined"
          @click="emit('complete')"
        />
      </div>

      <!-- Notes -->
      <div v-if="activeNotes" class="story-card__notes">{{ activeNotes }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Prescription, Block, BlockRole } from '../../types/session'
import { getBlockAccentColor } from '../../utils/blockColors'
import { formatDose } from '../../utils/formatDose'
import VideoPlaceholder from './VideoPlaceholder.vue'

interface Props {
  exercise: Prescription | null
  mobilityExercise: Block['mobilityExercise']
  isMobilitySlide: boolean
  blockRole: BlockRole
  isCompleted: boolean
  totalExercisesInBlock: number
  allExercisesCompleted: boolean
  readOnly?: boolean
}

interface Emits {
  (e: 'tap-next'): void
  (e: 'tap-prev'): void
  (e: 'complete'): void
  (e: 'complete-block'): void
  (e: 'undo-last'): void
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

const formattedDose = computed(() => {
  if (props.isMobilitySlide && props.mobilityExercise) {
    return formatDose(props.mobilityExercise)
  }
  return props.exercise ? formatDose(props.exercise) : '-'
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
  flex: 8;
  min-height: 0;
  background: #2e2a26;
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

// Block-complete prompt (replaces video)
.story-card__block-done {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1e1b18 0%, #2e2a26 50%, #3d3732 100%);
  padding: 24px;
  gap: 4px;
}

.story-card__block-done-title {
  font-family: 'Montserrat', sans-serif;
  font-size: 24px;
  font-weight: 700;
  color: white;
}

.story-card__block-done-subtitle {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 24px;
}

.story-card__block-done-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 320px;
}

.story-card__block-done-btn {
  border-radius: 8px;
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
  flex: 2;
  overflow: hidden;
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
  line-height: 1.3;
  margin-bottom: 8px;
}

.story-card__info-action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.story-card__info-left {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.story-card__info-value {
  font-size: 0.95rem;
  font-weight: 500;
  color: #3d3732;
}

.story-card__info-separator {
  color: rgba(0, 0, 0, 0.3);
}

.story-card__notes {
  font-size: 13px;
  font-style: italic;
  color: #5a5550;
  padding: 8px 0;
  border-top: 1px solid rgba($secondary, 0.1);
  margin-top: 8px;
}

.story-card__complete-btn {
  border-radius: 8px;
  flex-shrink: 0;
  padding-left: 20px;
  padding-right: 20px;
}
</style>
