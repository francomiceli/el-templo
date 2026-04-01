<template>
  <div class="session-summary" :class="{ 'fixed-full column': !readOnly }">
    <!-- Read-only header: light, matches Mi Templo / Planes section style -->
    <div v-if="readOnly" class="session-summary__header q-pa-md q-pb-none">
      <q-btn
        flat
        round
        dense
        icon="arrow_back"
        color="primary"
        class="session-summary__back-btn"
        @click="emit('back')"
      />
      <div class="session-summary__header-text">
        <p class="session-summary__section-title">Resumen de sesión</p>
        <p class="session-summary__date-label">{{ formattedDate }}</p>
      </div>
    </div>

    <!-- In-session header: same layout, check icon instead of back arrow -->
    <div v-else class="session-summary__header q-pa-md q-pb-none">
      <q-icon name="check_circle" color="positive" size="36px" />
      <div class="session-summary__header-text">
        <p class="session-summary__section-title">Resumen de sesión</p>
        <p class="session-summary__date-label">{{ formattedDate }}</p>
      </div>
    </div>

    <!-- Scrollable Content -->
    <div class="session-summary__content col q-pa-md">
      <!-- Blocks Completed — reuses BlockCard from DayCard -->
      <div v-if="blocks.length > 0" class="blocks-section q-mb-lg">
        <BlockCard
          v-for="block in blocks"
          :key="block.blockId"
          :block="block"
          :color-class="getBlockColorClass(block.role)"
        />
      </div>

      <!-- Read-only: Session completion card -->
      <div v-if="readOnly" class="completion-card q-mb-lg">
        <div class="completion-card__row">
          <q-icon name="timer" size="20px" color="primary" />
          <span v-if="durationMinutes" class="completion-card__text">
            Sesión completada en {{ durationMinutes }} minutos
          </span>
          <span v-else class="completion-card__text">Sesión completada</span>
        </div>
        <div v-if="savedRpe" class="completion-card__row">
          <q-icon name="speed" size="20px" color="primary" />
          <span class="completion-card__text">RPE {{ savedRpe }}</span>
        </div>
        <div v-if="savedNotes" class="completion-card__row">
          <q-icon name="notes" size="20px" color="primary" />
          <span class="completion-card__notes">{{ savedNotes }}</span>
        </div>
      </div>

      <!-- Days Stats Row: This Week / Total -->
      <div class="days-stats-row q-mb-lg">
        <div class="days-stat">
          <div class="text-h3 text-weight-bold text-primary">{{ daysCompletedThisWeek }}</div>
          <div class="text-body2 text-grey-7">esta semana</div>
        </div>
        <div class="days-divider"></div>
        <div class="days-stat">
          <div class="text-h3 text-weight-bold text-secondary">{{ totalDaysTrained }}</div>
          <div class="text-body2 text-grey-7">dias totales</div>
        </div>
      </div>

      <!-- In-session: RPE Input + Notes -->
      <template v-if="!readOnly">
        <div class="rpe-section q-mb-lg">
          <RpeSlider v-model="rpeValue" />
          <RpeContextualMessage :rpe-value="rpeValue" :has-interacted="hasInteracted" />
        </div>

        <div class="notes-section">
          <q-input
            v-model="notesValue"
            type="textarea"
            label="Notas (opcional)"
            outlined
            :rows="2"
            maxlength="500"
            counter
          />
        </div>
      </template>

      <!-- Actions -->
      <div v-if="!readOnly" class="session-summary__actions q-mt-lg">
        <q-btn
          unelevated
          class="start-button start-button--primary q-mb-sm"
          size="lg"
          :loading="isSubmitting"
          @click="onFinish"
        >
          <q-icon name="check" size="24px" class="q-mr-sm" />
          <span class="text-weight-bold">Terminar Sesión</span>
        </q-btn>
        <q-btn
          flat
          color="grey-7"
          label="Repetir Sesión"
          icon="replay"
          class="session-summary__secondary-btn"
          size="md"
          @click="emit('restart')"
        />
      </div>
    </div>

    <!-- Read-only footer: in-flow, uses DayCard start-button style -->
    <div v-if="readOnly" class="session-summary__readonly-footer q-px-md q-pb-md">
      <q-btn unelevated class="start-button" size="lg" @click="emit('restart')">
        <q-icon name="replay" size="24px" class="q-mr-sm" />
        <span class="text-weight-bold">Repetir Sesión</span>
      </q-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Block } from '../../types/session'
import { getBlockColorClass } from '../../utils/blockColors'
import BlockCard from '../BlockCard.vue'
import RpeSlider from './RpeSlider.vue'
import RpeContextualMessage from './RpeContextualMessage.vue'

interface Props {
  /** Date of the session (YYYY-MM-DD) */
  date: string
  /** Full Block objects for display (filtered to completed blocks only) */
  blocks: Block[]
  /** Days completed this week */
  daysCompletedThisWeek: number
  /** Cumulative days trained (from API response or 0 initially) */
  totalDaysTrained: number
  /** Whether submission is in progress */
  isSubmitting?: boolean
  /** Read-only mode (viewing completed session) */
  readOnly?: boolean
  /** Duration in minutes (read-only mode) */
  durationMinutes?: number | null
  /** Saved RPE value (read-only mode) */
  savedRpe?: number | null
  /** Saved notes (read-only mode) */
  savedNotes?: string | null
}

interface Emits {
  (e: 'finish', data: { rpe: number | null; notes: string | null }): void
  (e: 'restart'): void
  (e: 'back'): void
}

const props = withDefaults(defineProps<Props>(), {
  isSubmitting: false,
  readOnly: false,
  durationMinutes: null,
  savedRpe: null,
  savedNotes: null,
})
const emit = defineEmits<Emits>()

// Form state (only used in editable mode)
const rpeValue = ref<number | null>(null)
const notesValue = ref<string>('')
const hasInteracted = ref(false)

// Track when user first interacts with RPE slider
watch(rpeValue, (newVal: number | null) => {
  if (newVal !== null) {
    hasInteracted.value = true
  }
})

// Computed
const formattedDate = computed(() => {
  const d = new Date(props.date + 'T00:00:00')
  return d.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
})

// Actions
function onFinish(): void {
  emit('finish', {
    rpe: rpeValue.value,
    notes: notesValue.value.trim() || null,
  })
}
</script>

<style scoped lang="scss">
@use 'sass:color';
@import 'src/css/quasar.variables.scss';

.session-summary {
  background: transparent;

  &.fixed-full {
    z-index: 1999;
    top: 50px;
    bottom: var(--mobile-tabs-height, 0px);

    @media (min-width: 768px) {
      top: 0;
      left: 64px;
      right: 0;
      max-width: 630px;
      margin: 0 auto;
    }

    @media (min-width: 1025px) {
      left: 200px;
    }

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
      opacity: 0.3;
      pointer-events: none;
      mix-blend-mode: multiply;
    }
  }
}

// Read-only header — light, matches Planes section style
.session-summary__header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.session-summary__header-text {
  display: flex;
  flex-direction: column;
}

.session-summary__section-title {
  font-family: 'Montserrat', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: rgba($primary, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.session-summary__date-label {
  font-size: 14px;
  color: $grey-7;
  margin: 4px 0 0;
  text-transform: capitalize;
}

.session-summary__content {
  overflow-y: auto;
}

.session-summary__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
}

.session-summary__secondary-btn {
  max-width: 300px;
}

.session-summary__readonly-footer {
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}

// Same button style as DayCard's start-button
.start-button {
  width: 100%;
  max-width: 300px;
  height: 52px;
  border-radius: 26px;
  font-size: 16px;
  font-family: 'Montserrat', sans-serif;
  letter-spacing: 0.08em;
  color: white;
  background: linear-gradient(
    135deg,
    $secondary 0%,
    color.adjust($secondary, $lightness: 8%) 50%,
    mix($secondary, $primary, 70%) 100%
  ) !important;
  box-shadow: 0 4px 12px rgba($secondary, 0.3);
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 6px 16px rgba($secondary, 0.4);
    transform: translateY(-1px);
  }

  // Primary variant — for "Terminar Sesión"
  &--primary {
    background: linear-gradient(
      135deg,
      $primary 0%,
      color.adjust($primary, $lightness: 8%) 50%,
      mix($primary, $secondary, 70%) 100%
    ) !important;
    box-shadow: 0 4px 12px rgba($primary, 0.3);

    &:hover {
      box-shadow: 0 6px 16px rgba($primary, 0.4);
    }
  }
}

.days-stats-row {
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, rgba(245, 240, 232, 0.8) 0%, rgba(232, 224, 212, 0.6) 100%);
  border: 1px solid rgba(184, 155, 94, 0.3);
  border-radius: 16px;
  padding: 24px 16px;
}

.days-stat {
  flex: 1;
  text-align: center;
}

.days-divider {
  width: 1px;
  height: 48px;
  background: rgba(0, 0, 0, 0.12);
  margin: 0 8px;
}

.blocks-section {
  padding: 0;
}

.completion-card {
  background: white;
  border-radius: 12px;
  border: 1px solid rgba($secondary, 0.2);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  &__row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__text {
    font-family: 'Montserrat', sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: $primary;
  }

  &__notes {
    font-size: 13px;
    color: $grey-7;
    font-style: italic;
  }
}
</style>
