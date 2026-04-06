<template>
  <div class="goal-plan-section">
    <!-- Loading State -->
    <div v-if="loading" class="goal-plan-section__loading">
      <TemploLoader size="sm" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="goal-plan-section__error">
      <q-icon name="error_outline" size="24px" color="grey-6" />
      <p class="goal-plan-section__error-text">{{ error }}</p>
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Active Goal Plan -->
      <template v-if="activeGoalPlan">
        <!-- Train CTA Card -->
        <q-card class="goal-plan-section__cta-card" flat bordered>
          <q-card-section class="goal-plan-section__cta-content">
            <div class="goal-plan-section__cta-info">
              <q-icon name="self_improvement" color="secondary" size="40px" />
              <div class="goal-plan-section__cta-text">
                <p class="goal-plan-section__cta-title">Tu Plan Por Objetivos</p>
                <p class="goal-plan-section__cta-subtitle">{{ activeGoalPlanName }}</p>
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
        <q-card v-if="activeMetadata" class="goal-plan-section__info-card" flat bordered>
          <q-card-section>
            <div class="goal-plan-section__info-header">
              <div>
                <h3 class="goal-plan-section__goal-plan-name">
                  {{ activeGoalPlanName }}
                </h3>
                <q-badge class="goal-plan-section__tier-badge" :label="activeGoalPlanTierLabel" />
              </div>
              <q-icon name="explore" size="28px" class="goal-plan-section__icon" />
            </div>

            <p class="goal-plan-section__description">
              {{ activeMetadata.description }}
            </p>

            <!-- Zones chips -->
            <div class="goal-plan-section__zones">
              <q-chip
                v-for="zone in activeMetadata.zones"
                :key="zone"
                dense
                class="goal-plan-section__zone-chip"
              >
                {{ zone }}
              </q-chip>
            </div>

            <p v-if="activeGoalPlan.startedAt" class="goal-plan-section__since">
              Activo desde {{ formatDate(activeGoalPlan.startedAt) }}
            </p>

            <!-- Cycle Progress (only when subscription has durationDays) -->
            <div v-if="cycleStats && !cycleStats.cycleComplete" class="goal-plan-section__cycle">
              <div class="goal-plan-section__cycle-header">
                <span class="goal-plan-section__cycle-week">{{ cycleWeekLabel }}</span>
                <span class="goal-plan-section__cycle-completions">{{ completionLabel }}</span>
              </div>
              <q-linear-progress
                :value="cycleProgress"
                color="secondary"
                track-color="grey-3"
                rounded
                size="10px"
                class="goal-plan-section__cycle-bar"
              />
            </div>

            <!-- Cycle Complete Wrap-Up Card -->
            <q-card
              v-if="cycleStats && cycleStats.cycleComplete"
              class="goal-plan-section__wrapup"
              flat
              bordered
            >
              <q-card-section>
                <div class="goal-plan-section__wrapup-header">
                  <q-icon name="emoji_events" size="36px" color="secondary" />
                  <h3 class="goal-plan-section__wrapup-title">Ciclo Completo!</h3>
                </div>

                <p class="goal-plan-section__wrapup-summary">
                  Completaste
                  <strong>{{ cycleStats.totalCompletions }} sesiones</strong> en
                  {{ cycleStats.cycleWeeks }} semanas.
                </p>

                <!-- CTA -->
                <div class="goal-plan-section__wrapup-actions">
                  <q-btn
                    unelevated
                    no-caps
                    color="secondary"
                    text-color="primary"
                    class="goal-plan-section__wrapup-btn"
                    label="Consulta en recepcion para renovar"
                    icon="support_agent"
                  />
                </div>
              </q-card-section>
            </q-card>
          </q-card-section>
        </q-card>

        <!-- Archived Goal Plans (collapsible) -->
        <q-expansion-item
          v-if="archivedGoalPlans.length > 0"
          dense
          header-class="goal-plan-section__archived-header"
          expand-icon-class="goal-plan-section__archived-expand"
        >
          <template #header>
            <q-item-section>
              <q-item-label class="goal-plan-section__archived-title">
                Historial ({{ archivedGoalPlans.length }})
              </q-item-label>
            </q-item-section>
          </template>

          <div class="goal-plan-section__archived-list">
            <q-card
              v-for="(archived, index) in archivedGoalPlans"
              :key="index"
              class="goal-plan-section__archived-card"
              flat
              bordered
            >
              <q-card-section class="goal-plan-section__archived-content">
                <div class="goal-plan-section__archived-row">
                  <span class="goal-plan-section__archived-name">{{
                    getGoalPlanName(archived.goalPlanType)
                  }}</span>
                  <q-badge
                    class="goal-plan-section__archived-tier-badge"
                    :label="getGoalPlanTierLabel(archived.goalPlanType)"
                  />
                </div>

                <p class="goal-plan-section__archived-dates">
                  {{ formatDate(archived.startedAt) }} - {{ formatDate(archived.archivedAt) }}
                </p>
              </q-card-section>
            </q-card>
          </div>
        </q-expansion-item>
      </template>

      <!-- No Active Goal Plan - Info -->
      <q-card v-else class="goal-plan-section__prompt-card" flat bordered>
        <q-card-section class="goal-plan-section__prompt-content">
          <q-icon name="explore" size="40px" class="goal-plan-section__prompt-icon" />
          <h3 class="goal-plan-section__prompt-title">Planes Por Objetivos</h3>
          <p class="goal-plan-section__prompt-text">
            Tu plan no incluye un plan por objetivos activo. Consulta en recepcion para conocer los
            Planes Por Objetivos.
          </p>
        </q-card-section>
      </q-card>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * GoalPlanSection component for Mi Templo goal plans tab.
 *
 * Displays:
 * - Train CTA card with action button
 * - Active goal plan info with description, zones, and semana counters
 * - Archived history in a collapsible section
 */
import { computed } from 'vue'
import { createLogger } from 'src/utils/logger'
import TemploLoader from 'src/components/TemploLoader.vue'
import { formatDate } from 'src/utils/format-date'
import type {
  GoalPlanProgress,
  ArchivedGoalPlan,
  GoalPlanMetadata,
  GoalPlanTier,
  CycleStats,
} from 'src/modules/goal-plan/types'

createLogger('GoalPlanSection')

const props = defineProps<{
  activeGoalPlan: GoalPlanProgress | null
  archivedGoalPlans: ArchivedGoalPlan[]
  allMetadata: GoalPlanMetadata[]
  cycleStats: CycleStats | null
  loading: boolean
  error: string | null
}>()

const TIER_LABELS: Record<GoalPlanTier, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
}

const activeMetadata = computed(() => {
  if (!props.activeGoalPlan) return null
  return props.allMetadata.find((m) => m.type === props.activeGoalPlan?.goalPlanType) ?? null
})

const activeGoalPlanName = computed(() => {
  return activeMetadata.value?.name ?? props.activeGoalPlan?.goalPlanType ?? ''
})

const activeGoalPlanTierLabel = computed(() => {
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

function getGoalPlanName(goalPlanType: string): string {
  const meta = props.allMetadata.find((m) => m.type === goalPlanType)
  return meta?.name ?? goalPlanType
}

function getGoalPlanTierLabel(goalPlanType: string): string {
  const meta = props.allMetadata.find((m) => m.type === goalPlanType)
  if (!meta) return ''
  return TIER_LABELS[meta.tier] ?? ''
}
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.goal-plan-section {
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

  &__goal-plan-name {
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

  // No Goal Plan Prompt
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
    margin: 0;
  }
}
</style>
