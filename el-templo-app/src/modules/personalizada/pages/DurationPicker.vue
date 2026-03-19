<template>
  <q-page class="duration-page">
    <div class="page-content">
      <!-- Back Button -->
      <q-btn flat dense no-caps icon="arrow_back" label="Volver" class="back-btn" @click="goBack" />

      <!-- Header -->
      <div class="page-header">
        <p class="context-label">{{ personalizadaStore.activePersonalizadaName }}</p>
        <h1 class="page-title">Duracion de Sesion</h1>
        <p class="page-subtitle">Cuanto tiempo tenes para entrenar hoy?</p>
      </div>

      <!-- Duration Grid: 2 columns -->
      <div class="duration-grid">
        <!-- 20 Minutes -->
        <div class="duration-card" @click="onSelectDuration(20)">
          <div class="card-icon-wrap">
            <q-icon name="bolt" size="24px" class="card-icon" />
          </div>
          <div class="card-time">
            <span class="time-number">20</span>
            <span class="time-unit">min</span>
          </div>
          <h3 class="card-label">Rapida</h3>
          <p class="card-blocks">Initium + Nucleus</p>
          <div class="card-arrow-wrap">
            <q-icon name="arrow_forward" size="18px" class="card-arrow" />
          </div>
        </div>

        <!-- 40 Minutes -->
        <div class="duration-card" @click="onSelectDuration(40)">
          <div class="card-icon-wrap">
            <q-icon name="fitness_center" size="24px" class="card-icon" />
          </div>
          <div class="card-time">
            <span class="time-number">40</span>
            <span class="time-unit">min</span>
          </div>
          <h3 class="card-label">Completa</h3>
          <p class="card-blocks">Initium + Nucleus + Deuteros</p>
          <div class="card-arrow-wrap">
            <q-icon name="arrow_forward" size="18px" class="card-arrow" />
          </div>
        </div>

        <!-- 60 Minutes (spans bottom row, centered) -->
        <div class="duration-card duration-card--wide" @click="onSelectDuration(60)">
          <div class="card-icon-wrap">
            <q-icon name="local_fire_department" size="24px" class="card-icon" />
          </div>
          <div class="card-time">
            <span class="time-number">60</span>
            <span class="time-unit">min</span>
          </div>
          <h3 class="card-label">Extendida</h3>
          <p class="card-blocks">Initium + Nucleus + Deuteros + Athlos/Epikos</p>
          <div class="card-arrow-wrap">
            <q-icon name="arrow_forward" size="18px" class="card-arrow" />
          </div>
        </div>
      </div>

      <!-- Encouraging Note -->
      <div class="encouragement">
        <q-icon name="favorite" size="16px" class="encouragement-icon" />
        <span>
          Si estas cansado o con poco tiempo, es mejor hacer una sesion corta que no hacer nada
        </span>
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

  if (personalizadaStore.personalizadaMetadata.length === 0) {
    await personalizadaStore.fetchMetadata()
  }
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.duration-page {
  background-color: $cream;
  min-height: 100vh;
}

.page-content {
  max-width: 600px;
  margin: 0 auto;
  padding: 16px 16px 48px;
}

.back-btn {
  color: rgba($accent, 0.5);
  margin-bottom: 12px;
}

.page-header {
  margin-bottom: 24px;
}

.context-label {
  font-size: 0.75rem;
  color: $secondary;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  margin: 0 0 4px;
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

/* 2-column grid */
.duration-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;
}

.duration-card {
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
    border-color: $primary;
  }

  &--wide {
    grid-column: 1 / -1;
    max-width: calc(50% - 6px);
    justify-self: center;
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

.card-time {
  display: flex;
  align-items: baseline;
  gap: 3px;
  margin-bottom: 6px;
}

.time-number {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.8rem;
  font-weight: 600;
  color: $primary;
  line-height: 1;
}

.time-unit {
  font-size: 0.8rem;
  color: rgba($accent, 0.4);
  letter-spacing: 0.03em;
}

.card-label {
  font-family: 'Montserrat', sans-serif;
  font-size: 0.95rem;
  font-weight: 600;
  color: $accent;
  margin: 0 0 4px;
}

.card-blocks {
  font-size: 0.75rem;
  color: rgba($accent, 0.5);
  margin: 0;
  line-height: 1.4;
  flex: 1;
}

.card-arrow-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.card-arrow {
  color: rgba($accent, 0.3);
}

/* Encouraging note */
.encouragement {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  background-color: rgba($secondary, 0.08);
  border-radius: 10px;
}

.encouragement-icon {
  color: $secondary;
  margin-top: 2px;
  flex-shrink: 0;
}

.encouragement span {
  font-size: 0.8rem;
  color: rgba($accent, 0.6);
  line-height: 1.5;
}
</style>
