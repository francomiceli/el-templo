<template>
  <div class="story-card">
    <!-- Story area (video or name hero or block-complete prompt). El prompt solo existe en el último
         bloque (o en modo libre): entre bloques la pantalla de transición ocupa su lugar. -->
    <div class="story-card__video-area">
      <!-- All exercises completed — cierre de la sesión o del bloque libre -->
      <div v-if="showBlockDone" class="story-card__block-done">
        <q-icon name="check_circle" size="48px" class="story-card__block-done-icon q-mb-md" />
        <div class="story-card__block-done-title">{{ blockDoneTitle }}</div>
        <div class="story-card__block-done-subtitle">{{ blockDoneSubtitle }}</div>
        <div class="story-card__block-done-actions">
          <q-btn
            unelevated
            color="primary"
            :label="blockDoneButtonLabel"
            class="story-card__block-done-btn"
            @click="emit('complete-block')"
          />
          <q-btn
            flat
            color="white"
            label="Volver al último ejercicio"
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

      <!-- Pie con el ejercicio de ahora sobre un fade a negro (solo con video y sin cierre de bloque) -->
      <StoryFooter v-if="footer" :footer="footer" />

      <!-- Tap zones — navigation only, hidden when block complete -->
      <template v-if="!allExercisesCompleted">
        <div class="story-card__tap-left" @click="emit('tap-prev')" />
        <div class="story-card__tap-right" @click="emit('tap-next')" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Prescription, Block, BlockRole } from '../../types/session'
import { getBlockAccentColor } from '../../utils/blockColors'
import { playerFooter } from '../../utils/playerFooter'
import StoryFooter from './StoryFooter.vue'
import VideoPlaceholder from './VideoPlaceholder.vue'

interface Props {
  exercise: Prescription | null
  mobilityExercise: Block['mobilityExercise']
  isMobilitySlide: boolean
  blockRole: BlockRole
  allExercisesCompleted: boolean
  readOnly?: boolean
  /** Fase 197 D-15: en 'free' el bloque único siempre es el último. */
  mode?: 'session' | 'free'
  /**
   * Es el último bloque de la sesión. Si no lo es, no hay "Bloque completo" acá: al tildar el
   * último ejercicio aparece la pantalla de transición (DayPlayer / GoalPlanSession).
   */
  isLastBlock?: boolean
  /** Dosis compacta del slide actual (ejercicio o movilidad), para la cantidad del pie */
  quickDose?: string
}

interface Emits {
  (e: 'tap-next'): void
  (e: 'tap-prev'): void
  (e: 'complete-block'): void
  (e: 'undo-last'): void
}

const props = withDefaults(defineProps<Props>(), {
  readOnly: false,
  mode: 'session',
  isLastBlock: true,
  quickDose: '',
})
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

const isFreeMode = computed(() => props.mode === 'free')

// Fase 197 D-15: en modo libre el bloque único siempre es el último
const isFinal = computed(() => isFreeMode.value || props.isLastBlock)

const showBlockDone = computed(
  () => props.allExercisesCompleted && !props.readOnly && isFinal.value,
)

// Pie sobre el video: el ejercicio (o la movilidad) de ahora. Sin video o con el bloque completo, null
const footer = computed(() =>
  playerFooter({
    isMobilitySlide: props.isMobilitySlide,
    exercise: props.exercise
      ? {
          name: props.exercise.exerciseName,
          contraction: props.exercise.contraction,
          quickDose: props.quickDose,
        }
      : null,
    mobility: props.mobilityExercise
      ? {
          name: props.mobilityExercise.exerciseName,
          contraction: props.mobilityExercise.contraction,
          quickDose: props.quickDose,
        }
      : null,
    hasVideo: !!activeVideoUrl.value,
    blockDone: showBlockDone.value,
  }),
)

const blockDoneTitle = computed(() => {
  if (isFreeMode.value) return 'Bloque completo'
  return 'Sesión completa'
})

const blockDoneSubtitle = computed(() => {
  if (isFreeMode.value) return 'Hacé una elongación antes de terminar.'
  return 'Hacé una elongación final antes de terminar'
})

const blockDoneButtonLabel = computed(() => {
  return isFreeMode.value ? 'Ver resumen' : 'Ver resumen de sesión'
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';
@import 'src/css/premium-card';

.story-card {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.story-card__video-area {
  position: relative;
  flex: 1;
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

.story-card__block-done-icon {
  // Fase 197 D-16: ícono sólido sobre oscuro (antes $positive #3b7249, 2.60:1 medido)
  color: $pd-sage-on-dark;
}

.story-card__block-done-title {
  font-family: 'Montserrat', sans-serif;
  font-size: 24px;
  font-weight: 700;
  color: white;
}

.story-card__block-done-subtitle {
  font-size: 15px;
  // Fase 197 D-16: texto sólido sobre oscuro (antes rgba(255,255,255,.7))
  color: $pd-cream-2;
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
</style>
