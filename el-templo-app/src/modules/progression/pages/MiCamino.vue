<template>
  <q-page class="mi-camino">
    <!-- Loading State -->
    <div
      v-if="progressionStore.loading || personalizadaProgress.loading.value"
      class="mi-camino__loading"
    >
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

    <!-- Empty State (new user with no sessions) -->
    <div v-else-if="isEmptyState" class="mi-camino__empty">
      <FlameIcon size="md" />
      <p class="mi-camino__empty-title">Comienza Tu Camino</p>
      <p class="mi-camino__empty-text">
        Completa tu primera sesion de entrenamiento para ver tu progreso aqui.
      </p>
      <q-btn color="primary" unelevated no-caps to="/training"> Ir a Entrenar </q-btn>
    </div>

    <!-- Content State -->
    <div v-else class="mi-camino__content">
      <!-- Welcome Header (shared, always visible) -->
      <div class="mi-camino__welcome">
        <div class="mi-camino__welcome-text">
          <p class="mi-camino__greeting">Bienvenido,</p>
          <h1 class="mi-camino__name">{{ userName }}</h1>
          <p class="mi-camino__date">{{ todayFormatted }}</p>
        </div>
        <LevelDisplay
          v-if="progressionStore.level"
          :greek-letter="progressionStore.level.greekLetter"
          :level-name="progressionStore.level.displayName"
          class="mi-camino__level-badge"
        />
      </div>

      <!-- Tabs (only shown when user has personalizada data) -->
      <q-tabs
        v-if="showTabs"
        v-model="activeTab"
        dense
        class="mi-camino__tabs"
        active-color="primary"
        indicator-color="secondary"
        align="left"
        no-caps
      >
        <q-tab name="general" label="Entrenamiento" />
        <q-tab name="personalizadas" label="Personalizadas" />
      </q-tabs>

      <q-tab-panels v-if="showTabs" v-model="activeTab" animated class="mi-camino__panels">
        <q-tab-panel name="general" class="mi-camino__panel">
          <GeneralContent
            :today-completed="todayCompleted"
            :today-session="progressionStore.todaySession"
            :stats="progressionStore.stats"
            :rpe-trend="progressionStore.rpeTrend"
            :evaluation="progressionStore.evaluation"
            @request-evaluation="handleRequestEvaluation"
          />
        </q-tab-panel>

        <q-tab-panel name="personalizadas" class="mi-camino__panel">
          <PersonalizadaSection
            :active-personalizada="personalizadaProgress.activePersonalizada.value"
            :archived-personalizadas="personalizadaProgress.archivedPersonalizadas.value"
            :all-metadata="personalizadaProgress.allMetadata.value"
            :cycle-stats="personalizadaProgress.cycleStats.value"
            :loading="false"
            :error="personalizadaProgress.error.value"
          />
        </q-tab-panel>
      </q-tab-panels>

      <!-- No tabs: just general content -->
      <GeneralContent
        v-if="!showTabs"
        :today-completed="todayCompleted"
        :today-session="progressionStore.todaySession"
        :stats="progressionStore.stats"
        :rpe-trend="progressionStore.rpeTrend"
        :evaluation="progressionStore.evaluation"
        @request-evaluation="handleRequestEvaluation"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
/**
 * MiCamino page
 *
 * Main progression tracking page with two modes:
 * - Regular users: single view with training stats, RPE, evaluation
 * - Personalizada users: tabs for General (training) and Personalizadas
 *
 * Tab visibility is automatic — shows tabs only when user has active
 * or archived personalizadas.
 */
import { ref, computed, onMounted } from 'vue'
import FlameIcon from 'src/components/FlameIcon.vue'
import { useProgressionStore } from '../stores/progressionStore'
import { useProgressionApi } from '../composables/useProgressionApi'
import { usePersonalizadaProgress } from '../composables/usePersonalizadaProgress'
import { useUserStore } from 'src/stores/useUserStore'
import LevelDisplay from '../components/LevelDisplay.vue'
import GeneralContent from '../components/GeneralContent.vue'
import PersonalizadaSection from '../components/PersonalizadaSection.vue'

const progressionStore = useProgressionStore()
const userStore = useUserStore()
const { fetchStats, requestEvaluation } = useProgressionApi()
const personalizadaProgress = usePersonalizadaProgress()

const activeTab = ref('general')

/**
 * Show tabs when user has any personalizada data (active or archived)
 */
const showTabs = computed(() => {
  return (
    personalizadaProgress.activePersonalizada.value !== null ||
    personalizadaProgress.archivedPersonalizadas.value.length > 0
  )
})

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

const isEmptyState = computed(() => {
  if (personalizadaProgress.activePersonalizada.value) return false
  if (progressionStore.stats && progressionStore.stats.totalSessions > 0) return false
  if (progressionStore.stats && progressionStore.stats.totalSessions === 0) return true
  return !progressionStore.level && !progressionStore.stats && !progressionStore.error
})

async function handleRequestEvaluation() {
  await requestEvaluation()
}

onMounted(async () => {
  fetchStats()
  await personalizadaProgress.fetchPersonalizadaData()
  // Default to Personalizadas tab when member has an active personalizada
  if (personalizadaProgress.activePersonalizada.value) {
    activeTab.value = 'personalizadas'
  }
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.mi-camino {
  padding: 16px;
  background-color: $cream;

  &__loading,
  &__error,
  &__empty {
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

  &__empty-title {
    font-family: 'Montserrat', sans-serif;
    font-size: 20px;
    font-weight: 600;
    color: $primary;
    margin: 0 0 8px;
  }

  &__empty-text {
    font-size: 14px;
    color: rgba($primary, 0.7);
    margin: 0 0 20px;
    max-width: 280px;
    line-height: 1.5;
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__welcome {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
  }

  &__welcome-text {
    flex: 1;
  }

  &__greeting {
    font-size: 14px;
    color: rgba($primary, 0.6);
    margin: 0 0 2px;
  }

  &__name {
    font-family: 'Montserrat', sans-serif;
    font-size: 24px;
    font-weight: 600;
    color: $primary;
    margin: 0 0 4px;
  }

  &__date {
    font-size: 13px;
    color: rgba($primary, 0.7);
    margin: 0;
  }

  &__level-badge {
    flex-shrink: 0;
    margin-left: 16px;
  }

  &__tabs {
    margin: -8px -4px 0;

    :deep(.q-tab) {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 13px;
      letter-spacing: 0.02em;
    }
  }

  &__panels {
    background: transparent;
  }

  &__panel {
    padding: 0;
  }
}
</style>
