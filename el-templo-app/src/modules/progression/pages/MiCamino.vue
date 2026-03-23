<template>
  <q-page class="mi-camino">
    <!-- Loading State -->
    <div v-if="progressionStore.loading" class="mi-camino__loading">
      <q-spinner color="primary" size="60px" />
      <div class="mi-camino__loading-row">
        <FlameIcon size="xs" />
        <p class="mi-camino__loading-text">Cargando tu progreso...</p>
        <FlameIcon size="xs" />
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="progressionStore.error" class="mi-camino__error">
      <q-icon name="error_outline" class="mi-camino__error-icon" />
      <p class="mi-camino__error-text">{{ progressionStore.error }}</p>
      <q-btn color="primary" unelevated no-caps @click="fetchStats"> Reintentar </q-btn>
    </div>

    <!-- Content State -->
    <div v-else class="mi-camino__content">
      <!-- Welcome Header -->
      <div class="mi-camino__welcome">
        <div class="mi-camino__welcome-circles">
          <div class="mi-camino__circle mi-camino__circle--sm" />
          <div class="mi-camino__circle mi-camino__circle--md" />
          <div class="mi-camino__circle mi-camino__circle--lg" />
        </div>
        <div class="mi-camino__welcome-inner">
          <div class="mi-camino__welcome-text">
            <p class="mi-camino__greeting">Bienvenido,</p>
            <p class="mi-camino__name">{{ userName }}</p>
            <p class="mi-camino__date">{{ todayFormatted }}</p>
          </div>
          <div v-if="progressionStore.level" class="mi-camino__level-badge">
            <span class="mi-camino__level-letter">{{ progressionStore.level.greekLetter }}</span>
            <span class="mi-camino__level-name">{{ progressionStore.level.displayName }}</span>
          </div>
        </div>
      </div>

      <GeneralContent
        :today-completed="todayCompleted"
        :today-session="progressionStore.todaySession"
        :stats="progressionStore.stats"
        :rpe-trend="progressionStore.rpeTrend"
        :evaluation="progressionStore.evaluation"
        :show-reserva-cta="showReservaCta"
        @request-evaluation="handleRequestEvaluation"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
/**
 * MiCamino page — progression tracking with GeneralContent.
 * "Tu Sesion de Hoy" CTA routes to /training which handles both
 * regular and personalizada sessions.
 */
import { computed, onMounted } from 'vue'
import FlameIcon from 'src/components/FlameIcon.vue'
import { useProgressionStore } from '../stores/progressionStore'
import { useProgressionApi } from '../composables/useProgressionApi'
import { useUserStore } from 'src/stores/useUserStore'
import GeneralContent from '../components/GeneralContent.vue'

const progressionStore = useProgressionStore()
const userStore = useUserStore()
const { fetchStats, requestEvaluation } = useProgressionApi()

const userName = computed(() => {
  return userStore.fullName || 'Atleta'
})

const todayFormatted = computed(() => {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }
  const date = new Date().toLocaleDateString('es-ES', options)
  return date.charAt(0).toUpperCase() + date.slice(1)
})

const todayCompleted = computed(() => {
  return progressionStore.todaySession?.completed ?? false
})

const showReservaCta = computed(() => {
  return !userStore.profile?.branchIsVirtual
})

async function handleRequestEvaluation() {
  await requestEvaluation()
}

onMounted(() => {
  fetchStats()
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.mi-camino {
  padding: 16px;
  background-color: $cream;

  &__loading,
  &__error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    text-align: center;
    padding: 24px;
  }

  &__loading-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
  }

  &__loading-text {
    margin: 0;
    font-size: 14px;
    color: rgba($primary, 0.7);
  }

  &__error-icon {
    font-size: 64px;
    color: $negative;
    margin-bottom: 16px;
  }

  &__error-text {
    font-size: 14px;
    color: rgba($primary, 0.8);
    margin-bottom: 16px;
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__welcome {
    background: linear-gradient(135deg, $primary 0%, $secondary 100%);
    border-radius: 16px;
    padding: 22px 20px;
    position: relative;
    overflow: hidden;
  }

  &__welcome-circles {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  &__circle {
    position: absolute;
    border-radius: 50%;
    border: 1px solid;

    &--sm {
      width: 100px;
      height: 100px;
      top: -20px;
      right: -20px;
      border-color: rgba($bronze-light, 0.12);
    }

    &--md {
      width: 140px;
      height: 140px;
      top: -40px;
      right: -40px;
      border-color: rgba($bronze-light, 0.06);
    }

    &--lg {
      width: 180px;
      height: 180px;
      top: -60px;
      right: -60px;
      border-color: rgba($bronze-light, 0.03);
    }
  }

  &__welcome-inner {
    position: relative;
    z-index: 1;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__welcome-text {
    flex: 1;
  }

  &__greeting {
    font-size: 13px;
    color: rgba($cream, 0.6);
    margin: 0 0 4px;
    font-weight: 400;
  }

  &__name {
    font-family: 'Montserrat', sans-serif;
    font-size: 22px;
    font-weight: 600;
    color: $cream;
    margin: 0 0 8px;
    line-height: 1.1;
  }

  &__date {
    font-size: 12px;
    color: rgba($cream, 0.45);
    margin: 0;
  }

  &__level-badge {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    background: rgba($bronze-light, 0.15);
    border: 1px solid rgba($bronze-light, 0.25);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-left: 16px;
  }

  &__level-letter {
    font-size: 22px;
    font-weight: 300;
    color: $bronze-light;
    font-family: serif;
    line-height: 1;
  }

  &__level-name {
    font-size: 8px;
    letter-spacing: 1.5px;
    color: rgba($bronze-light, 0.7);
    margin-top: 1px;
    text-transform: uppercase;
  }
}
</style>
