<template>
  <q-page class="duration-picker-page">
    <div class="page-content">
      <!-- Back Button -->
      <q-btn flat dense no-caps icon="arrow_back" label="Volver" class="back-btn" @click="goBack" />

      <!-- Personalizada Context -->
      <div class="personalizada-context">
        <span class="context-label">Tu Personalizada</span>
        <h2 class="context-name">{{ personalizadaStore.activePersonalizadaName }}</h2>
      </div>

      <!-- Duration Header -->
      <h1 class="page-title">Elige la Duracion</h1>
      <p class="page-subtitle">Selecciona cuanto tiempo tienes para entrenar hoy</p>

      <!-- Duration Cards -->
      <div class="duration-cards">
        <!-- 20 Minutes -->
        <div class="duration-card" @click="onSelectDuration(20)">
          <div class="card-time">
            <span class="time-number">20</span>
            <span class="time-unit">min</span>
          </div>
          <div class="card-info">
            <h3 class="card-label">Sesion Rapida</h3>
            <p class="card-blocks">Initium + Nucleus</p>
          </div>
          <div class="card-message encouraging">
            <q-icon name="favorite" size="16px" />
            <span> Si estas cansado o con poco tiempo, es mejor hacer una sesion mas corta </span>
          </div>
          <div class="card-arrow-wrapper">
            <q-icon name="arrow_forward" size="20px" class="card-arrow" />
          </div>
        </div>

        <!-- 40 Minutes -->
        <div class="duration-card" @click="onSelectDuration(40)">
          <div class="card-time">
            <span class="time-number">40</span>
            <span class="time-unit">min</span>
          </div>
          <div class="card-info">
            <h3 class="card-label">Sesion Completa</h3>
            <p class="card-blocks">Initium + Nucleus + Deuteros</p>
          </div>
          <div class="card-arrow-wrapper">
            <q-icon name="arrow_forward" size="20px" class="card-arrow" />
          </div>
        </div>

        <!-- 60 Minutes -->
        <div class="duration-card" @click="onSelectDuration(60)">
          <div class="card-time">
            <span class="time-number">60</span>
            <span class="time-unit">min</span>
          </div>
          <div class="card-info">
            <h3 class="card-label">Sesion Extendida</h3>
            <p class="card-blocks">Initium + Nucleus + Deuteros + Athlos/Epikos</p>
          </div>
          <div class="card-arrow-wrapper">
            <q-icon name="arrow_forward" size="20px" class="card-arrow" />
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
import type { PersonalizadaDuration } from '../types'

const log = createLogger('DurationPicker')
const router = useRouter()
const personalizadaStore = usePersonalizadaStore()

function goBack(): void {
  void router.push('/personalizada')
}

function onSelectDuration(duration: PersonalizadaDuration): void {
  log.debug('Duration selected', { duration })
  personalizadaStore.setDuration(duration)
  void router.push('/personalizada/session')
}

onMounted(async () => {
  // Must have active personalizada to be here
  if (!personalizadaStore.hasActivePersonalizada) {
    if (!personalizadaStore.activePersonalizada) {
      await personalizadaStore.fetchActivePersonalizada()
    }
    if (!personalizadaStore.hasActivePersonalizada) {
      log.warn('No active personalizada, redirecting to selection')
      void router.replace('/personalizada')
      return
    }
  }

  // Ensure metadata is loaded for personalizada name display
  if (personalizadaStore.personalizadaMetadata.length === 0) {
    await personalizadaStore.fetchMetadata()
  }
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.duration-picker-page {
  background-color: #f5f2eb;
  min-height: 100vh;
}

.page-content {
  max-width: 600px;
  margin: 0 auto;
  padding: 16px 16px 48px;
}

.back-btn {
  color: #6b6b6b;
  margin-bottom: 16px;
}

/* Personalizada Context */
.personalizada-context {
  margin-bottom: 24px;
}

.context-label {
  font-size: 0.72rem;
  color: #8a9a8a;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.context-name {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.2rem;
  font-weight: 400;
  color: #2a2a2a;
  margin: 4px 0 0;
}

/* Page Header */
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
  margin: 0 0 24px;
  line-height: 1.5;
}

/* Duration Cards */
.duration-cards {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.duration-card {
  background-color: #e6e2d6;
  padding: 20px;
  cursor: pointer;
  transition: transform 0.15s ease;
  position: relative;

  &:active {
    transform: scale(0.98);
  }
}

.card-time {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 8px;
}

.time-number {
  font-family: 'Montserrat', sans-serif;
  font-size: 2rem;
  font-weight: 400;
  color: #c27a5d;
  line-height: 1;
}

.time-unit {
  font-size: 0.85rem;
  color: #8a8a8a;
  letter-spacing: 0.03em;
}

.card-info {
  margin-bottom: 8px;
}

.card-label {
  font-size: 1rem;
  font-weight: 600;
  color: #2a2a2a;
  margin: 0 0 4px;
}

.card-blocks {
  font-size: 0.82rem;
  color: #6b6b6b;
  margin: 0;
  letter-spacing: 0.02em;
}

/* Encouraging Message */
.card-message {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  margin-top: 10px;
  background-color: rgba(138, 154, 138, 0.12);

  .q-icon {
    color: #8a9a8a;
    margin-top: 2px;
    flex-shrink: 0;
  }

  span {
    font-size: 0.8rem;
    color: #5e6e5e;
    line-height: 1.5;
  }
}

.card-arrow-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.card-arrow {
  color: #c27a5d;
}
</style>
