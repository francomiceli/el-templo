<template>
  <div class="personalizada-section">
    <!-- Loading State -->
    <div v-if="loading" class="personalizada-section__loading">
      <q-spinner-dots size="32px" color="secondary" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="personalizada-section__error">
      <q-icon name="error_outline" size="24px" color="grey-6" />
      <p class="personalizada-section__error-text">{{ error }}</p>
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Active Personalizada -->
      <template v-if="activePersonalizada">
        <!-- Train CTA Card -->
        <q-card class="personalizada-section__cta-card" flat bordered>
          <q-card-section class="personalizada-section__cta-content">
            <div class="personalizada-section__cta-info">
              <q-icon name="self_improvement" color="secondary" size="40px" />
              <div class="personalizada-section__cta-text">
                <p class="personalizada-section__cta-title">Tu Clase Personalizada</p>
                <p class="personalizada-section__cta-subtitle">{{ activePersonalizadaName }}</p>
              </div>
            </div>
            <q-btn
              color="primary"
              text-color="white"
              unelevated
              no-caps
              label="Entrenar"
              icon-right="arrow_forward"
              to="/training"
            />
          </q-card-section>
        </q-card>

        <!-- Description + Zones -->
        <q-card v-if="activeMetadata" class="personalizada-section__info-card" flat bordered>
          <q-card-section>
            <div class="personalizada-section__info-header">
              <div>
                <h3 class="personalizada-section__personalizada-name">
                  {{ activePersonalizadaName }}
                </h3>
                <q-badge
                  class="personalizada-section__tier-badge"
                  :label="activePersonalizadaTierLabel"
                />
              </div>
              <q-icon name="explore" size="28px" class="personalizada-section__icon" />
            </div>

            <p class="personalizada-section__description">
              {{ activeMetadata.description }}
            </p>

            <!-- Zones chips -->
            <div class="personalizada-section__zones">
              <q-chip
                v-for="zone in activeMetadata.zones"
                :key="zone"
                dense
                class="personalizada-section__zone-chip"
              >
                {{ zone }}
              </q-chip>
            </div>

            <p v-if="activePersonalizada.startedAt" class="personalizada-section__since">
              Activo desde {{ formatDate(activePersonalizada.startedAt) }}
            </p>

            <!-- Cycle Progress (only when subscription has durationDays) -->
            <div
              v-if="cycleStats && !cycleStats.cycleComplete"
              class="personalizada-section__cycle"
            >
              <div class="personalizada-section__cycle-header">
                <span class="personalizada-section__cycle-week">{{ cycleWeekLabel }}</span>
                <span class="personalizada-section__cycle-completions">{{ completionLabel }}</span>
              </div>
              <q-linear-progress
                :value="cycleProgress"
                color="secondary"
                track-color="grey-3"
                rounded
                size="10px"
                class="personalizada-section__cycle-bar"
              />
            </div>

            <!-- Per-Duration Semana Progress (always visible, matches post-session resumen) -->
            <div class="personalizada-section__durations">
              <div class="personalizada-section__duration-row">
                <span class="personalizada-section__duration-time"
                  >20 <span class="personalizada-section__duration-unit">min</span></span
                >
                <div class="personalizada-section__duration-info">
                  <span class="personalizada-section__duration-label"
                    >Semana {{ activePersonalizada.semana20 }}</span
                  >
                  <q-linear-progress
                    :value="activePersonalizada.semana20 / 21"
                    color="secondary"
                    track-color="grey-3"
                    size="6px"
                    rounded
                    class="q-mt-xs"
                  />
                </div>
              </div>
              <div class="personalizada-section__duration-row">
                <span class="personalizada-section__duration-time"
                  >40 <span class="personalizada-section__duration-unit">min</span></span
                >
                <div class="personalizada-section__duration-info">
                  <span class="personalizada-section__duration-label"
                    >Semana {{ activePersonalizada.semana40 }}</span
                  >
                  <q-linear-progress
                    :value="activePersonalizada.semana40 / 21"
                    color="secondary"
                    track-color="grey-3"
                    size="6px"
                    rounded
                    class="q-mt-xs"
                  />
                </div>
              </div>
              <div class="personalizada-section__duration-row">
                <span class="personalizada-section__duration-time"
                  >60 <span class="personalizada-section__duration-unit">min</span></span
                >
                <div class="personalizada-section__duration-info">
                  <span class="personalizada-section__duration-label"
                    >Semana {{ activePersonalizada.semana60 }}</span
                  >
                  <q-linear-progress
                    :value="activePersonalizada.semana60 / 21"
                    color="secondary"
                    track-color="grey-3"
                    size="6px"
                    rounded
                    class="q-mt-xs"
                  />
                </div>
              </div>
            </div>

            <!-- Cycle Complete Wrap-Up Card -->
            <q-card
              v-if="cycleStats && cycleStats.cycleComplete"
              class="personalizada-section__wrapup"
              flat
              bordered
            >
              <q-card-section>
                <div class="personalizada-section__wrapup-header">
                  <q-icon name="emoji_events" size="36px" color="secondary" />
                  <h3 class="personalizada-section__wrapup-title">Ciclo Completo!</h3>
                </div>

                <p class="personalizada-section__wrapup-summary">
                  Completaste
                  <strong>{{ cycleStats.totalCompletions }} sesiones</strong> en
                  {{ cycleStats.cycleWeeks }} semanas.
                </p>

                <!-- Duration Breakdown in wrap-up -->
                <div class="personalizada-section__wrapup-breakdown">
                  <div
                    v-if="cycleStats.durationBreakdown.d20 > 0"
                    class="personalizada-section__wrapup-duration"
                  >
                    <span class="personalizada-section__wrapup-count">{{
                      cycleStats.durationBreakdown.d20
                    }}</span>
                    <span class="personalizada-section__wrapup-label">sesiones de 20 min</span>
                  </div>
                  <div
                    v-if="cycleStats.durationBreakdown.d40 > 0"
                    class="personalizada-section__wrapup-duration"
                  >
                    <span class="personalizada-section__wrapup-count">{{
                      cycleStats.durationBreakdown.d40
                    }}</span>
                    <span class="personalizada-section__wrapup-label">sesiones de 40 min</span>
                  </div>
                  <div
                    v-if="cycleStats.durationBreakdown.d60 > 0"
                    class="personalizada-section__wrapup-duration"
                  >
                    <span class="personalizada-section__wrapup-count">{{
                      cycleStats.durationBreakdown.d60
                    }}</span>
                    <span class="personalizada-section__wrapup-label">sesiones de 60 min</span>
                  </div>
                </div>

                <!-- CTA -->
                <div class="personalizada-section__wrapup-actions">
                  <q-btn
                    unelevated
                    no-caps
                    color="secondary"
                    text-color="primary"
                    class="personalizada-section__wrapup-btn"
                    label="Consulta en recepcion para renovar"
                    icon="support_agent"
                  />
                </div>
              </q-card-section>
            </q-card>
          </q-card-section>
        </q-card>

        <!-- Archived Personalizadas (collapsible) -->
        <q-expansion-item
          v-if="archivedPersonalizadas.length > 0"
          dense
          header-class="personalizada-section__archived-header"
          expand-icon-class="personalizada-section__archived-expand"
        >
          <template #header>
            <q-item-section>
              <q-item-label class="personalizada-section__archived-title">
                Historial ({{ archivedPersonalizadas.length }})
              </q-item-label>
            </q-item-section>
          </template>

          <div class="personalizada-section__archived-list">
            <q-card
              v-for="(archived, index) in archivedPersonalizadas"
              :key="index"
              class="personalizada-section__archived-card"
              flat
              bordered
            >
              <q-card-section class="personalizada-section__archived-content">
                <div class="personalizada-section__archived-row">
                  <span class="personalizada-section__archived-name">{{
                    getPersonalizadaName(archived.personalizadaType)
                  }}</span>
                  <q-badge
                    class="personalizada-section__archived-tier-badge"
                    :label="getPersonalizadaTierLabel(archived.personalizadaType)"
                  />
                </div>

                <p class="personalizada-section__archived-dates">
                  {{ formatDate(archived.startedAt) }} - {{ formatDate(archived.archivedAt) }}
                </p>

                <p class="personalizada-section__archived-semanas">
                  20 min: S{{ archived.semana20 }} · 40 min: S{{ archived.semana40 }} · 60 min: S{{
                    archived.semana60
                  }}
                </p>
              </q-card-section>
            </q-card>
          </div>
        </q-expansion-item>
      </template>

      <!-- No Active Personalizada - Info -->
      <q-card v-else class="personalizada-section__prompt-card" flat bordered>
        <q-card-section class="personalizada-section__prompt-content">
          <q-icon name="explore" size="40px" class="personalizada-section__prompt-icon" />
          <h3 class="personalizada-section__prompt-title">Clases Personalizadas</h3>
          <p class="personalizada-section__prompt-text">
            Tu plan no incluye una personalizada activa. Consulta en recepcion para conocer los
            planes de Clases Personalizadas.
          </p>
        </q-card-section>
      </q-card>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * PersonalizadaSection component for Mi Camino Personalizadas tab.
 *
 * Displays:
 * - Train CTA card with action button
 * - Active personalizada info with description, zones, and semana counters
 * - Archived history in a collapsible section
 * - Personalizada switching with confirmation dialog
 */
import { computed } from 'vue'
import { createLogger } from 'src/utils/logger'
import { formatDate } from 'src/utils/format-date'
import type {
  PersonalizadaProgress,
  ArchivedPersonalizada,
  PersonalizadaMetadata,
  PersonalizadaTier,
  CycleStats,
} from 'src/modules/personalizada/types'

createLogger('PersonalizadaSection')

const props = defineProps<{
  activePersonalizada: PersonalizadaProgress | null
  archivedPersonalizadas: ArchivedPersonalizada[]
  allMetadata: PersonalizadaMetadata[]
  cycleStats: CycleStats | null
  loading: boolean
  error: string | null
}>()

const TIER_LABELS: Record<PersonalizadaTier, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
}

const activeMetadata = computed(() => {
  if (!props.activePersonalizada) return null
  return (
    props.allMetadata.find((m) => m.type === props.activePersonalizada?.personalizadaType) ?? null
  )
})

const activePersonalizadaName = computed(() => {
  return activeMetadata.value?.name ?? props.activePersonalizada?.personalizadaType ?? ''
})

const activePersonalizadaTierLabel = computed(() => {
  if (!activeMetadata.value) return ''
  return TIER_LABELS[activeMetadata.value.tier] ?? ''
})

const cycleProgress = computed(() => {
  if (!props.cycleStats) return 0
  return props.cycleStats.currentWeek / props.cycleStats.cycleWeeks
})

const cycleWeekLabel = computed(() => {
  if (!props.cycleStats) return ''
  return `Semana ${props.cycleStats.currentWeek} de ${props.cycleStats.cycleWeeks}`
})

const completionLabel = computed(() => {
  if (!props.cycleStats) return ''
  const n = props.cycleStats.totalCompletions
  return `${n} ${n === 1 ? 'sesion completada' : 'sesiones completadas'}`
})

function getPersonalizadaName(personalizadaType: string): string {
  const meta = props.allMetadata.find((m) => m.type === personalizadaType)
  return meta?.name ?? personalizadaType
}

function getPersonalizadaTierLabel(personalizadaType: string): string {
  const meta = props.allMetadata.find((m) => m.type === personalizadaType)
  if (!meta) return ''
  return TIER_LABELS[meta.tier] ?? ''
}
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.personalizada-section {
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

  // Train CTA Card
  &__cta-card {
    background-color: white;
    border-color: rgba($secondary, 0.3);
    border-radius: 12px;
  }

  &__cta-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  &__cta-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__cta-text {
    display: flex;
    flex-direction: column;
  }

  &__cta-title {
    font-family: 'Montserrat', sans-serif;
    font-size: 15px;
    font-weight: 600;
    color: $primary;
    margin: 0;
  }

  &__cta-subtitle {
    font-size: 13px;
    color: rgba($primary, 0.6);
    margin: 0;
  }

  // Info Card (description + zones + semanas)
  &__info-card {
    background-color: white;
    border-color: rgba($secondary, 0.3);
    border-radius: 12px;
  }

  &__info-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
  }

  &__personalizada-name {
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

  &__description {
    font-size: 13px;
    color: rgba($primary, 0.7);
    line-height: 1.5;
    margin: 0 0 12px;
  }

  &__zones {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
  }

  &__zone-chip {
    background-color: rgba($secondary, 0.1) !important;
    color: $secondary !important;
    font-size: 11px;
    font-weight: 500;
  }

  &__since {
    font-size: 13px;
    color: rgba($primary, 0.5);
    margin: 0 0 12px;
  }

  // Cycle Progress
  &__cycle {
    margin-bottom: 16px;
  }

  &__cycle-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 8px;
  }

  &__cycle-week {
    font-family: 'Montserrat', sans-serif;
    font-size: 16px;
    font-weight: 600;
    color: $primary;
  }

  &__cycle-completions {
    font-size: 13px;
    color: rgba($primary, 0.6);
  }

  &__cycle-bar {
    margin-bottom: 12px;
  }

  &__durations {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  &__duration-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 12px;
    background: rgba($cream, 0.7);
    border-radius: 8px;
  }

  &__duration-time {
    font-family: 'Montserrat', sans-serif;
    font-size: 1.1rem;
    font-weight: 400;
    color: $secondary;
    min-width: 50px;
    line-height: 1;
  }

  &__duration-unit {
    font-size: 0.7rem;
    color: rgba($primary, 0.4);
  }

  &__duration-info {
    flex: 1;
  }

  &__duration-label {
    font-size: 0.85rem;
    font-weight: 500;
    color: $primary;
  }

  // Wrap-Up Card
  &__wrapup {
    background-color: white;
    border-color: rgba($secondary, 0.4);
    border-radius: 12px;
    margin-bottom: 16px;
  }

  &__wrapup-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  &__wrapup-title {
    font-family: 'Montserrat', sans-serif;
    font-size: 20px;
    font-weight: 700;
    color: $primary;
    margin: 0;
  }

  &__wrapup-summary {
    font-size: 14px;
    color: rgba($primary, 0.7);
    line-height: 1.5;
    margin: 0 0 16px;
  }

  &__wrapup-breakdown {
    display: flex;
    gap: 16px;
    margin-bottom: 20px;
  }

  &__wrapup-duration {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    padding: 12px 8px;
    background-color: rgba($cream, 0.7);
    border-radius: 10px;
  }

  &__wrapup-count {
    font-family: 'Montserrat', sans-serif;
    font-size: 24px;
    font-weight: 700;
    color: $secondary;
  }

  &__wrapup-label {
    font-size: 11px;
    color: rgba($primary, 0.6);
    text-align: center;
    margin-top: 4px;
  }

  &__wrapup-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__wrapup-btn {
    width: 100%;
    color: $secondary !important;
    border-color: $secondary !important;
  }

  // No Personalizada Prompt
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

  // Archived (collapsible)
  &__archived-header {
    padding: 8px 0;
  }

  &__archived-title {
    font-family: 'Montserrat', sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: rgba($primary, 0.6);
  }

  &__archived-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 0 8px;
  }

  &__archived-card {
    background-color: white;
    border-color: rgba($primary, 0.1);
    border-radius: 10px;
  }

  &__archived-content {
    padding: 12px 16px;
  }

  &__archived-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
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
}
</style>
