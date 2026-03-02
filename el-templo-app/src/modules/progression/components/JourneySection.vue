<template>
  <div class="journey-section">
    <!-- Loading State -->
    <div v-if="loading" class="journey-section__loading">
      <q-spinner-dots size="32px" color="secondary" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="journey-section__error">
      <q-icon name="error_outline" size="24px" color="grey-6" />
      <p class="journey-section__error-text">{{ error }}</p>
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Active Journey Card -->
      <q-card v-if="activeJourney" class="journey-section__active-card" flat bordered>
        <q-card-section>
          <div class="journey-section__active-header">
            <div>
              <h3 class="journey-section__journey-name">{{ activeJourneyName }}</h3>
              <q-badge class="journey-section__tier-badge" :label="activeJourneyTierLabel" />
            </div>
            <q-icon name="explore" size="28px" class="journey-section__icon" />
          </div>

          <p class="journey-section__since">
            Activo desde {{ formatDate(activeJourney.startedAt) }}
          </p>

          <!-- Per-duration semana counters -->
          <div class="journey-section__semanas">
            <div class="journey-section__semana-row">
              <span class="journey-section__duration-label">20 min</span>
              <span class="journey-section__semana-value">Semana {{ activeJourney.semana20 }}</span>
            </div>
            <div class="journey-section__semana-row">
              <span class="journey-section__duration-label">40 min</span>
              <span class="journey-section__semana-value">Semana {{ activeJourney.semana40 }}</span>
            </div>
            <div class="journey-section__semana-row">
              <span class="journey-section__duration-label">60 min</span>
              <span class="journey-section__semana-value">Semana {{ activeJourney.semana60 }}</span>
            </div>
          </div>

          <!-- Change Journey Button -->
          <q-btn
            outline
            no-caps
            class="journey-section__change-btn"
            label="Cambiar Journey"
            icon="swap_horiz"
            @click="showChangeDialog = true"
          />
        </q-card-section>
      </q-card>

      <!-- No Active Journey - Prompt -->
      <q-card v-else class="journey-section__prompt-card" flat bordered>
        <q-card-section class="journey-section__prompt-content">
          <q-icon name="explore" size="40px" class="journey-section__prompt-icon" />
          <h3 class="journey-section__prompt-title">Comienza tu Journey personalizado</h3>
          <p class="journey-section__prompt-text">
            Elige una ruta de entrenamiento enfocada en tus objetivos: tren superior, inferior,
            empuje, traccion y mas.
          </p>
          <q-btn
            unelevated
            no-caps
            color="secondary"
            text-color="primary"
            label="Elegir Journey"
            icon-right="arrow_forward"
            to="/journey"
          />
        </q-card-section>
      </q-card>

      <!-- Archived Journeys Section -->
      <div v-if="archivedJourneys.length > 0" class="journey-section__archived">
        <h3 class="journey-section__archived-title">Historial de Journeys</h3>

        <q-card
          v-for="(archived, index) in archivedJourneys"
          :key="index"
          class="journey-section__archived-card"
          flat
          bordered
        >
          <q-card-section>
            <div class="journey-section__archived-header">
              <span class="journey-section__archived-name">{{
                getJourneyName(archived.journeyType)
              }}</span>
              <q-badge
                class="journey-section__archived-tier-badge"
                :label="getJourneyTierLabel(archived.journeyType)"
              />
            </div>

            <p class="journey-section__archived-dates">
              Activo: {{ formatDate(archived.startedAt) }} - {{ formatDate(archived.archivedAt) }}
            </p>

            <p class="journey-section__archived-semanas">
              20 min: S{{ archived.semana20 }} &middot; 40 min: S{{ archived.semana40 }} &middot; 60
              min: S{{ archived.semana60 }}
            </p>
          </q-card-section>
        </q-card>
      </div>
    </template>

    <!-- Change Journey Confirmation Dialog -->
    <q-dialog v-model="showChangeDialog">
      <q-card class="journey-section__dialog">
        <q-card-section>
          <div class="text-h6 journey-section__dialog-title">Cambiar Journey</div>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <p class="journey-section__dialog-text">
            Cambiar de Journey reiniciara tu progreso actual. Tu historial sera guardado.
          </p>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat no-caps label="Cancelar" color="grey-7" v-close-popup />
          <q-btn
            flat
            no-caps
            label="Cambiar"
            class="journey-section__dialog-confirm"
            @click="onConfirmChange"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * JourneySection component for Mi Camino page.
 *
 * Displays:
 * - Active journey with per-duration semana counters
 * - No-journey prompt with CTA to start
 * - Archived journey history as summary cards
 * - Journey switching with warning dialog
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { createLogger } from 'src/utils/logger'
import type {
  JourneyProgress,
  ArchivedJourney,
  JourneyMetadata,
  JourneyTier,
} from 'src/modules/journey/types'

const log = createLogger('JourneySection')
const router = useRouter()

// --- Props ---

const props = defineProps<{
  activeJourney: JourneyProgress | null
  archivedJourneys: ArchivedJourney[]
  allMetadata: JourneyMetadata[]
  loading: boolean
  error: string | null
}>()

// --- State ---

const showChangeDialog = ref(false)

// --- Computed ---

const TIER_LABELS: Record<JourneyTier, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
}

const activeMetadata = computed(() => {
  if (!props.activeJourney) return null
  return props.allMetadata.find((m) => m.type === props.activeJourney?.journeyType) ?? null
})

const activeJourneyName = computed(() => {
  return activeMetadata.value?.name ?? props.activeJourney?.journeyType ?? ''
})

const activeJourneyTierLabel = computed(() => {
  if (!activeMetadata.value) return ''
  return TIER_LABELS[activeMetadata.value.tier] ?? ''
})

// --- Methods ---

function getJourneyName(journeyType: string): string {
  const meta = props.allMetadata.find((m) => m.type === journeyType)
  return meta?.name ?? journeyType
}

function getJourneyTierLabel(journeyType: string): string {
  const meta = props.allMetadata.find((m) => m.type === journeyType)
  if (!meta) return ''
  return TIER_LABELS[meta.tier] ?? ''
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function onConfirmChange(): void {
  showChangeDialog.value = false
  log.info('User confirmed journey change')
  void router.push('/journey')
}
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.journey-section {
  display: flex;
  flex-direction: column;
  gap: 16px;

  &__loading {
    display: flex;
    justify-content: center;
    padding: 24px;
  }

  &__error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px;
  }

  &__error-text {
    font-size: 13px;
    color: rgba($primary, 0.6);
    margin: 0;
  }

  // Active Journey Card
  &__active-card {
    background-color: white;
    border-color: rgba($secondary, 0.3);
    border-radius: 12px;
  }

  &__active-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
  }

  &__journey-name {
    font-family: 'Montserrat', sans-serif;
    font-size: 18px;
    font-weight: 600;
    color: $primary;
    margin: 0 0 6px;
  }

  &__tier-badge {
    background-color: rgba($secondary, 0.15) !important;
    color: $secondary !important;
    font-size: 0.7rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 2px 10px;
  }

  &__icon {
    color: $secondary;
  }

  &__since {
    font-size: 13px;
    color: rgba($primary, 0.6);
    margin: 0 0 16px;
  }

  // Per-duration semana counters
  &__semanas {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }

  &__semana-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background-color: rgba($cream, 0.7);
    border-radius: 8px;
  }

  &__duration-label {
    font-size: 13px;
    color: rgba($primary, 0.6);
    font-weight: 500;
  }

  &__semana-value {
    font-family: 'Montserrat', sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: $primary;
  }

  &__change-btn {
    width: 100%;
    color: $secondary !important;
    border-color: $secondary !important;
  }

  // No Journey Prompt
  &__prompt-card {
    background-color: white;
    border-color: rgba($secondary, 0.2);
    border-radius: 12px;
  }

  &__prompt-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 24px 16px;
  }

  &__prompt-icon {
    color: $secondary;
    margin-bottom: 12px;
  }

  &__prompt-title {
    font-family: 'Montserrat', sans-serif;
    font-size: 16px;
    font-weight: 600;
    color: $primary;
    margin: 0 0 8px;
  }

  &__prompt-text {
    font-size: 13px;
    color: rgba($primary, 0.6);
    margin: 0 0 16px;
    max-width: 280px;
    line-height: 1.5;
  }

  // Archived Journeys
  &__archived {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  &__archived-title {
    font-family: 'Montserrat', sans-serif;
    font-size: 16px;
    font-weight: 600;
    color: $primary;
    margin: 4px 0 8px;
  }

  &__archived-card {
    background-color: white;
    border-color: rgba($primary, 0.1);
    border-radius: 10px;
  }

  &__archived-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  &__archived-name {
    font-family: 'Montserrat', sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: $primary;
  }

  &__archived-tier-badge {
    background-color: rgba($primary, 0.08) !important;
    color: rgba($primary, 0.6) !important;
    font-size: 0.65rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 1px 8px;
  }

  &__archived-dates {
    font-size: 12px;
    color: rgba($primary, 0.5);
    margin: 0 0 4px;
  }

  &__archived-semanas {
    font-size: 12px;
    color: rgba($primary, 0.6);
    margin: 0;
    font-weight: 500;
  }

  // Dialog
  &__dialog {
    min-width: 300px;
  }

  &__dialog-title {
    font-family: 'Montserrat', sans-serif;
    color: $primary;
  }

  &__dialog-text {
    font-size: 14px;
    color: rgba($primary, 0.7);
    line-height: 1.5;
    margin: 0;
  }

  &__dialog-confirm {
    color: $secondary !important;
    font-weight: 600;
  }
}
</style>
