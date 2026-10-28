<template>
  <!-- Resumen de la sesión completa. Lenguaje visual de FreeBlockSummary (página crema, cards
       claras, CTA terracota). En curso (`!readOnly`) es una pantalla fija con RPE y notas; en
       solo lectura (`readOnly`) se ve desde Mi Templo / Semana con el botón de volver. -->
  <div class="session-summary" :class="{ 'fixed-full column': !readOnly }">
    <div class="session-summary__content col">
      <header class="session-summary__head">
        <q-btn
          v-if="readOnly"
          flat
          round
          dense
          icon="arrow_back"
          class="session-summary__back-btn"
          aria-label="Volver"
          @click="emit('back')"
        />
        <div class="session-summary__head-text">
          <p class="session-summary__kicker">{{ formattedDate }}</p>
          <h2 class="session-summary__title">Resumen de sesión</h2>
        </div>
      </header>

      <!-- Bloques completados -->
      <SummaryBlockCard v-for="block in blocks" :key="block.blockId" :block="block" show-guia />

      <!-- Solo lectura: cierre de la sesión (duración, RPE y notas guardados) -->
      <section v-if="readOnly" class="session-summary__done" aria-label="Cierre de la sesión">
        <div class="session-summary__done-row">
          <q-icon name="timer" size="20px" class="session-summary__done-icon" aria-hidden="true" />
          <span v-if="durationMinutes" class="session-summary__done-text">
            Sesión completada en {{ durationMinutes }} minutos
          </span>
          <span v-else class="session-summary__done-text">Sesión completada</span>
        </div>
        <div v-if="savedRpe" class="session-summary__done-row">
          <q-icon name="speed" size="20px" class="session-summary__done-icon" aria-hidden="true" />
          <span class="session-summary__done-text">RPE {{ savedRpe }}</span>
        </div>
        <div v-if="savedNotes" class="session-summary__done-row">
          <q-icon name="notes" size="20px" class="session-summary__done-icon" aria-hidden="true" />
          <span class="session-summary__done-notes">{{ savedNotes }}</span>
        </div>
      </section>

      <!-- Esta semana / días totales -->
      <SummaryStats :stats="stats" />

      <!-- En curso: RPE + notas -->
      <template v-if="!readOnly">
        <div class="session-summary__card">
          <RpeSlider v-model="rpeValue" />
          <RpeContextualMessage :rpe-value="rpeValue" :has-interacted="hasInteracted" />
        </div>

        <div class="session-summary__card notes-section">
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

      <!-- Acciones -->
      <div class="session-summary__foot">
        <template v-if="!readOnly">
          <button
            type="button"
            class="session-summary__cta"
            :disabled="isSubmitting"
            :aria-busy="isSubmitting"
            @click="onFinish"
          >
            <q-spinner v-if="isSubmitting" size="22px" aria-label="Guardando" />
            <template v-else>
              <q-icon name="check" size="22px" aria-hidden="true" />
              Terminar sesión
            </template>
          </button>
          <button type="button" class="session-summary__link" @click="emit('restart')">
            <q-icon name="replay" size="18px" aria-hidden="true" />
            <span class="session-summary__link-text">Repetir sesión</span>
          </button>
        </template>
        <button v-else type="button" class="session-summary__cta" @click="emit('restart')">
          <q-icon name="replay" size="22px" aria-hidden="true" />
          Repetir sesión
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Block } from '../../types/session'
import RpeSlider from './RpeSlider.vue'
import RpeContextualMessage from './RpeContextualMessage.vue'
import SummaryBlockCard from './SummaryBlockCard.vue'
import SummaryStats from './SummaryStats.vue'

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

const stats = computed(() => [
  { value: props.daysCompletedThisWeek, label: 'esta semana' },
  { value: props.totalDaysTrained, label: 'días totales' },
])

// Actions
function onFinish(): void {
  emit('finish', {
    rpe: rpeValue.value,
    notes: notesValue.value.trim() || null,
  })
}
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';
@import 'src/css/premium-card';

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
  }
}

.session-summary__content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 16px calc(24px + env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
  color: $pd-ink;

  // La columna scrollea: ningún bloque se achica (si no, las cards quedaban cortadas)
  > * {
    flex-shrink: 0;
  }
}

.session-summary__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-summary__head-text {
  min-width: 0;
}

// Hitbox de 44 px en la flecha de volver (solo lectura)
.session-summary__back-btn.q-btn {
  flex: none;
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  margin-left: -8px;
  color: $pd-terra-ink;
}

.session-summary__kicker {
  @include pd-kicker-light;
}

.session-summary__title {
  margin: 4px 0 0;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 28px;
  line-height: 1.15;
  color: $pd-ink;
}

// Cierre de la sesión (solo lectura): duración, RPE y notas
.session-summary__done {
  @include pd-surface-light;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
}

.session-summary__done-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.session-summary__done-icon {
  flex-shrink: 0;
  color: $pd-terra-ink;
}

.session-summary__done-text {
  font-family: 'Geologica', sans-serif;
  font-weight: 600;
  font-size: 14px;
  color: $pd-ink;
}

.session-summary__done-notes {
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: 'Geologica', sans-serif;
  font-size: 13px;
  font-style: italic;
  color: $pd-ink-2;
}

// RPE y notas (en curso)
.session-summary__card {
  @include pd-surface-light;
  padding: 14px 16px;
}

// Fase 197 D-16: contador "0 / 500" en color sólido (antes rgba(0,0,0,.54) de Quasar, 4.30:1 medido)
.notes-section :deep(.q-field__bottom) {
  color: $pd-ink-2;
}

.session-summary__foot {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  margin-top: 4px;
}

.session-summary__cta {
  @include pd-cta(56px);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &:disabled {
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid $pd-ink;
    outline-offset: 2px;
  }
}

.session-summary__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  align-self: center;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  background: none;
  color: $pd-terra-ink;
  font-family: 'Geologica', sans-serif;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
}

// El subrayado va solo en el texto: sobre el ícono quedaba a otra altura
.session-summary__link-text {
  text-decoration: underline;
  text-underline-offset: 3px;
}

@include pd-sheen-keyframes;
</style>
