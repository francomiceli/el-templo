<template>
  <q-page class="journey-selection-page">
    <div class="page-content">
      <!-- Header -->
      <div class="page-header">
        <h1 class="page-title">Elige tu Journey</h1>
        <p class="page-subtitle">
          Selecciona una ruta de entrenamiento personalizada segun tus objetivos
        </p>
      </div>

      <!-- Active Journey Banner -->
      <div v-if="journeyStore.hasActiveJourney" class="active-journey-banner">
        <div class="banner-content">
          <q-icon name="explore" size="24px" class="banner-icon" />
          <div class="banner-text">
            <span class="banner-label">Tu Journey Actual</span>
            <span class="banner-name">{{ journeyStore.activeJourneyName }}</span>
          </div>
        </div>
        <div class="banner-actions">
          <q-btn
            flat
            dense
            no-caps
            class="banner-btn"
            label="Continuar"
            @click="onContinueActiveJourney"
          />
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="journeyStore.loading" class="text-center q-pa-xl">
        <q-spinner-dots size="40px" color="grey-6" />
      </div>

      <!-- Error State -->
      <div v-else-if="journeyStore.error" class="text-center q-pa-xl">
        <q-icon name="error_outline" size="48px" color="grey-6" />
        <p class="q-mt-md text-grey-7">{{ journeyStore.error }}</p>
        <q-btn flat color="primary" label="Reintentar" @click="loadData" />
      </div>

      <!-- Journey Tiers -->
      <template v-else>
        <div v-for="tier in tiers" :key="tier.key" class="tier-section">
          <div class="tier-header">
            <span class="tier-label">{{ tier.label }}</span>
            <span class="tier-divider" />
          </div>

          <div class="tier-journeys">
            <div
              v-for="journey in getJourneysByTier(tier.key)"
              :key="journey.type"
              class="journey-card"
              @click="onSelectJourney(journey.type)"
            >
              <div class="card-header">
                <h3 class="card-title">{{ journey.name }}</h3>
                <q-badge v-if="isActiveJourney(journey.type)" class="active-badge" label="Activo" />
              </div>

              <div class="card-zones">
                <span v-for="zone in journey.zones" :key="zone" class="zone-badge">
                  {{ zone }}
                </span>
              </div>

              <p class="card-description">
                {{ truncateDescription(journey.description) }}
              </p>

              <div class="card-footer">
                <q-icon name="arrow_forward" size="20px" class="card-arrow" />
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { createLogger } from 'src/utils/logger'
import { useJourneyStore } from '../stores/journeyStore'
import type { JourneyType, JourneyTier } from '../types'

const log = createLogger('JourneySelection')
const router = useRouter()
const journeyStore = useJourneyStore()

const tiers: { key: JourneyTier; label: string }[] = [
  { key: 'principiante', label: 'Principiante' },
  { key: 'intermedio', label: 'Intermedio' },
  { key: 'avanzado', label: 'Avanzado' },
]

function getJourneysByTier(tier: JourneyTier) {
  return journeyStore.journeyMetadata.filter((j) => j.tier === tier)
}

function isActiveJourney(type: JourneyType): boolean {
  return journeyStore.activeJourney?.journeyType === type
}

function truncateDescription(desc: string): string {
  const maxLen = 100
  if (desc.length <= maxLen) return desc
  return desc.substring(0, maxLen).trimEnd() + '...'
}

function onSelectJourney(type: JourneyType): void {
  log.debug('Journey selected for overview', { type })
  void router.push(`/journey/overview/${type}`)
}

function onContinueActiveJourney(): void {
  void router.push('/journey/duration')
}

async function loadData(): Promise<void> {
  await Promise.all([journeyStore.fetchMetadata(), journeyStore.fetchActiveJourney()])
}

onMounted(() => {
  void loadData()
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.journey-selection-page {
  background-color: #f5f2eb;
  min-height: 100vh;
}

.page-content {
  max-width: 600px;
  margin: 0 auto;
  padding: 24px 16px 32px;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.6rem;
  font-weight: 400;
  color: #2a2a2a;
  letter-spacing: -0.02em;
  margin: 0 0 8px;
}

.page-subtitle {
  font-size: 0.9rem;
  color: #6b6b6b;
  letter-spacing: 0.03em;
  margin: 0;
  line-height: 1.5;
}

/* Active Journey Banner */
.active-journey-banner {
  background-color: #e6e2d6;
  padding: 16px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.banner-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.banner-icon {
  color: #c27a5d;
}

.banner-text {
  display: flex;
  flex-direction: column;
}

.banner-label {
  font-size: 0.75rem;
  color: #6b6b6b;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.banner-name {
  font-family: 'Montserrat', sans-serif;
  font-size: 1rem;
  color: #2a2a2a;
  font-weight: 500;
}

.banner-btn {
  color: #c27a5d;
  font-weight: 600;
  letter-spacing: 0.05em;
}

/* Tier Sections */
.tier-section {
  margin-bottom: 28px;
}

.tier-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.tier-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #8a9a8a;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  white-space: nowrap;
}

.tier-divider {
  flex: 1;
  height: 1px;
  background-color: #d4d0c6;
}

/* Journey Cards */
.tier-journeys {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.journey-card {
  background-color: #e6e2d6;
  padding: 20px;
  cursor: pointer;
  transition: transform 0.15s ease;
  position: relative;

  &:active {
    transform: scale(0.98);
  }
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.card-title {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.15rem;
  font-weight: 400;
  color: #2a2a2a;
  margin: 0;
  letter-spacing: -0.01em;
}

.active-badge {
  background-color: #c27a5d !important;
  color: white;
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 2px 8px;
}

.card-zones {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.zone-badge {
  background-color: rgba(138, 154, 138, 0.2);
  color: #5e6e5e;
  font-size: 0.72rem;
  padding: 2px 8px;
  letter-spacing: 0.03em;
}

.card-description {
  font-size: 0.85rem;
  color: #5a5a5a;
  line-height: 1.5;
  margin: 0 0 12px;
}

.card-footer {
  display: flex;
  justify-content: flex-end;
}

.card-arrow {
  color: #c27a5d;
}
</style>
