<template>
  <div class="block-progression">
    <!-- Story area container -->
    <div class="block-progression__story-area">
      <!-- Segmented progress bar — overlaid at top -->
      <SegmentedProgressBar
        v-if="viewingBlock"
        :total-segments="totalSlideCount"
        :active-index="storyNav.currentIndex.value"
        :completed-indices="completedSlideIndices"
        class="block-progression__progress-bar"
      />

      <!-- Header overlay — over video with semi-transparent gradient -->
      <div class="block-progression__header-overlay">
        <div class="block-progression__header-gradient" />
        <div class="block-progression__header-content">
          <div class="block-progression__header-left">
            <q-btn
              flat
              round
              dense
              icon="arrow_back"
              color="white"
              class="block-progression__back"
              aria-label="Volver"
              @click="emit('back')"
            />
          </div>
          <div class="block-progression__header-right">
            <!-- El rol (en libre, "Bloque libre · ROL") chico arriba de la ruta / nombre del bloque -->
            <div class="block-progression__titles">
              <div class="block-progression__kicker">{{ headerLines.kicker }}</div>
              <div class="block-progression__route-name">{{ headerLines.name }}</div>
            </div>
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
        :all-exercises-completed="allExercisesCompleted"
        :read-only="isReviewingPrevious"
        :mode="mode"
        :is-last-block="isFinalBlock"
        :show-final-prompt="showFinalPrompt"
        :quick-dose="currentSlideQuickDose"
        @tap-next="storyNav.next()"
        @tap-prev="storyNav.prev()"
        @complete-block="emit('complete-block')"
        @undo-last="onUndoLast"
      />
    </div>

    <!-- Content area — below story: hoja blanca (sketch 025 B). Borde superior recto -->
    <div class="block-progression__content">
      <!-- Fila del formato: nombre + definición a la izquierda y el cronómetro a la derecha (sketch
           026). La fila existe aunque el bloque no traiga formato: el reloj no puede desaparecer.
           Separador simple de 1 px debajo (D-11 en libre, todos los parámetros en sesión). -->
      <div v-if="viewingBlock" class="block-progression__format">
        <div class="block-progression__format-info">
          <template v-if="viewingBlock.format">
            <div class="block-progression__format-line">
              <span class="block-progression__format-name">{{ formatParts.name }}</span>
              <span v-if="formatParts.detail" class="block-progression__format-detail">
                · {{ formatParts.detail }}
              </span>
            </div>
            <div v-if="viewingBlock.formatDescription" class="block-progression__format-desc">
              {{ viewingBlock.formatDescription }}
            </div>
          </template>
        </div>
        <div class="block-progression__timer-wrap">
          <!-- Reloj del FORMATO del bloque (AMRAP regresivo, EMOM por minuto…), como la TV -->
          <div class="block-progression__timer" aria-label="Reloj del bloque">
            {{ blockTimer.time }}
          </div>
          <div v-if="blockTimer.label" class="block-progression__timer-label">
            {{ blockTimer.label }}
          </div>
          <!-- Fase 197 D-12: barrita dorada hasta 10', solo en modo libre con AURA disponible -->
          <div
            v-if="showAuraBar"
            class="block-progression__aura-bar"
            role="progressbar"
            aria-label="Minutos para sumar AURA"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="auraBarPercent"
          >
            <i :style="{ width: auraBarPercent + '%' }" />
          </div>
        </div>
      </div>

      <!-- Qué trae el bloque, arriba de los músculos -->
      <div v-if="viewingBlock" class="block-progression__count">{{ blockContent }}</div>

      <!-- Sketch 027 D: músculos del ejercicio de ahora (por su ruta) -->
      <PlayerCuerpo v-if="viewingBlock" :ruta-slug="currentSlideRutaSlug" />

      <!-- Per-exercise difficulty adjustment (más fácil / más difícil) -->
      <div v-if="viewingBlock && canAdjustCurrentSlide" class="block-progression__adjust">
        <!-- Objective advance criterion (R5, D-07) — complements the fase-131 tap -->
        <div class="block-progression__adjust-criterion">{{ advanceCriterion }}</div>
        <div class="block-progression__adjust-row">
          <q-btn
            outline
            dense
            no-caps
            class="block-progression__adjust-btn"
            color="secondary"
            icon="south"
            label="más fácil"
            :disable="isAdjusting"
            @click="onAdjust('down')"
          />
          <q-btn
            outline
            dense
            no-caps
            class="block-progression__adjust-btn"
            color="primary"
            icon-right="north"
            label="más difícil"
            :disable="isAdjusting"
            @click="onAdjust('up')"
          />
        </div>
      </div>

      <!-- Completar: pegado abajo mientras se scrollea la lista -->
      <div
        v-if="viewingBlock && !isMobilitySlide && !isReviewingPrevious"
        class="block-progression__cta"
      >
        <q-btn
          unelevated
          no-caps
          class="block-progression__complete-btn"
          :class="{ 'block-progression__complete-btn--done': isCurrentSlideCompleted }"
          :label="isCurrentSlideCompleted ? 'Completado' : 'Completar ejercicio'"
          :icon="isCurrentSlideCompleted ? 'check_circle' : undefined"
          @click="onSlideComplete"
        />
      </div>

      <!-- Change Deuteros option -->
      <div
        v-if="mode === 'session' && isViewingDeuteros && !isReviewingPrevious"
        class="block-progression__change-deuteros"
        @click="emit('change-deuteros')"
      >
        <q-icon name="arrow_back" size="16px" class="q-mr-xs" />
        Cambiar bloque Deuteros
      </div>

      <!-- Previous blocks navigation — only show when there are completed blocks -->
      <div
        v-if="mode === 'session' && completedBlocks.length > 0"
        class="block-progression__block-nav"
      >
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
            <q-icon name="arrow_back" size="12px" class="q-mr-xs" />
            {{ playerRoleLabel(block.role) }}
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
import PlayerCuerpo from './player/PlayerCuerpo.vue'

// Composables
import { useStoryNavigation } from '../composables/useStoryNavigation'

// Utils
import { IN_SESSION_ADJUST_ENABLED } from 'src/config/featureFlags'
import { formatDose, formatQuickDose, isPyramidBlock } from '../utils/formatDose'
import { blockTimerView } from '../utils/blockTimer'
import {
  playerBlockContent,
  playerFormatParts,
  playerHeaderLines,
  playerRoleLabel,
} from '../utils/playerHeader'

interface Props {
  dayName: string
  playableBlocks: Block[]
  activeBlockIndex: number
  completedBlocks: BlockRole[]
  elapsedSeconds: number
  completedExercises: Record<string, number[]>
  isAdjusting?: boolean
  /**
   * Fase 197 D-15: 'free' = bloque libre (encabezado propio, sin bloques anteriores, sin cambiar
   * Deuteros y sin ajuste de dificultad). El default es el comportamiento de la sesión completa.
   */
  mode?: 'session' | 'free'
  /** Fase 197 D-12: segundos para sumar AURA (600). `null` = sin barrita. Solo se usa en modo libre. */
  auraGoalSeconds?: number | null
  /**
   * El bloque activo es el último de la sesión: ahí queda el cierre "Sesión completa" dentro de la
   * historia. En los demás, la página muestra la pantalla de transición al tildar el último
   * ejercicio. Default `true` (modo libre y quien no lo pase conservan el cierre de siempre).
   */
  isFinalBlock?: boolean
  /** Cierre "Sesión completa" dentro del video al tildar todo el último bloque (DayPlayer lo apaga) */
  showFinalPrompt?: boolean
}

interface Emits {
  (e: 'back'): void
  (e: 'restart'): void
  (e: 'complete-block'): void
  (e: 'toggle-exercise-complete', payload: { prescriptionId: number }): void
  (e: 'change-deuteros'): void
  (e: 'adjust', payload: { exerciseId: number; direction: 'up' | 'down'; blockId: string }): void
}

const props = withDefaults(defineProps<Props>(), {
  isAdjusting: false,
  mode: 'session',
  auraGoalSeconds: null,
  isFinalBlock: true,
  showFinalPrompt: true,
})
const emit = defineEmits<Emits>()

const isAdjusting = computed(() => props.isAdjusting)

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

const isViewingDeuteros = computed(() => {
  const role = viewingBlock.value?.role
  return role === 'DEUTEROS_1' || role === 'DEUTEROS_2'
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

// Fase 197 D-15: "Seguir entrenando" vacía el bloque completado en el composable; el bloque mostrado
// sigue siendo el mismo (no cambia el blockId), así que se vuelve al primer ejercicio a mano.
watch(
  () => props.completedBlocks.length,
  (len, prev) => {
    if (props.mode === 'free' && len === 0 && prev > 0) {
      storyNav.reset()
    }
  },
)

// Cleanup
onUnmounted(() => {
  storyNav.cleanup()
})

// Segmentos de la barra de arriba ya completados (los ejercicios van primero; la movilidad no se tilda)
const completedSlideIndices = computed<number[]>(() => {
  const block = viewingBlock.value
  if (!block) return []
  return block.exercises.flatMap((ex, i) =>
    viewingBlockCompletedExercises.value.includes(ex.exerciseId) ? [i] : [],
  )
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

// Prefetch next slide's video so it's cached when the user taps next
const prefetchedUrls = new Set<string>()

watch(
  () => storyNav.currentIndex.value,
  (idx) => {
    if (!viewingBlock.value) return
    const nextIdx = idx + 1
    const exercises = viewingBlock.value.exercises
    let nextUrl: string | null = null

    if (nextIdx < exercises.length) {
      nextUrl = exercises[nextIdx].videoUrl
    } else if (nextIdx === exercises.length && viewingBlock.value.mobilityExercise) {
      nextUrl = viewingBlock.value.mobilityExercise.videoUrl
    }

    if (nextUrl && !prefetchedUrls.has(nextUrl)) {
      prefetchedUrls.add(nextUrl)
      const link = document.createElement('link')
      link.rel = 'prefetch'
      link.as = 'video'
      link.href = nextUrl
      document.head.appendChild(link)
    }
  },
  { immediate: true },
)

// Qué trae el bloque ("4 ejercicios + 1 de flexibilidad"), debajo de la definición del formato
const blockContent = computed(() =>
  viewingBlock.value ? playerBlockContent(viewingBlock.value) : '',
)

// Reloj del bloque: arranca cuando el bloque pasa a ser el activo (segundo de la sesión en ese
// momento) y corre con el reloj de la sesión, así hereda sus pausas. Cada bloque guarda su arranque:
// al mirar un bloque anterior se ve su propio reloj.
const blockStartSeconds = ref<Record<string, number>>({})

watch(
  () => props.playableBlocks[props.activeBlockIndex]?.blockId,
  (blockId) => {
    if (blockId && blockStartSeconds.value[blockId] === undefined) {
      blockStartSeconds.value[blockId] = props.elapsedSeconds
    }
  },
  { immediate: true },
)

// Modo libre, "Seguir entrenando": el mismo bloque vuelve a empezar, y su reloj también
watch(
  () => props.completedBlocks.length,
  (len, prev) => {
    const blockId = props.playableBlocks[props.activeBlockIndex]?.blockId
    if (props.mode === 'free' && len === 0 && prev > 0 && blockId) {
      blockStartSeconds.value[blockId] = props.elapsedSeconds
    }
  },
)

const blockTimer = computed(() => {
  const block = viewingBlock.value
  if (!block) return { time: '00:00', label: '' }
  const start = blockStartSeconds.value[block.blockId] ?? props.elapsedSeconds
  return blockTimerView(block.timerSpec, (props.elapsedSeconds - start) * 1000)
})

// Formato en dos líneas para la cabecera de la hoja
const formatParts = computed(() => {
  if (!viewingBlock.value) return { name: '', detail: '' }
  return playerFormatParts(viewingBlock.value, props.mode)
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

// La pantalla de transición (DayPlayer / GoalPlanSession) llama a esto desde "Volver al último
// ejercicio": mismo gesto que el botón de la historia (va al ejercicio y lo destilda).
defineExpose({ undoLast: onUndoLast })

// Dosis compacta del slide actual (ejercicio o movilidad): alimenta la cantidad del pie del video
const currentSlideQuickDose = computed(() => {
  const block = viewingBlock.value
  if (!block) return ''
  if (isMobilitySlide.value && block.mobilityExercise) return formatDose(block.mobilityExercise)
  const exercise = currentSlideExercise.value
  return exercise ? formatQuickDose(exercise, isPyramidBlock(block)) : ''
})

// Ruta del slide actual (ejercicio o movilidad) para la figura de PlayerCuerpo
const currentSlideRutaSlug = computed(() => {
  const block = viewingBlock.value
  if (!block) return null
  if (isMobilitySlide.value) return block.mobilityExercise?.rutaSlug ?? null
  return currentSlideExercise.value?.rutaSlug ?? null
})

// Computed display values
const headerLines = computed(() => {
  if (!viewingBlock.value) return { kicker: '', name: '' }
  return playerHeaderLines(viewingBlock.value, props.mode)
})

// Fase 197 D-12: la barrita solo existe en modo libre y con una meta de AURA válida
const showAuraBar = computed(() => {
  return (
    props.mode === 'free' && typeof props.auraGoalSeconds === 'number' && props.auraGoalSeconds > 0
  )
})

const auraBarPercent = computed(() => {
  const goal = props.auraGoalSeconds
  if (typeof goal !== 'number' || goal <= 0) return 0
  return Math.round(Math.min(props.elapsedSeconds / goal, 1) * 100)
})

const currentBlockName = computed(() => {
  const block = props.playableBlocks[props.activeBlockIndex]
  if (!block) return ''
  return playerRoleLabel(block.role)
})

// Handle exercise completion from story card (only on active block)
function onSlideComplete(): void {
  if (isReviewingPrevious.value) return
  const exercise = currentSlideExercise.value
  if (exercise) {
    emit('toggle-exercise-complete', { prescriptionId: exercise.exerciseId })
  }
}

// Difficulty adjustment is only available for a real (non-mobility,
// non-reviewing) exercise slide of the active block. Gated off for members
// until the v5.1 progression-graph rollout runs (featureFlags) — without it the
// swap finds no neighbour and the control would be a confusing no-op. Hiding
// this also hides the objective-criterion label that lives in the same block.
const canAdjustCurrentSlide = computed(() => {
  return (
    props.mode === 'session' &&
    IN_SESSION_ADJUST_ENABLED &&
    !isMobilitySlide.value &&
    !isReviewingPrevious.value &&
    currentSlideExercise.value !== null
  )
})

// Objective advance criterion (R5, D-07): derived deterministically at runtime
// from the current exercise's contraction — no migration, no new column, impossible
// to desync. ISO → isometric hold target; CON/EXC → dynamic rep target.
// This COMPLEMENTS the fase-131 manual dominado tap, it does not replace it.
const advanceCriterion = computed(() => {
  if (currentSlideExercise.value?.contraction === 'ISO') return 'Objetivo: 3×30s'
  return 'Objetivo: 3×8 (reinicia en 3×5)'
})

// Emit the adjust request with the current exercise's catalog node id (D-02)
// AND the viewed block's identity (WR-01). Carrying blockId lets the swap target
// the EXACT occurrence the member tapped — a movement can recur across blocks,
// and matching by exerciseId alone would mutate the wrong (first-matching) block.
function onAdjust(direction: 'up' | 'down'): void {
  if (!canAdjustCurrentSlide.value) return
  const exercise = currentSlideExercise.value
  const block = viewingBlock.value
  if (!exercise || !block) return
  emit('adjust', { exerciseId: exercise.exerciseId, direction, blockId: block.blockId })
}
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';
@import 'src/css/premium-card';

.block-progression {
  display: flex;
  flex-direction: column;
  height: 100%;
}

// Story area — contains video, progress bar, header overlay
.block-progression__story-area {
  position: relative;
  height: 45vh;
  min-height: 240px;
  flex-shrink: 0;
  background: #2e2a26;
  z-index: 1; // above app-bg overlay
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

// Más oscuro que antes (sketch 026): el kicker crema tiene que leerse también sobre zonas claras
// del video
.block-progression__header-gradient {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100px;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.74) 0%,
    rgba(0, 0, 0, 0.45) 55%,
    transparent 100%
  );
}

.block-progression__header-content {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28px 12px 8px;
  pointer-events: auto;
}

// A la izquierda solo la flecha; a la derecha el rol arriba de la ruta (2026-10-27), cada uno en UNA
// línea con "…" (gap 197-24: rutas largas como FLR, PLPU, HSPU, HD/ID a 360). Vale en los dos modos.
.block-progression__header-left {
  display: flex;
  align-items: center;
  flex: none;
  margin-right: 8px;
}

.block-progression__header-right {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  justify-content: flex-end;
  min-width: 0;
}

.block-progression__titles {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 0;
}

.block-progression__kicker,
.block-progression__route-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// Rol arriba de la ruta, más chico (en libre, "BLOQUE LIBRE · ROL")
.block-progression__kicker {
  max-width: 100%;
  margin-bottom: 1px;
  font-family: 'Montserrat', sans-serif;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: $pd-cream-2;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
}

// Ruta / nombre del bloque arriba a la derecha, debajo del rol
.block-progression__route-name {
  max-width: 100%;
  font-family: 'Montserrat', sans-serif;
  font-size: 15px;
  font-weight: 700;
  text-align: right;
  color: #fff;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
}

// Fase 197 D-15: hitbox de 44 px en la flecha atrás (los dos modos)
.block-progression__back.q-btn {
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
}

// Reloj en la fila del formato (sketch 026), en Cinzel tinta oscura como el cronómetro de la TV.
// Ancho fijo: Cinzel no tiene dígitos de ancho parejo y, sin esto, el texto de la izquierda se movía
// con cada segundo
.block-progression__timer-wrap {
  flex: none;
  width: 108px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-left: auto;
}

.block-progression__timer {
  font-family: 'Cinzel', Georgia, serif;
  font-size: 32px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  color: #3d3732;
}

.block-progression__timer-label {
  margin-top: 3px;
  font-family: 'Montserrat', sans-serif;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: $pd-ink-2;
}

// Fase 197 D-12 (sketch 016 .n-min): barrita de 92x4 bajo el reloj. Sobre blanco el fondo es tinta
// tenue (antes crema sobre el video)
.block-progression__aura-bar {
  width: 92px;
  height: 4px;
  margin-top: 6px;
  border-radius: 2px;
  background: rgba($pd-ink, 0.14);
  overflow: hidden;

  i {
    display: block;
    height: 100%;
    background: $pd-gold;
  }
}

// Hoja blanca (sketch 025 B / 026), borde superior RECTO. Fila del formato (nombre + definición a la
// izquierda, reloj a la derecha) y debajo un separador simple de 1 px
.block-progression__format {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 16px;
  padding: 12px 0 10px;
  border-bottom: 1px solid $pd-light-line;
}

.block-progression__format-info {
  flex: 1 1 0;
  min-width: 0;
}

.block-progression__format-line {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.block-progression__format-name {
  font-family: 'Cinzel', Georgia, serif;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: #3d3732;
}

.block-progression__format-detail {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  // Texto sólido (D-16)
  color: $pd-ink-2;
}

.block-progression__format-desc {
  padding-top: 4px;
  font-size: 11px;
  // Fase 197 D-16: texto sólido (antes rgba(0,0,0,.45), 3.27:1 medido)
  color: $pd-ink-2;
  line-height: 1.3;
}

// "4 ejercicios + 1 de flexibilidad": arriba de Qué trabajás ahora, más grande y en Montserrat
.block-progression__count {
  margin: 12px 16px 0;
  font-family: 'Montserrat', sans-serif;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.25;
  color: $pd-ink;
}

// Más fácil / más difícil (detrás de IN_SESSION_ADJUST_ENABLED)
.block-progression__adjust {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 4px 16px 8px;
}

.block-progression__adjust-criterion {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  // Fase 197 D-16: texto sólido (antes rgba($secondary,.65), 2.6:1)
  color: $pd-ink-2;
}

.block-progression__adjust-row {
  display: flex;
  gap: 8px;
}

.block-progression__adjust-btn {
  flex: 1;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
}

// Botón principal pegado al pie del área que scrollea (sticky), con un degradé blanco encima
// margin-top: auto la lleva al fondo de la hoja aunque haya poco contenido; debajo solo quedan los
// botones de bloque (cambiar Deuteros, ver bloques anteriores)
.block-progression__cta {
  position: sticky;
  bottom: 0;
  z-index: 2;
  margin-top: auto;
  padding: 10px 16px 14px;
  background: linear-gradient(rgba(255, 255, 255, 0), #fff 30%);
}

.block-progression__complete-btn.q-btn {
  width: 100%;
  min-height: 48px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, $pd-btn-a, $pd-btn-b);
  box-shadow: 0 6px 16px rgba($pd-btn-b, 0.28);

  &.block-progression__complete-btn--done {
    background: $positive;
    box-shadow: none;
  }
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
  // Fase 197 D-16: texto sólido (antes rgba(0,0,0,.4), 2.79:1 medido)
  color: $pd-ink-2;
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
  // Fase 197 D-16: texto sólido (antes rgba(0,0,0,.4), 2.79:1 medido)
  color: $pd-ink-2;
  cursor: default;
  transition: all 0.2s ease;

  &--completed {
    cursor: pointer;
    color: $pd-ink;
    border-color: mix($secondary, $cream, 30%);
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

// Change Deuteros
.block-progression__change-deuteros {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  color: $secondary;
  cursor: pointer;
  border-bottom: 1px solid rgba($secondary, 0.12);
}

// Review banner
.block-progression__review-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px 16px;
  background: $primary;
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}

// Content area below story (blanco, sketch 025)
.block-progression__content {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  background: #fff;
  position: relative;
  z-index: 1; // above app-bg overlay
}
</style>
