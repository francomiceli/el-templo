<template>
  <q-page class="personalizada-page">
    <div class="page-content">
      <!-- Header -->
      <div class="page-header">
        <h1 class="page-title">Clases Personalizadas</h1>
        <p class="page-subtitle">Elige una ruta de entrenamiento enfocada en tus objetivos</p>
      </div>

      <!-- Loading State -->
      <div v-if="personalizadaStore.loading" class="loading-state">
        <q-spinner-dots size="40px" color="secondary" />
      </div>

      <!-- Error State -->
      <div v-else-if="personalizadaStore.error" class="error-state">
        <q-icon name="error_outline" size="48px" color="grey-6" />
        <p class="error-text">{{ personalizadaStore.error }}</p>
        <q-btn flat no-caps color="primary" label="Reintentar" @click="loadData" />
      </div>

      <!-- Personalizada Grid -->
      <div v-else class="personalizada-grid">
        <div
          v-for="personalizada in personalizadaStore.personalizadaMetadata"
          :key="personalizada.type"
          class="personalizada-card"
          :class="{ 'personalizada-card--active': isActive(personalizada.type) }"
          @click="onSelectPersonalizada(personalizada.type)"
        >
          <!-- Card Icon -->
          <div class="card-icon-wrap">
            <q-icon :name="getIcon(personalizada.type)" size="28px" class="card-icon" />
          </div>

          <!-- Card Name -->
          <h3 class="card-name">{{ personalizada.name }}</h3>

          <!-- Zone Tags -->
          <div class="card-zones">
            <span v-for="zone in personalizada.zones" :key="zone" class="zone-tag">
              {{ zone }}
            </span>
          </div>

          <!-- Continue button for active personalizada -->
          <q-btn
            v-if="isActive(personalizada.type)"
            unelevated
            no-caps
            dense
            color="primary"
            text-color="white"
            label="Continuar"
            icon-right="arrow_forward"
            class="card-continue-btn"
            @click.stop="onContinue"
          />

          <!-- Arrow for non-active -->
          <div v-else class="card-arrow-wrap">
            <q-icon name="arrow_forward" size="18px" class="card-arrow" />
          </div>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { createLogger } from 'src/utils/logger'
import { usePersonalizadaStore } from '../stores/personalizadaStore'
import type { PersonalizadaType } from '../types'

const log = createLogger('PersonalizadaSelection')
const router = useRouter()
const personalizadaStore = usePersonalizadaStore()

const ICONS: Record<PersonalizadaType, string> = {
  tren_superior: 'accessibility_new',
  tren_inferior: 'directions_run',
  empuje: 'fitness_center',
  traccion: 'sports_gymnastics',
  planche: 'self_improvement',
  front_lever: 'iron',
}

function getIcon(type: PersonalizadaType): string {
  return ICONS[type] ?? 'explore'
}

function isActive(type: PersonalizadaType): boolean {
  return personalizadaStore.activePersonalizada?.personalizadaType === type
}

function onSelectPersonalizada(type: PersonalizadaType): void {
  log.debug('Personalizada selected for overview', { type })
  void router.push(`/personalizada/overview/${type}`)
}

function onContinue(): void {
  void router.push('/personalizada/duration')
}

async function loadData(): Promise<void> {
  await Promise.all([
    personalizadaStore.fetchMetadata(),
    personalizadaStore.fetchActivePersonalizada(),
  ])
}

onMounted(() => {
  void loadData()
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.personalizada-page {
  background-color: $cream;
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
  font-size: 1.5rem;
  font-weight: 600;
  color: $accent;
  letter-spacing: -0.02em;
  margin: 0 0 6px;
}

.page-subtitle {
  font-size: 0.85rem;
  color: rgba($accent, 0.6);
  margin: 0;
  line-height: 1.5;
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  text-align: center;
}

.error-text {
  font-size: 0.85rem;
  color: rgba($accent, 0.6);
  margin: 12px 0;
}

/* 2-column, 3-row grid */
.personalizada-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

/* Card */
.personalizada-card {
  background-color: white;
  border: 1px solid rgba($secondary, 0.2);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease;

  &:active {
    transform: scale(0.97);
  }

  &--active {
    border-color: $primary;
    background-color: rgba($primary, 0.04);
  }
}

.card-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background-color: rgba($secondary, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.card-icon {
  color: $secondary;
}

.personalizada-card--active .card-icon-wrap {
  background-color: rgba($primary, 0.12);
}

.personalizada-card--active .card-icon {
  color: $primary;
}

.card-name {
  font-family: 'Montserrat', sans-serif;
  font-size: 0.95rem;
  font-weight: 600;
  color: $accent;
  margin: 0 0 8px;
  line-height: 1.3;
}

.card-zones {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 12px;
  flex: 1;
}

.zone-tag {
  background-color: rgba($secondary, 0.1);
  color: $secondary;
  font-size: 0.65rem;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.02em;
}

.card-continue-btn {
  width: 100%;
  font-size: 0.8rem;
  margin-top: auto;
}

.card-arrow-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: auto;
}

.card-arrow {
  color: rgba($accent, 0.3);
}
</style>
